#!/usr/bin/env node
/**
 * Verify that the deployed frontend actually serves the code you think it does.
 *
 * Motivation: deploys of this repo are "build local + scp dist" (never build on
 * Lightsail), and more than once a green deploy served a stale bundle — the
 * healthcheck only proves the server is up, not which JS the browser gets.
 * Static greps of the local dist confirm the build; this script confirms the
 * LIVE site.
 *
 * What it does:
 *   1. Fetches the index.html from --base (default https://emaus.cc).
 *   2. Collects every /assets/*.js it references (script tags + modulepreload).
 *   3. BFS-discovers lazy chunks referenced from within those files
 *      (Vite names them `Name-<8charhash>.js`) and downloads them in batches.
 *   4. Greps every marker string across index.html + all JS.
 *   5. Prints, per marker, the asset where it was found; exits 1 if any marker
 *      is missing or if no JS asset was found at all (broken index / SPA shell).
 *
 * Usage:
 *   node scripts/verify-deploy.mjs "Cartas Recibidas" "palancasReceivedCount"
 *   node scripts/verify-deploy.mjs --base http://localhost:5173 "some marker"
 *
 * Zero dependencies (Node >= 18 global fetch). Markers are matched as plain
 * substrings; keep them accent-free to survive any future minifier escaping.
 */

const DEFAULT_BASE = 'https://emaus.cc';
const BATCH_SIZE = 8;
const FETCH_TIMEOUT_MS = 20000;
/** Safety valve: a stale/HTML-fallback origin can otherwise fan out forever. */
const MAX_ASSETS = 600;

const parseArgs = (argv) => {
	const markers = [];
	let base = DEFAULT_BASE;
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg === '--base') {
			base = argv[++i];
			if (!base) throw new Error('--base requires a URL');
		} else if (arg === '--help' || arg === '-h') {
			base = null; // signal help
		} else if (arg.startsWith('--')) {
			throw new Error(`Unknown flag: ${arg}`);
		} else {
			markers.push(arg);
		}
	}
	return { base, markers };
};

const fetchText = async (url) => {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
	try {
		const res = await fetch(url, {
			signal: controller.signal,
			// Some CDNs/origins reject the default node UA.
			headers: { 'User-Agent': 'emaus-verify-deploy/1.0' },
		});
		if (!res.ok) throw new Error(`HTTP ${res.status}`);
		return await res.text();
	} finally {
		clearTimeout(timer);
	}
};

/**
 * Vite chunk reference: "SomeChunk-a1b2c3d8.js" (8-char hash). One single
 * character class with ONE quantifier, on purpose: stacking two overlapping
 * quantifiers (e.g. `[\w.-]*[A-Za-z0-9_-]+`) makes the engine backtrack
 * catastrophically on megabyte bundles — 100% CPU for minutes with zero
 * matches (found live against the 2.7MB vendor chunk).
 */
const CHUNK_REF_RE = /[A-Za-z0-9_.-]+-[A-Za-z0-9_]{8}\.js/g;

const main = async () => {
	const { base, markers } = parseArgs(process.argv.slice(2));
	if (base === null || markers.length === 0) {
		console.log(
			[
				'Usage: node scripts/verify-deploy.mjs [--base URL] "marker 1" "marker 2" ...',
				`  --base  site origin to verify (default ${DEFAULT_BASE})`,
				'Checks that every marker string appears in the live index.html or any',
				'served JS asset (entry + discovered lazy chunks). Exits 1 on a missing',
				'marker or if no JS asset is found.',
			].join('\n'),
		);
		process.exit(base === null ? 0 : 1);
	}

	console.log(`Verifying ${base} (${markers.length} markers)...`);
	const indexUrl = `${base.replace(/\/$/, '')}/`;
	const indexHtml = await fetchText(indexUrl);

	// --- Collect JS assets referenced by the index (src=/href= pointing at .js).
	const indexAssets = new Set();
	for (const m of indexHtml.matchAll(/(?:src|href)="([^"]+\.js[^"]*)"/g)) {
		const ref = m[1];
		if (ref.startsWith('http') && !ref.startsWith(base)) continue;
		indexAssets.add(new URL(ref, indexUrl).pathname);
	}

	// --- BFS over lazy chunk references found inside downloaded JS.
	const contents = new Map(); // pathname -> text
	const queue = [...indexAssets];
	const failed = [];
	while (queue.length > 0) {
		if (contents.size >= MAX_ASSETS) {
			console.warn(`WARN: stopping discovery at ${MAX_ASSETS} assets (queue had ${queue.length} left)`);
			queue.length = 0;
			break;
		}
		const batch = queue.splice(0, BATCH_SIZE);
		// Progress to stderr so `verify-deploy.mjs > report.txt` stays clean.
		process.stderr.write(`  fetched ${contents.size + batch.length}, ${queue.length} queued\r`);
		const texts = await Promise.all(
			batch.map(async (path) => {
				try {
					return [path, await fetchText(new URL(path, indexUrl).href)];
				} catch (e) {
					failed.push(`${path} (${e.message})`);
					return [path, ''];
				}
			}),
		);
		for (const [path, text] of texts) {
			contents.set(path, text);
			for (const ref of text.match(CHUNK_REF_RE) ?? []) {
				// References are emitted relative to /assets/ (e.g. "./Foo-hash.js").
				const clean = ref.replace(/^\.?\//, '');
				const assetPath = clean.startsWith('assets/') ? `/${clean}` : `/assets/${clean}`;
				if (!contents.has(assetPath) && !queue.includes(assetPath)) {
					queue.push(assetPath);
				}
			}
		}
	}

	const assets = [...contents.keys()].filter((p) => contents.get(p) !== '');
	if (assets.length === 0) {
		console.error(`FAIL: no JS asset could be read from ${indexUrl}`);
		if (failed.length) console.error(`  failed requests: ${failed.join(', ')}`);
		process.exit(1);
	}
	console.log(`Downloaded ${assets.length} JS assets (+ index.html).`);
	if (failed.length) {
		console.warn(`WARN: ${failed.length} asset(s) failed to download: ${failed.join(', ')}`);
	}

	// --- Grep markers across index.html + every asset.
	let missing = 0;
	for (const marker of markers) {
		const where = [
			...(indexHtml.includes(marker) ? ['index.html'] : []),
			...assets.filter((p) => contents.get(p).includes(marker)),
		];
		if (where.length === 0) {
			missing++;
			console.error(`MISSING: "${marker}" not found in any served asset`);
		} else {
			console.log(`found:   "${marker}" -> ${where.join(', ')}`);
		}
	}

	if (missing > 0) {
		console.error(`\nFAIL: ${missing}/${markers.length} marker(s) missing on ${base}`);
		process.exit(1);
	}
	console.log(`\nOK: all ${markers.length} marker(s) present on ${base}`);
};

main().catch((e) => {
	console.error(`FAIL: ${e.message}`);
	process.exit(1);
});
