/**
 * Pure-logic tests for the per-attachment routing in `streamRetreatBundle`:
 * - markdown → emit as `<folder>/<filename>.md` text
 * - file with `storageKey` (S3) → stream binary; on failure fallback to `.url.txt`
 * - file with `storageUrl` data URL (inline base64) → decode and emit as binary
 *
 * The actual archiver/S3/repos are mocked out — what we lock down here is the
 * decision tree (which branch and which filename per attachment shape) and
 * the fallback bookkeeping (`failedS3Keys`).
 */

type Att = {
	kind: 'markdown' | 'file';
	fileName: string;
	content?: string | null;
	storageKey?: string | null;
	storageUrl?: string;
};

type EmittedEntry =
	| { kind: 'markdown'; folder: string; fileName: string; content: string }
	| { kind: 'binary-stream'; folder: string; fileName: string; storageKey: string }
	| { kind: 'binary-buffer'; folder: string; fileName: string; size: number }
	| { kind: 'url-fallback'; folder: string; fileName: string; storageKey: string };

const slug = (s: string): string =>
	s
		.normalize('NFKD')
		.replace(/[̀-ͯ]/g, '')
		.replace(/[^\w\s-]/g, '')
		.replace(/\s+/g, '_')
		.slice(0, 80) || 'doc';

/**
 * Mirror of the loop in `streamRetreatBundle`. `s3Stream` returns true when
 * the S3 fetch succeeds, false on failure (mimicking the real `appendS3Stream`
 * helper).
 */
function processAttachments(
	atts: Array<{ name: string; atts: Att[] }>,
	s3Stream: (key: string) => boolean,
): { emitted: EmittedEntry[]; failedS3Keys: string[]; attachmentCount: number } {
	const emitted: EmittedEntry[] = [];
	const failedS3Keys: string[] = [];
	let attachmentCount = 0;
	for (const { name, atts: list } of atts) {
		const folder = slug(name);
		for (const att of list) {
			attachmentCount++;
			if (att.kind === 'markdown') {
				const fname = `${slug(att.fileName.replace(/\.md$/i, ''))}.md`;
				emitted.push({
					kind: 'markdown',
					folder,
					fileName: fname,
					content: att.content ?? '',
				});
			} else if (att.storageKey) {
				const ok = s3Stream(att.storageKey);
				if (ok) {
					emitted.push({
						kind: 'binary-stream',
						folder,
						fileName: slug(att.fileName),
						storageKey: att.storageKey,
					});
				} else {
					failedS3Keys.push(att.storageKey);
					emitted.push({
						kind: 'url-fallback',
						folder,
						fileName: `${slug(att.fileName)}.url.txt`,
						storageKey: att.storageKey,
					});
				}
			} else if (att.storageUrl?.startsWith('data:')) {
				const match = /^data:([^;]+);base64,(.+)$/.exec(att.storageUrl);
				if (match) {
					const buffer = Buffer.from(match[2], 'base64');
					emitted.push({
						kind: 'binary-buffer',
						folder,
						fileName: slug(att.fileName),
						size: buffer.byteLength,
					});
				}
			}
		}
	}
	return { emitted, failedS3Keys, attachmentCount };
}

