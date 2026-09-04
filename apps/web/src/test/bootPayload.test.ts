import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, resolve } from 'path';

/**
 * What the app downloads just for booting, regardless of the page opened.
 *
 * Two third-party scripts used to be fetched on boot by every page — Google
 * Maps with the places library (~1.5 MB decoded) and reCAPTCHA (~0.8 MB) — so
 * the terms page, the privacy notice and the projected minute-by-minute all
 * paid for them. On a phone that competes with the app's own bundle for parse
 * time and memory, which is the same shape of problem as the 7.7 MB city
 * catalogue (see `components/form/__tests__/addressStepWeight.test.ts`).
 *
 * Maps is now loaded by the three screens that use it, and reCAPTCHA when the
 * visitor focuses a form field (see `test/unit/services/recaptcha.test.ts`).
 */

// `__dirname` like the other tests in this folder: under Vitest, `import.meta.url`
// does not come back as a file: URL for files under `src/test/`.
const SRC = resolve(__dirname, '..');

const read = (relative: string) => readFileSync(join(SRC, relative), 'utf-8');

/** Strips comments: naming a function in prose is not calling it. */
const code = (source: string) =>
	source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

function walk(dir: string, out: string[] = []): string[] {
	for (const entry of readdirSync(dir)) {
		if (entry === 'node_modules' || entry === '__tests__' || entry === 'test') continue;
		const full = join(dir, entry);
		if (statSync(full).isDirectory()) walk(full, out);
		else if (/\.(ts|vue)$/.test(entry)) out.push(full);
	}
	return out;
}

describe('boot payload', () => {
	it('does not pull Google Maps into the boot path', () => {
		const main = code(read('main.ts'));
		expect(main).not.toMatch(/loadGoogleMaps/);
		expect(main).not.toMatch(/maps\.googleapis\.com/);
	});

	// Removing the boot-time preload is only safe while every consumer loads the
	// script itself. `loadGoogleMaps()` caches its promise, so calling it in each
	// screen costs nothing; forgetting to call it fails at runtime only, and only
	// on the screen that forgot.
	it('every screen using google.maps loads it first', () => {
		const offenders = walk(SRC)
			.filter((file) => !file.endsWith('utils/googleMaps.ts'))
			.filter((file) => {
				const source = code(readFileSync(file, 'utf-8'));
				// Type-only mentions (`google.maps.Map | null`) never touch the runtime.
				const usesAtRuntime =
					/\bgoogle\.maps\.(importLibrary|Geocoder|Map\(|Marker|places|event)/.test(source) ||
					/new google\.maps\./.test(source);
				return usesAtRuntime && !source.includes('loadGoogleMaps(');
			})
			.map((file) => file.replace(SRC, ''));

		expect(offenders, `Estas pantallas usan google.maps sin cargarlo: ${offenders.join(', ')}`).toEqual(
			[],
		);
	});

	it('reCAPTCHA is not fetched at install time', () => {
		const service = code(read('services/recaptcha.ts'));
		const start = service.indexOf('export function installRecaptcha');
		const body = service.slice(start, service.indexOf('\n}', start));
		// The install hook may arm the lazy load, but must not fetch on the spot.
		expect(body).toMatch(/warmOnFirstFieldFocus\(\)/);
		expect(body).not.toMatch(/loadRecaptchaScript\(/);
	});
});
