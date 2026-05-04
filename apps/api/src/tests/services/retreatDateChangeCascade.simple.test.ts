/**
 * Bug J: changing a retreat's startDate (via the RetreatModal Edit form) didn't
 * cascade to the schedule items — they remained at their original dates,
 * showing stale relative-time labels like "hace 11d" even after the user
 * picked a near-future date.
 *
 * Fix: in `retreatService.update()`, after persisting the new dates, compute
 * the delta in minutes between old and new startDate and call
 * `retreatScheduleService.shiftAllItems(retreatId, minutesDelta)` which
 * shifts every item's startTime/endTime by the same amount in a single
 * transaction.
 *
 * This test mirrors the delta-calculation + shift-application logic without
 * touching a real DB — the goal is to lock the math (timezone, string vs
 * Date inputs, no-op when delta is 0, sign of the shift).
 */

type DateLike = Date | string | null | undefined;

function toMs(v: DateLike): number | null {
	if (!v) return null;
	const d = v instanceof Date ? v : new Date(v);
	const t = d.getTime();
	return Number.isFinite(t) ? t : null;
}

/**
 * Mirror of the cascade logic added in retreatService.update().
 * Returns the minutes-delta that would be applied (or null if no shift).
 */
function computeShiftDelta(oldStart: DateLike, newStart: DateLike): number | null {
	const oldMs = toMs(oldStart);
	const newMs = toMs(newStart);
	if (oldMs === null || newMs === null) return null;
	if (oldMs === newMs) return null;
	return Math.round((newMs - oldMs) / 60000);
}

function applyShiftToItem<T extends { startTime: Date | string; endTime: Date | string }>(
	item: T,
	minutesDelta: number,
): { startTime: Date; endTime: Date } {
	const sMs = toMs(item.startTime)!;
	const eMs = toMs(item.endTime)!;
	return {
		startTime: new Date(sMs + minutesDelta * 60000),
		endTime: new Date(eMs + minutesDelta * 60000),
	};
}

describe('Retreat date-change cascade (Bug J)', () => {
	it('returns null when both dates are missing', () => {
		expect(computeShiftDelta(null, null)).toBeNull();
		expect(computeShiftDelta(undefined, null)).toBeNull();
	});

	it('returns null when old date is missing', () => {
		expect(computeShiftDelta(null, '2026-05-01')).toBeNull();
	});

	it('returns null when new date is missing', () => {
		expect(computeShiftDelta('2026-04-17', null)).toBeNull();
	});

	it('returns null for a no-op (same date)', () => {
		expect(computeShiftDelta('2026-04-17', '2026-04-17')).toBeNull();
	});

	it('returns positive delta when shifting forward', () => {
		// 11 days × 24h × 60min = 15840
		const delta = computeShiftDelta('2026-04-17T00:00:00Z', '2026-04-28T00:00:00Z');
		expect(delta).toBe(15840);
	});

	it('returns negative delta when shifting backward', () => {
		const delta = computeShiftDelta('2026-04-28T00:00:00Z', '2026-04-17T00:00:00Z');
		expect(delta).toBe(-15840);
	});

	it('handles SQLite-style string inputs (no Date constructor)', () => {
		// SQLite returns dates as ISO strings. The cascade logic must handle
		// this without `.toISOString is not a function` errors.
		const delta = computeShiftDelta(
			'2026-04-17 00:00:00',
			'2026-04-19 00:00:00',
		);
		expect(delta).toBe(2880); // 2 days × 1440 min
	});

	it('handles mixed inputs (Date + string)', () => {
		const oldD = new Date('2026-04-17T00:00:00Z');
		const newStr = '2026-04-19T00:00:00Z';
		expect(computeShiftDelta(oldD, newStr)).toBe(2880);
	});

	it('preserves time-of-day when shifting whole days', () => {
		// Item at 9:00 should stay at 9:00 after a +11-day shift.
		const item = {
			startTime: new Date('2026-04-17T09:00:00Z'),
			endTime: new Date('2026-04-17T10:30:00Z'),
		};
		const delta = computeShiftDelta('2026-04-17T00:00:00Z', '2026-04-28T00:00:00Z')!;
		const shifted = applyShiftToItem(item, delta);
		expect(shifted.startTime.toISOString()).toBe('2026-04-28T09:00:00.000Z');
		expect(shifted.endTime.toISOString()).toBe('2026-04-28T10:30:00.000Z');
	});

	it('preserves duration after the shift', () => {
		const item = {
			startTime: new Date('2026-04-17T09:00:00Z'),
			endTime: new Date('2026-04-17T10:30:00Z'),
		};
		const originalDur = item.endTime.getTime() - item.startTime.getTime();
		const delta = computeShiftDelta('2026-04-17T00:00:00Z', '2026-04-19T03:30:00Z')!;
		const shifted = applyShiftToItem(item, delta);
		expect(shifted.endTime.getTime() - shifted.startTime.getTime()).toBe(originalDur);
	});

	it('handles fractional minute differences via Math.round', () => {
		// If the dates differ by 30 seconds, the delta rounds to 1 minute.
		const oldS = '2026-04-17T00:00:00Z';
		const newS = '2026-04-17T00:00:30Z';
		expect(computeShiftDelta(oldS, newS)).toBe(1);
	});

	it('large deltas (years) still produce a finite minute count', () => {
		const delta = computeShiftDelta('2020-01-01T00:00:00Z', '2030-01-01T00:00:00Z');
		expect(delta).toBeGreaterThan(0);
		expect(Number.isFinite(delta)).toBe(true);
	});
});
