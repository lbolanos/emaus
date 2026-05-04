/**
 * `/api/responsibilities/documentation` legacy proxy — pure-logic tests.
 *
 * The endpoint used to read from the static `charlaDocumentation` /
 * `responsibilityDocumentation` dictionaries. After the migration to
 * `responsability_attachment` (markdown attachments are now the source
 * of truth, seeded from the same dicts and editable in the UI), the
 * controller does:
 *
 *   markdown = attachment.content ?? charlaDoc[name] ?? respDoc[name] ?? null
 *
 * These tests pin the resolution order without booting the DB. The
 * `keys` endpoint is also covered for the union behavior.
 */

interface AttachmentRow {
	responsabilityName: string;
	kind: 'file' | 'markdown';
	content: string | null;
	sortOrder: number;
	createdAt: number;
}

// ── Helpers mirroring the controller logic ────────────────────────────────────

function getFirstMarkdownByName(
	rows: AttachmentRow[],
	name: string,
): AttachmentRow | null {
	const normalized = (name ?? '').trim();
	if (!normalized) return null;
	const matches = rows
		.filter((r) => r.responsabilityName === normalized && r.kind === 'markdown')
		.sort((a, b) => {
			if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
			return a.createdAt - b.createdAt;
		});
	return matches[0] ?? null;
}

function resolveDocumentation(opts: {
	name: string;
	rows: AttachmentRow[];
	charlaDoc: Record<string, string>;
	respDoc: Record<string, string>;
}): string | null {
	const att = getFirstMarkdownByName(opts.rows, opts.name);
	return att?.content ?? opts.charlaDoc[opts.name] ?? opts.respDoc[opts.name] ?? null;
}

function listKeys(opts: {
	rows: AttachmentRow[];
	charlaDoc: Record<string, string>;
	respDoc: Record<string, string>;
}): { charlas: string[]; responsibilities: string[] } {
	const attachmentNames = Array.from(
		new Set(
			opts.rows.filter((r) => r.kind === 'markdown').map((r) => r.responsabilityName),
		),
	);
	const all = new Set<string>([
		...attachmentNames,
		...Object.keys(opts.charlaDoc),
		...Object.keys(opts.respDoc),
	]);
	const charlas: string[] = [];
	const responsibilities: string[] = [];
	for (const name of all) {
		if (opts.charlaDoc[name] !== undefined) charlas.push(name);
		else responsibilities.push(name);
	}
	charlas.sort();
	responsibilities.sort();
	return { charlas, responsibilities };
}

// ── Resolution order tests ────────────────────────────────────────────────────

describe('getDocumentation — resolution order', () => {
	const att = (overrides: Partial<AttachmentRow> = {}): AttachmentRow => ({
		responsabilityName: overrides.responsabilityName ?? 'Comedor',
		kind: overrides.kind ?? 'markdown',
		content: overrides.content ?? '# from db',
		sortOrder: overrides.sortOrder ?? 10,
		createdAt: overrides.createdAt ?? 1_000,
	});

	it('attachment wins over charlaDoc when present', () => {
		const r = resolveDocumentation({
			name: 'Comedor',
			rows: [att({ content: '# from attachment' })],
			charlaDoc: { Comedor: '# legacy charla' },
			respDoc: {},
		});
		expect(r).toBe('# from attachment');
	});

	it('attachment wins over respDoc when present', () => {
		const r = resolveDocumentation({
			name: 'Comedor',
			rows: [att({ content: '# from attachment' })],
			charlaDoc: {},
			respDoc: { Comedor: '# legacy resp' },
		});
		expect(r).toBe('# from attachment');
	});

	it('falls back to charlaDoc when no attachment exists', () => {
		const r = resolveDocumentation({
			name: 'Conocerte',
			rows: [],
			charlaDoc: { Conocerte: '# the talk' },
			respDoc: {},
		});
		expect(r).toBe('# the talk');
	});

	it('falls back to respDoc when neither attachment nor charlaDoc match', () => {
		const r = resolveDocumentation({
			name: 'Reglas',
			rows: [],
			charlaDoc: {},
			respDoc: { Reglas: '# rules' },
		});
		expect(r).toBe('# rules');
	});

	it('returns null when nothing matches (controller maps to 404)', () => {
		const r = resolveDocumentation({
			name: 'NoExiste',
			rows: [],
			charlaDoc: {},
			respDoc: {},
		});
		expect(r).toBeNull();
	});

	it('file attachments are NOT used as documentation source', () => {
		// Only markdown kind counts. A PDF doesn't have markdown content.
		const r = resolveDocumentation({
			name: 'Comedor',
			rows: [att({ kind: 'file', content: null })],
			charlaDoc: { Comedor: '# fallback' },
			respDoc: {},
		});
		expect(r).toBe('# fallback');
	});

	it('first markdown wins by sortOrder ASC then createdAt ASC', () => {
		const rows = [
			att({ content: '# B', sortOrder: 20, createdAt: 1_000 }),
			att({ content: '# A — first', sortOrder: 10, createdAt: 1_000 }),
			att({ content: '# C', sortOrder: 30, createdAt: 1_000 }),
		];
		const r = resolveDocumentation({
			name: 'Comedor',
			rows,
			charlaDoc: {},
			respDoc: {},
		});
		expect(r).toBe('# A — first');
	});

	it('tiebreak on equal sortOrder uses createdAt ASC', () => {
		const rows = [
			att({ content: '# later', sortOrder: 10, createdAt: 2_000 }),
			att({ content: '# earlier', sortOrder: 10, createdAt: 1_000 }),
		];
		const r = resolveDocumentation({
			name: 'Comedor',
			rows,
			charlaDoc: {},
			respDoc: {},
		});
		expect(r).toBe('# earlier');
	});

	it('coordinator-edited markdown overrides original seed', () => {
		// Realistic scenario: seeder created from charlaDoc, then a coordinator
		// edited it. Resolution should return the edited version.
		const rows = [att({ content: '# edited by coordinator', createdAt: 5_000 })];
		const r = resolveDocumentation({
			name: 'Comedor',
			rows,
			charlaDoc: { Comedor: '# original from TS file' },
			respDoc: {},
		});
		expect(r).toBe('# edited by coordinator');
	});
});

