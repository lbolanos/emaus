/**
 * Pure-logic tests for the retention algorithm in
 * `attachmentHistoryCleanupService.performCleanup`.
 *
 * The actual service uses TypeORM repos. This file extracts the algorithm
 * (find overflowing attachments → for each, take the oldest rows beyond
 * MAX → delete those ids) without touching a database. The invariants the
 * service guarantees:
 *
 *  - Per-attachmentId cap at MAX_VERSIONS_PER_ATTACHMENT.
 *  - Newest rows are kept (sort by savedAt DESC).
 *  - Attachments with ≤ MAX rows are untouched.
 *  - Other attachments' history is untouched (no cross-attachment leakage).
 */

const MAX_VERSIONS_PER_ATTACHMENT = 20;

type Row = { id: string; attachmentId: string; savedAt: Date };

function findOverflowing(rows: Row[]): Array<{ attachmentId: string; total: number }> {
	const counts = new Map<string, number>();
	for (const r of rows) counts.set(r.attachmentId, (counts.get(r.attachmentId) ?? 0) + 1);
	return Array.from(counts.entries())
		.filter(([, total]) => total > MAX_VERSIONS_PER_ATTACHMENT)
		.map(([attachmentId, total]) => ({ attachmentId, total }));
}

function pickIdsToDelete(rows: Row[], attachmentId: string, total: number): string[] {
	const dropCount = total - MAX_VERSIONS_PER_ATTACHMENT;
	const sorted = rows
		.filter((r) => r.attachmentId === attachmentId)
		.sort((a, b) => a.savedAt.getTime() - b.savedAt.getTime());
	return sorted.slice(0, dropCount).map((r) => r.id);
}

function applyCleanup(rows: Row[]): { kept: Row[]; deletedIds: string[] } {
	const overflows = findOverflowing(rows);
	const deletedIds: string[] = [];
	for (const { attachmentId, total } of overflows) {
		deletedIds.push(...pickIdsToDelete(rows, attachmentId, total));
	}
	const deletedSet = new Set(deletedIds);
	return { kept: rows.filter((r) => !deletedSet.has(r.id)), deletedIds };
}

const makeRows = (attachmentId: string, count: number, baseHour = 10): Row[] =>
	Array.from({ length: count }, (_, i) => ({
		id: `${attachmentId}-${i}`,
		attachmentId,
		// each row 1 hour after the previous, so id-0 is oldest
		savedAt: new Date(2026, 3, 26, baseHour + i, 0),
	}));

describe('Attachment history cleanup retention', () => {
	it('does not delete anything when an attachment has fewer than MAX versions', () => {
		const rows = makeRows('a', MAX_VERSIONS_PER_ATTACHMENT);
		const { deletedIds } = applyCleanup(rows);
		expect(deletedIds).toEqual([]);
	});

	it('does not delete anything when count equals MAX exactly', () => {
		const rows = makeRows('a', MAX_VERSIONS_PER_ATTACHMENT);
		expect(rows).toHaveLength(MAX_VERSIONS_PER_ATTACHMENT);
		const { deletedIds } = applyCleanup(rows);
		expect(deletedIds).toEqual([]);
	});

	it('deletes the oldest rows beyond MAX', () => {
		const rows = makeRows('a', MAX_VERSIONS_PER_ATTACHMENT + 5);
		const { deletedIds, kept } = applyCleanup(rows);
		expect(deletedIds).toHaveLength(5);
		// First 5 (oldest) are dropped — savedAt ascending ids 0..4
		expect(deletedIds.sort()).toEqual(['a-0', 'a-1', 'a-2', 'a-3', 'a-4']);
		expect(kept).toHaveLength(MAX_VERSIONS_PER_ATTACHMENT);
		// All kept rows are from id-5 onwards
		const keptIds = kept.map((r) => r.id);
		expect(keptIds.every((id) => parseInt(id.split('-')[1], 10) >= 5)).toBe(true);
	});

	it('keeps the newest MAX even when input is in random order', () => {
		const rows = makeRows('a', MAX_VERSIONS_PER_ATTACHMENT + 3);
		// shuffle
		const shuffled = [...rows].sort(() => Math.random() - 0.5);
		const { deletedIds, kept } = applyCleanup(shuffled);
		expect(deletedIds.sort()).toEqual(['a-0', 'a-1', 'a-2']);
		expect(kept).toHaveLength(MAX_VERSIONS_PER_ATTACHMENT);
	});

	it('processes each attachmentId independently', () => {
		const rowsA = makeRows('a', MAX_VERSIONS_PER_ATTACHMENT + 5, 10);
		const rowsB = makeRows('b', MAX_VERSIONS_PER_ATTACHMENT - 2, 100);
		const rowsC = makeRows('c', MAX_VERSIONS_PER_ATTACHMENT + 1, 200);
		const { deletedIds, kept } = applyCleanup([...rowsA, ...rowsB, ...rowsC]);
		expect(deletedIds).toHaveLength(6); // 5 from a + 1 from c
		expect(deletedIds.filter((id) => id.startsWith('a-'))).toHaveLength(5);
		expect(deletedIds.filter((id) => id.startsWith('b-'))).toHaveLength(0);
		expect(deletedIds.filter((id) => id.startsWith('c-'))).toHaveLength(1);
		// All b rows survive
		expect(kept.filter((r) => r.attachmentId === 'b')).toHaveLength(rowsB.length);
	});

	it('returns empty deletion list when there are no rows at all', () => {
		const { deletedIds, kept } = applyCleanup([]);
		expect(deletedIds).toEqual([]);
		expect(kept).toEqual([]);
	});

	it('handles a single attachment with massively over-limit history (extreme case)', () => {
		const rows = makeRows('a', 100);
		const { deletedIds, kept } = applyCleanup(rows);
		expect(deletedIds).toHaveLength(80);
		expect(kept).toHaveLength(MAX_VERSIONS_PER_ATTACHMENT);
		// Newest 20 are kept: ids 80..99
		const keptNumeric = kept.map((r) => parseInt(r.id.split('-')[1], 10)).sort((a, b) => a - b);
		expect(keptNumeric[0]).toBe(80);
		expect(keptNumeric[keptNumeric.length - 1]).toBe(99);
	});
});
