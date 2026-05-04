/**
 * computeItemDateRange — pure-logic tests for the TZ-shift fix in
 * `materializeFromTemplate` and `addMissingTemplateItems`.
 *
 * The bug:
 *   - Controller does `new Date(req.body.baseDate)` where body has
 *     "2026-04-26" → parsed as 2026-04-26T00:00:00Z (UTC midnight).
 *   - Old code used `.getDate()` (server-local) on that Date, which
 *     returns the previous day in any UTC- timezone.
 *   - Then `.setHours(h, m)` (also server-local) further compounded.
 *   - Net effect: Day 1 items landed on the wrong calendar date in
 *     non-UTC dev environments. (Prod runs UTC so it didn't manifest
 *     there — but it surfaced during local simulation.)
 *
 * The fix:
 *   - Read baseDate's UTC year/month/day components.
 *   - Construct the result via `new Date(yyyy, mm, dd + offset, h, m)`
 *     which is server-local — so HH:MM still means "HH:MM in the place
 *     where the server runs", matching coordinator intent.
 *
 * We can't easily exercise this across all timezones in jest, so the
 * tests cover the math + invariants that should hold regardless of TZ.
 */

function computeItemDateRange(
	baseDate: Date,
	day: number,
	defaultStartTime: string | null | undefined,
	durationMinutes: number,
): { startTime: Date; endTime: Date } {
	let h = 9;
	let m = 0;
	if (defaultStartTime) {
		const parts = defaultStartTime.split(':');
		h = parseInt(parts[0] ?? '9', 10);
		m = parseInt(parts[1] ?? '0', 10);
	}
	const yyyy = baseDate.getUTCFullYear();
	const mm = baseDate.getUTCMonth();
	const dd = baseDate.getUTCDate();
	// "After-midnight" items (h < 6) belong to the previous day's evening
	// flow but on the calendar happen the next morning — see Bug K.
	const dayOffset = h < 6 ? day : day - 1;
	const startTime = new Date(yyyy, mm, dd + dayOffset, h, m, 0, 0);
	const endTime = new Date(startTime.getTime() + durationMinutes * 60_000);
	return { startTime, endTime };
}

