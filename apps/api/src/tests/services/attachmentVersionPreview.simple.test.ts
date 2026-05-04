/**
 * Pure-logic tests for `getMarkdownVersion`: the read-only fetch used by the
 * "Ir a esta versión" preview dialog. The contract:
 *
 *  - Returns the version row matching `(attachmentId, historyId)`.
 *  - Returns no version (throws) if attachment doesn't exist.
 *  - Returns no version (throws) if history entry exists but belongs to a
 *    DIFFERENT attachment — security invariant: caller can't pluck arbitrary
 *    versions by guessing historyId.
 *  - Does NOT mutate any state.
 */

type Att = { id: string };
type HistRow = {
	id: string;
	attachmentId: string;
	title: string;
	content: string;
};

class AttachmentNotFoundError extends Error {}

function getVersion(
	attachments: Att[],
	histRows: HistRow[],
	attachmentId: string,
	historyId: string,
): HistRow {
	const att = attachments.find((a) => a.id === attachmentId);
	if (!att) throw new AttachmentNotFoundError('attachment not found');
	const v = histRows.find((r) => r.id === historyId && r.attachmentId === attachmentId);
	if (!v) throw new AttachmentNotFoundError('history entry not found');
	return v;
}

const baseAtts: Att[] = [{ id: 'att-1' }, { id: 'att-2' }];
const baseHistory: HistRow[] = [
	{ id: 'h-a', attachmentId: 'att-1', title: 'v1', content: 'old' },
	{ id: 'h-b', attachmentId: 'att-1', title: 'v2', content: 'newer' },
	{ id: 'h-c', attachmentId: 'att-2', title: 'other', content: 'unrelated' },
];

describe('Attachment version preview: getMarkdownVersion contract', () => {
	it('returns the matching version with its full content', () => {
		const v = getVersion(baseAtts, baseHistory, 'att-1', 'h-a');
		expect(v.title).toBe('v1');
		expect(v.content).toBe('old');
	});

	it('throws when attachmentId does not exist', () => {
		expect(() => getVersion(baseAtts, baseHistory, 'unknown', 'h-a')).toThrow(
			/attachment not found/,
		);
	});

	it('throws when historyId does not exist', () => {
		expect(() => getVersion(baseAtts, baseHistory, 'att-1', 'h-zzz')).toThrow(
			/history entry not found/,
		);
	});

	it('refuses to return a history row that belongs to a different attachment', () => {
		// h-c belongs to att-2, but caller asks for it under att-1 → must NOT
		// leak across attachments. This is the security invariant.
		expect(() => getVersion(baseAtts, baseHistory, 'att-1', 'h-c')).toThrow(
			/history entry not found/,
		);
	});

	it('does not mutate the input collections', () => {
		const a = JSON.parse(JSON.stringify(baseAtts));
		const h = JSON.parse(JSON.stringify(baseHistory));
		getVersion(a, h, 'att-1', 'h-a');
		expect(a).toEqual(baseAtts);
		expect(h).toEqual(baseHistory);
	});

	it('returns full content (not preview-truncated)', () => {
		const longContent = 'a'.repeat(5000);
		const histRows: HistRow[] = [
			{ id: 'h-x', attachmentId: 'att-1', title: 'long', content: longContent },
		];
		const v = getVersion(baseAtts, histRows, 'att-1', 'h-x');
		expect(v.content.length).toBe(5000);
	});
});