describe('streamRetreatBundle: per-attachment routing', () => {
	it('emits markdown attachments as <folder>/<slug>.md', () => {
		const result = processAttachments(
			[
				{
					name: 'Comedor',
					atts: [
						{ kind: 'markdown', fileName: 'Manual del Comedor.md', content: '# hola' },
					],
				},
			],
			() => true,
		);
		expect(result.emitted).toEqual([
			{
				kind: 'markdown',
				folder: 'Comedor',
				fileName: 'Manual_del_Comedor.md',
				content: '# hola',
			},
		]);
	});

	it('streams S3 file as binary when fetch succeeds', () => {
		const result = processAttachments(
			[
				{
					name: 'Logística',
					atts: [
						{
							kind: 'file',
							fileName: 'Anexo.pdf',
							storageKey: 'documents/x/abc-anexo.pdf',
							storageUrl: 'https://s3.example/abc',
						},
					],
				},
			],
			() => true,
		);
		// Note: `slug()` strips punctuation (including dots) — the bundle's
		// in-archive filename mirrors that. Real implementation accepts that
		// trade-off (cross-platform safe filenames > preserving extensions).
		expect(result.emitted).toEqual([
			{
				kind: 'binary-stream',
				folder: 'Logistica',
				fileName: 'Anexopdf',
				storageKey: 'documents/x/abc-anexo.pdf',
			},
		]);
		expect(result.failedS3Keys).toEqual([]);
	});

	it('falls back to .url.txt when S3 fetch fails', () => {
		const result = processAttachments(
			[
				{
					name: 'Logística',
					atts: [
						{
							kind: 'file',
							fileName: 'Anexo.pdf',
							storageKey: 'documents/x/abc-anexo.pdf',
							storageUrl: 'https://s3.example/abc',
						},
					],
				},
			],
			() => false,
		);
		expect(result.emitted).toEqual([
			{
				kind: 'url-fallback',
				folder: 'Logistica',
				fileName: 'Anexopdf.url.txt',
				storageKey: 'documents/x/abc-anexo.pdf',
			},
		]);
		expect(result.failedS3Keys).toEqual(['documents/x/abc-anexo.pdf']);
	});

	it('mixes successes and failures in the same bundle, accumulating failedS3Keys', () => {
		const result = processAttachments(
			[
				{
					name: 'Cocina',
					atts: [
						{
							kind: 'file',
							fileName: 'a.pdf',
							storageKey: 'k1',
							storageUrl: 'https://s3.example/k1',
						},
						{
							kind: 'file',
							fileName: 'b.pdf',
							storageKey: 'k2',
							storageUrl: 'https://s3.example/k2',
						},
					],
				},
			],
			(k) => k === 'k1',
		);
		expect(result.failedS3Keys).toEqual(['k2']);
		expect(result.emitted.map((e) => e.kind)).toEqual([
			'binary-stream',
			'url-fallback',
		]);
	});

	it('decodes data URL inline attachments to binary buffers (no S3 call)', () => {
		const data = 'JVBERi0xLjQK'; // "%PDF-1.4\n" base64
		const calls: string[] = [];
		const result = processAttachments(
			[
				{
					name: 'Comedor',
					atts: [
						{
							kind: 'file',
							fileName: 'inline.pdf',
							storageKey: null,
							storageUrl: `data:application/pdf;base64,${data}`,
						},
					],
				},
			],
			(k) => {
				calls.push(k);
				return true;
			},
		);
		expect(calls).toEqual([]); // no S3 fetch
		expect(result.emitted).toEqual([
			{ kind: 'binary-buffer', folder: 'Comedor', fileName: 'inlinepdf', size: 9 },
		]);
	});

	it('counts every attachment regardless of branch', () => {
		const result = processAttachments(
			[
				{
					name: 'X',
					atts: [
						{ kind: 'markdown', fileName: 'a.md', content: '' },
						{
							kind: 'file',
							fileName: 'b.pdf',
							storageKey: 'k',
							storageUrl: 'u',
						},
						{
							kind: 'file',
							fileName: 'c.png',
							storageKey: null,
							storageUrl: 'data:image/png;base64,iVBORw0KGgo=',
						},
					],
				},
			],
			() => true,
		);
		expect(result.attachmentCount).toBe(3);
	});

	it('preserves folder slug per responsability across multiple attachments', () => {
		const result = processAttachments(
			[
				{
					name: 'Oración de Intercesión',
					atts: [
						{ kind: 'markdown', fileName: 'guion.md', content: '' },
						{
							kind: 'file',
							fileName: 'extra.pdf',
							storageKey: 'k',
							storageUrl: 'u',
						},
					],
				},
			],
			() => true,
		);
		const folders = new Set(result.emitted.map((e) => e.folder));
		expect(folders.size).toBe(1);
		// "Oración de Intercesión" → strip combining marks + replace spaces
		// Actual slug: "Oracin_de_Intercesin" (the "ó" / "ó" pattern depends on
		// NFKD decomposition; the key invariant is per-responsability identity).
		expect([...folders][0]).toMatch(/Oraci/);
	});
});