describe('computeItemDateRange — TZ-safe materialization', () => {
	const baseDate = new Date('2026-04-26T00:00:00.000Z'); // UTC midnight

	it('Day 1 matches baseDate calendar day (no off-by-one)', () => {
		const { startTime } = computeItemDateRange(baseDate, 1, '09:00', 30);
		// Local components must reflect April 26, regardless of server TZ
		expect(startTime.getFullYear()).toBe(2026);
		expect(startTime.getMonth()).toBe(3); // April (0-indexed)
		expect(startTime.getDate()).toBe(26);
		expect(startTime.getHours()).toBe(9);
		expect(startTime.getMinutes()).toBe(0);
	});

	it('Day 2 → April 27', () => {
		const { startTime } = computeItemDateRange(baseDate, 2, '07:30', 60);
		expect(startTime.getDate()).toBe(27);
		expect(startTime.getHours()).toBe(7);
		expect(startTime.getMinutes()).toBe(30);
	});

	it('Day 3 → April 28', () => {
		const { startTime } = computeItemDateRange(baseDate, 3, '20:15', 45);
		expect(startTime.getDate()).toBe(28);
		expect(startTime.getHours()).toBe(20);
		expect(startTime.getMinutes()).toBe(15);
	});

	it('cross-month boundary: baseDate=April 30, Day 3 → May 2', () => {
		const lateApril = new Date('2026-04-30T00:00:00.000Z');
		const { startTime } = computeItemDateRange(lateApril, 3, '08:00', 30);
		expect(startTime.getMonth()).toBe(4); // May
		expect(startTime.getDate()).toBe(2);
	});

	it('cross-year boundary: baseDate=Dec 30 2025, Day 4 → Jan 2 2026', () => {
		const dec30 = new Date('2025-12-30T00:00:00.000Z');
		const { startTime } = computeItemDateRange(dec30, 4, '09:00', 30);
		expect(startTime.getFullYear()).toBe(2026);
		expect(startTime.getMonth()).toBe(0); // January
		expect(startTime.getDate()).toBe(2);
	});

	it('endTime = startTime + durationMinutes (preserved)', () => {
		const { startTime, endTime } = computeItemDateRange(baseDate, 1, '09:00', 75);
		expect(endTime.getTime() - startTime.getTime()).toBe(75 * 60_000);
	});

	it('falls back to 09:00 when defaultStartTime is null', () => {
		const { startTime } = computeItemDateRange(baseDate, 1, null, 30);
		expect(startTime.getHours()).toBe(9);
		expect(startTime.getMinutes()).toBe(0);
	});

	it('falls back to 09:00 when defaultStartTime is undefined', () => {
		const { startTime } = computeItemDateRange(baseDate, 1, undefined, 30);
		expect(startTime.getHours()).toBe(9);
	});

	it('parses "07:05" preserving leading zero in minutes', () => {
		const { startTime } = computeItemDateRange(baseDate, 1, '07:05', 15);
		expect(startTime.getHours()).toBe(7);
		expect(startTime.getMinutes()).toBe(5);
	});

	it('a baseDate parsed from a YYYY-MM-DD string lands on the same calendar day', () => {
		// Simulates controller: new Date(req.body.baseDate) where body is "2026-04-26"
		const fromString = new Date('2026-04-26');
		const { startTime } = computeItemDateRange(fromString, 1, '09:00', 30);
		// Even though `fromString` is UTC midnight, our fix reads getUTCDate=26,
		// so Day 1 is April 26 in local time.
		expect(startTime.getDate()).toBe(26);
		expect(startTime.getMonth()).toBe(3);
	});

	it('two adjacent days end up exactly 24h apart at the same HH:MM', () => {
		const d1 = computeItemDateRange(baseDate, 1, '09:00', 30).startTime;
		const d2 = computeItemDateRange(baseDate, 2, '09:00', 30).startTime;
		// Note: across DST transitions this could fail, but our test dates
		// don't cross DST in MX/CO timezones. Safe assertion.
		const diffHours = (d2.getTime() - d1.getTime()) / 3_600_000;
		expect(diffHours).toBeGreaterThanOrEqual(23);
		expect(diffHours).toBeLessThanOrEqual(25);
	});

	// Bug K: Polanco template has items on Día 1 with startTime '00:00' and
	// '00:10' (Vigilia / Explicación de Adoración). They're after-midnight
	// of Día 1, so they belong to Día 1's logical evening flow but on the
	// CALENDAR they happen the next morning. Without the dayOffset shift
	// they sort BEFORE the rest of Día 1 (e.g. 00:00 < 15:00) and appear
	// at the start of the day, which is the bug the user reported.
	describe('Bug K — after-midnight items shift to next calendar day', () => {
		it('Día 1 at 00:10 → calendar day 27 (next morning of base 26)', () => {
			const { startTime } = computeItemDateRange(baseDate, 1, '00:10', 360);
			expect(startTime.getDate()).toBe(27);
			expect(startTime.getHours()).toBe(0);
			expect(startTime.getMinutes()).toBe(10);
		});

		it('Día 1 at 23:50 stays on calendar day 26 (still evening)', () => {
			const { startTime } = computeItemDateRange(baseDate, 1, '23:50', 10);
			expect(startTime.getDate()).toBe(26);
			expect(startTime.getHours()).toBe(23);
		});

		it('Día 1 at 05:59 still treated as next-morning (boundary)', () => {
			const { startTime } = computeItemDateRange(baseDate, 1, '05:59', 1);
			expect(startTime.getDate()).toBe(27);
		});

		it('Día 1 at 06:00 stays on calendar day 26 (boundary, normal day)', () => {
			const { startTime } = computeItemDateRange(baseDate, 1, '06:00', 30);
			expect(startTime.getDate()).toBe(26);
		});

		it('chronological sort respects evening-then-night order on Día 1', () => {
			// Items: 22:00 evening → 23:50 evening → 00:00 next morning →
			// 00:10 next morning. After fix, sorted by startTime they should be
			// in the same order (not 00:00, 00:10, 22:00, 23:50 like before).
			const evening1 = computeItemDateRange(baseDate, 1, '22:00', 30).startTime;
			const evening2 = computeItemDateRange(baseDate, 1, '23:50', 10).startTime;
			const night1 = computeItemDateRange(baseDate, 1, '00:00', 10).startTime;
			const night2 = computeItemDateRange(baseDate, 1, '00:10', 360).startTime;
			expect(evening1.getTime()).toBeLessThan(evening2.getTime());
			expect(evening2.getTime()).toBeLessThan(night1.getTime());
			expect(night1.getTime()).toBeLessThan(night2.getTime());
		});

		it('Día 2 at 06:00 lands on calendar day 27 (no shift, normal day-2 morning)', () => {
			const { startTime } = computeItemDateRange(baseDate, 2, '06:00', 30);
			expect(startTime.getDate()).toBe(27);
		});

		it('Día 2 at 00:30 lands on calendar day 28 (Día 2 evening flow into next morning)', () => {
			const { startTime } = computeItemDateRange(baseDate, 2, '00:30', 60);
			expect(startTime.getDate()).toBe(28);
		});
	});
});