// ── Keys union tests ──────────────────────────────────────────────────────────

describe('listDocumentationKeys — union + categorization', () => {
	it('returns union of attachment names + dict keys', () => {
		const r = listKeys({
			rows: [
				{ responsabilityName: 'Diario', kind: 'markdown', content: '#', sortOrder: 0, createdAt: 0 },
			],
			charlaDoc: { 'Charla 1': '#' },
			respDoc: { Comedor: '#' },
		});
		expect(r.charlas).toContain('Charla 1');
		expect(r.responsibilities).toContain('Comedor');
		expect(r.responsibilities).toContain('Diario'); // from attachments only
	});

	it('coordinator-created markdown not in any dict goes to responsibilities', () => {
		const r = listKeys({
			rows: [
				{ responsabilityName: 'Custom Role', kind: 'markdown', content: '#', sortOrder: 0, createdAt: 0 },
			],
			charlaDoc: {},
			respDoc: {},
		});
		expect(r.responsibilities).toEqual(['Custom Role']);
		expect(r.charlas).toEqual([]);
	});

	it('a name in charlaDoc lands in charlas regardless of attachment presence', () => {
		const r = listKeys({
			rows: [
				{ responsabilityName: 'Charla 1', kind: 'markdown', content: '#', sortOrder: 0, createdAt: 0 },
			],
			charlaDoc: { 'Charla 1': '#' },
			respDoc: {},
		});
		expect(r.charlas).toEqual(['Charla 1']);
		expect(r.responsibilities).toEqual([]);
	});

	it('excludes file-only attachments (no markdown for that name → key not added)', () => {
		const r = listKeys({
			rows: [
				{ responsabilityName: 'PDF only', kind: 'file', content: null, sortOrder: 0, createdAt: 0 },
			],
			charlaDoc: {},
			respDoc: {},
		});
		expect(r.responsibilities).not.toContain('PDF only');
	});

	it('returns alphabetically sorted lists', () => {
		const r = listKeys({
			rows: [],
			charlaDoc: { 'Charla Z': '#', 'Charla A': '#' },
			respDoc: { Zapatero: '#', Aguador: '#' },
		});
		expect(r.charlas).toEqual(['Charla A', 'Charla Z']);
		expect(r.responsibilities).toEqual(['Aguador', 'Zapatero']);
	});

	it('deduplicates: same name in attachment + dict appears once in correct bucket', () => {
		const r = listKeys({
			rows: [
				{ responsabilityName: 'Comedor', kind: 'markdown', content: '#', sortOrder: 0, createdAt: 0 },
			],
			charlaDoc: {},
			respDoc: { Comedor: '#' },
		});
		expect(r.responsibilities.filter((n) => n === 'Comedor')).toHaveLength(1);
	});
});
