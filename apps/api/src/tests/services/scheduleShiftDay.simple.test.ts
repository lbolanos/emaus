/**
 * shiftDay — pure logic tests for the bulk-shift-day operation.
 *
 * Mirrors the math and filtering rules in
 * `retreatScheduleService.ts:shiftDay()` without booting the DB.
 *
 * The service translates to:
 *   1. WHERE retreatId=X AND day=N
 *   2. UPDATE startTime = startTime + minutesDelta
 *      UPDATE endTime   = endTime   + minutesDelta
 *   3. Status untouched (this is reschedule, not delay)
 *
 * Edge cases worth pinning:
 *   - delta=0 should be a no-op (caller already validates, but service is tolerant)
 *   - delta < 0 (move earlier) works the same way
 *   - items in OTHER days or other retreats must NOT be touched
 *   - status field must be preserved
 */

interface MockItem {
	id: string;
	retreatId: string;
	day: number;
	startTime: Date;
	endTime: Date;
	status: 'pending' | 'active' | 'completed' | 'delayed' | 'skipped';
}

/** Mirror of retreatScheduleService.shiftDay(): pure logic */
function shiftDay(
	items: MockItem[],
	retreatId: string,
	day: number,
	minutesDelta: number,
): MockItem[] {
	const matching = items.filter((it) => it.retreatId === retreatId && it.day === day);
	const matchingIds = new Set(matching.map((m) => m.id));
	return items.map((it) => {
		if (!matchingIds.has(it.id)) return it;
		return {
			...it,
			startTime: new Date(it.startTime.getTime() + minutesDelta * 60_000),
			endTime: new Date(it.endTime.getTime() + minutesDelta * 60_000),
			// status preserved
		};
	});
}

function makeItem(overrides: Partial<MockItem> = {}): MockItem {
	return {
		id: overrides.id ?? 'item-1',
		retreatId: overrides.retreatId ?? 'retreat-A',
		day: overrides.day ?? 3,
		startTime: overrides.startTime ?? new Date('2026-04-27T09:00:00Z'),
		endTime: overrides.endTime ?? new Date('2026-04-27T09:30:00Z'),
		status: overrides.status ?? 'pending',
	};
}

describe('shiftDay — bulk shift', () => {
	it('shifts every item of the target day by +N minutes', () => {
		const items = [
			makeItem({ id: 'a', day: 3, startTime: new Date('2026-04-27T09:00:00Z'), endTime: new Date('2026-04-27T09:30:00Z') }),
			makeItem({ id: 'b', day: 3, startTime: new Date('2026-04-27T10:00:00Z'), endTime: new Date('2026-04-27T11:00:00Z') }),
			makeItem({ id: 'c', day: 3, startTime: new Date('2026-04-27T15:00:00Z'), endTime: new Date('2026-04-27T15:45:00Z') }),
		];
		const result = shiftDay(items, 'retreat-A', 3, 15);
		expect(result[0].startTime.toISOString()).toBe('2026-04-27T09:15:00.000Z');
		expect(result[0].endTime.toISOString()).toBe('2026-04-27T09:45:00.000Z');
		expect(result[1].startTime.toISOString()).toBe('2026-04-27T10:15:00.000Z');
		expect(result[2].startTime.toISOString()).toBe('2026-04-27T15:15:00.000Z');
	});

	it('shifts negative (move earlier)', () => {
		const items = [
			makeItem({ id: 'a', day: 2, startTime: new Date('2026-04-26T08:00:00Z'), endTime: new Date('2026-04-26T08:30:00Z') }),
		];
		const result = shiftDay(items, 'retreat-A', 2, -30);
		expect(result[0].startTime.toISOString()).toBe('2026-04-26T07:30:00.000Z');
		expect(result[0].endTime.toISOString()).toBe('2026-04-26T08:00:00.000Z');
	});

	it('does NOT touch items from other days of the same retreat', () => {
		const items = [
			makeItem({ id: 'd1', day: 1, startTime: new Date('2026-04-25T20:00:00Z'), endTime: new Date('2026-04-25T20:30:00Z') }),
			makeItem({ id: 'd3', day: 3, startTime: new Date('2026-04-27T09:00:00Z'), endTime: new Date('2026-04-27T09:30:00Z') }),
		];
		const result = shiftDay(items, 'retreat-A', 3, 30);
		// Día 1 unchanged
		expect(result[0].startTime.toISOString()).toBe('2026-04-25T20:00:00.000Z');
		// Día 3 shifted
		expect(result[1].startTime.toISOString()).toBe('2026-04-27T09:30:00.000Z');
	});

	it('does NOT touch items from a different retreat', () => {
		const items = [
			makeItem({ id: 'a', retreatId: 'retreat-A', day: 3, startTime: new Date('2026-04-27T09:00:00Z'), endTime: new Date('2026-04-27T09:30:00Z') }),
			makeItem({ id: 'b', retreatId: 'retreat-B', day: 3, startTime: new Date('2026-04-27T10:00:00Z'), endTime: new Date('2026-04-27T10:30:00Z') }),
		];
		const result = shiftDay(items, 'retreat-A', 3, 60);
		expect(result[0].startTime.toISOString()).toBe('2026-04-27T10:00:00.000Z'); // shifted
		expect(result[1].startTime.toISOString()).toBe('2026-04-27T10:00:00.000Z'); // untouched
	});

	it('preserves status (reschedule, not delay)', () => {
		const items = [
			makeItem({ id: 'a', day: 3, status: 'completed' }),
			makeItem({ id: 'b', day: 3, status: 'active' }),
			makeItem({ id: 'c', day: 3, status: 'pending' }),
		];
		const result = shiftDay(items, 'retreat-A', 3, 5);
		expect(result[0].status).toBe('completed');
		expect(result[1].status).toBe('active');
		expect(result[2].status).toBe('pending');
	});

	it('returns the items unchanged when no item matches retreatId+day', () => {
		const items = [
			makeItem({ id: 'a', day: 1 }),
			makeItem({ id: 'b', day: 2 }),
		];
		const original = items.map((i) => ({ ...i }));
		const result = shiftDay(items, 'retreat-A', 3, 60);
		expect(result.map((r) => r.startTime.toISOString())).toEqual(
			original.map((r) => r.startTime.toISOString()),
		);
	});

	it('delta=0 is a no-op (idempotent)', () => {
		const items = [makeItem({ id: 'a', day: 3, startTime: new Date('2026-04-27T09:00:00Z'), endTime: new Date('2026-04-27T09:30:00Z') })];
		const result = shiftDay(items, 'retreat-A', 3, 0);
		expect(result[0].startTime.toISOString()).toBe('2026-04-27T09:00:00.000Z');
		expect(result[0].endTime.toISOString()).toBe('2026-04-27T09:30:00.000Z');
	});

	it('large delta crossing midnight works (date math is timestamp-based)', () => {
		const items = [
			makeItem({ id: 'a', day: 3, startTime: new Date('2026-04-27T23:30:00Z'), endTime: new Date('2026-04-28T00:00:00Z') }),
		];
		const result = shiftDay(items, 'retreat-A', 3, 90);
		expect(result[0].startTime.toISOString()).toBe('2026-04-28T01:00:00.000Z');
		expect(result[0].endTime.toISOString()).toBe('2026-04-28T01:30:00.000Z');
	});
});
