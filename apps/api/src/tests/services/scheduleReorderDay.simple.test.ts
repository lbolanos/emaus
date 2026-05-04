/**
 * Pure-logic test mirroring `retreatScheduleService.reorderDay`. The service
 * preserves the (startTime, endTime, durationMinutes) tuples already in use
 * for that day; what changes is the mapping from item-id to slot.
 */

type Slot = {
	startTime: Date;
	endTime: Date;
	durationMinutes: number;
};

type Item = Slot & {
	id: string;
	retreatId: string;
	day: number;
	orderInDay: number;
};

/**
 * Mirror of validation + reassignment logic in reorderDay.
 * Throws on invalid orderedItemIds. Returns the items with the new slots applied
 * (sorted by their new orderInDay = position in orderedItemIds).
 */
function reorder(items: Item[], orderedItemIds: string[]): Item[] {
	if (orderedItemIds.length !== items.length) {
		throw new Error(`reorder mismatch: day has ${items.length} items, received ${orderedItemIds.length}`);
	}
	const ids = new Set(items.map((x) => x.id));
	for (const id of orderedItemIds) {
		if (!ids.has(id)) throw new Error(`reorder mismatch: id ${id} is not in day`);
	}
	if (new Set(orderedItemIds).size !== orderedItemIds.length) {
		throw new Error('reorder mismatch: duplicate ids');
	}

	const slots = [...items].sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
	const byId = new Map(items.map((x) => [x.id, x] as const));
	return orderedItemIds.map((id, i) => {
		const it = byId.get(id)!;
		return {
			...it,
			startTime: slots[i].startTime,
			endTime: slots[i].endTime,
			durationMinutes: slots[i].durationMinutes,
			orderInDay: i,
		};
	});
}

const t = (h: number, m = 0) => new Date(2026, 3, 26, h, m);

const baseItems = (): Item[] => [
	{
		id: 'a',
		retreatId: 'r',
		day: 1,
		orderInDay: 0,
		startTime: t(9, 0),
		endTime: t(9, 30),
		durationMinutes: 30,
	},
	{
		id: 'b',
		retreatId: 'r',
		day: 1,
		orderInDay: 1,
		startTime: t(10, 0),
		endTime: t(10, 45),
		durationMinutes: 45,
	},
	{
		id: 'c',
		retreatId: 'r',
		day: 1,
		orderInDay: 2,
		startTime: t(11, 0),
		endTime: t(12, 0),
		durationMinutes: 60,
	},
];

describe('Schedule reorderDay: slot rotation semantics', () => {
	it('preserves slot times: drag b above a (now b at 9:00, a at 10:00)', () => {
		const result = reorder(baseItems(), ['b', 'a', 'c']);
		expect(result.map((x) => x.id)).toEqual(['b', 'a', 'c']);
		expect(result[0].startTime).toEqual(t(9, 0));
		expect(result[0].durationMinutes).toBe(30);
		expect(result[1].startTime).toEqual(t(10, 0));
		expect(result[1].durationMinutes).toBe(45);
		expect(result[2].startTime).toEqual(t(11, 0));
	});

	it('updates orderInDay to reflect the new position', () => {
		const result = reorder(baseItems(), ['c', 'a', 'b']);
		expect(result.find((x) => x.id === 'c')!.orderInDay).toBe(0);
		expect(result.find((x) => x.id === 'a')!.orderInDay).toBe(1);
		expect(result.find((x) => x.id === 'b')!.orderInDay).toBe(2);
	});

	it('no-op order returns same items in same slots', () => {
		const original = baseItems();
		const result = reorder(original, ['a', 'b', 'c']);
		for (let i = 0; i < 3; i++) {
			expect(result[i].id).toBe(original[i].id);
			expect(result[i].startTime).toEqual(original[i].startTime);
		}
	});

	it('throws when orderedItemIds has fewer entries than items', () => {
		expect(() => reorder(baseItems(), ['a', 'b'])).toThrow(/reorder mismatch/);
	});

	it('throws when orderedItemIds has an unknown id', () => {
		expect(() => reorder(baseItems(), ['a', 'b', 'z'])).toThrow(/not in day/);
	});

	it('throws on duplicate ids', () => {
		expect(() => reorder(baseItems(), ['a', 'a', 'b'])).toThrow(/duplicate/);
	});

	it('uses the originally-earliest startTime regardless of input order', () => {
		// Even if items are passed out of order, slot indexing is by sorted startTime.
		const items = [
			baseItems()[2], // c at 11:00
			baseItems()[0], // a at 9:00
			baseItems()[1], // b at 10:00
		];
		const result = reorder(items, ['c', 'b', 'a']);
		expect(result[0].id).toBe('c');
		expect(result[0].startTime).toEqual(t(9, 0)); // earliest slot
		expect(result[1].id).toBe('b');
		expect(result[1].startTime).toEqual(t(10, 0));
		expect(result[2].id).toBe('a');
		expect(result[2].startTime).toEqual(t(11, 0));
	});

	it('preserves durationMinutes per slot, not per item', () => {
		// a originally had 30min, b 45min, c 60min. After reorder b→a→c,
		// item b moves to slot 0 → gets 30min; item a moves to slot 1 → gets 45min.
		const result = reorder(baseItems(), ['b', 'a', 'c']);
		expect(result.find((x) => x.id === 'b')!.durationMinutes).toBe(30);
		expect(result.find((x) => x.id === 'a')!.durationMinutes).toBe(45);
		expect(result.find((x) => x.id === 'c')!.durationMinutes).toBe(60);
	});
});
