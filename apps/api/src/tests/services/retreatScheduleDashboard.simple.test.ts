/**
 * Pure-logic tests for the new schedule features added on top of MaM:
 *  - retreatScheduleService.dashboardStats aggregation
 *  - retreatScheduleService.autoAssignAngelitos candidate selection (partial_server)
 *  - retreatScheduleService.resolveSantisimoConflicts mealWindow detection
 *  - Frontend isRetreatLive computed (gating of live-only dashboard cards)
 *
 * These mirror the algorithms in apps/api/src/services/retreatScheduleService.ts
 * and apps/web/src/views/RetreatDashboardView.vue without booting TypeORM.
 */

// ── Types ─────────────────────────────────────────────────────────────────────
type ItemStatus = 'pending' | 'active' | 'completed' | 'delayed' | 'skipped';

interface ScheduleItem {
	id: string;
	retreatId: string;
	name: string;
	type: string;
	startTime: Date;
	endTime: Date;
	durationMinutes: number;
	status: ItemStatus;
	responsabilityId: string | null;
	responsability: { id: string; name: string } | null;
	responsables: Array<{ participantId: string }>;
	scheduleTemplateId: string | null;
	blocksSantisimoAttendance: boolean;
	actualStartTime: Date | null;
	actualEndTime: Date | null;
}

interface SantisimoSlot {
	id: string;
	retreatId: string;
	startTime: Date;
	endTime: Date;
	capacity: number;
	mealWindow: boolean;
	signups: Array<{ id: string; participantId: string | null }>;
}

interface Participant {
	id: string;
	retreatId: string;
	type: 'walker' | 'server' | 'waiting' | 'partial_server';
	tableId: string | null;
}

// ── Algorithms under test (mirror) ────────────────────────────────────────────

function dashboardStats(
	items: ScheduleItem[],
	slots: SantisimoSlot[],
	participants: Participant[],
	now: Date,
) {
	const todayStart = new Date(now);
	todayStart.setHours(0, 0, 0, 0);
	const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);

	const todayItems = items.filter(
		(it) => it.startTime >= todayStart && it.startTime < todayEnd,
	);
	const completedToday = todayItems.filter((it) => it.status === 'completed').length;

	const missingResponsable = items.filter(
		(it) =>
			!it.responsabilityId &&
			it.responsables.length === 0 &&
			(it.type === 'charla' || it.type === 'testimonio' || it.type === 'misa'),
	).length;

	const currentItem = items.find((it) => it.status === 'active') ?? null;
	const nextItem =
		items.find(
			(it) => (it.status === 'pending' || it.status === 'delayed') && it.startTime > now,
		) ?? null;

	let delayMinutes = 0;
	for (const it of todayItems) {
		if (it.status === 'completed' && it.actualEndTime) {
			const diff = Math.round((it.actualEndTime.getTime() - it.endTime.getTime()) / 60000);
			if (diff > 0) delayMinutes += diff;
		}
	}

	const totalSlots = slots.length;
	const coveredSlots = slots.filter((s) => s.signups.length >= s.capacity).length;
	const mealWindowSlots = slots.filter((s) => s.mealWindow).length;
	const unresolvedMealSlots = slots.filter(
		(s) => s.mealWindow && s.signups.length < s.capacity,
	).length;

	const angelitos = participants.filter((p) => p.type === 'partial_server');
	const angelitosTotal = angelitos.length;
	const angelitosInTable = angelitos.filter((p) => p.tableId !== null).length;
	const angelitosAvailable = angelitosTotal - angelitosInTable;

	return {
		currentItem,
		nextItem,
		today: { completed: completedToday, total: todayItems.length },
		items: {
			total: items.length,
			completed: items.filter((it) => it.status === 'completed').length,
			active: items.filter((it) => it.status === 'active').length,
			pending: items.filter((it) => it.status === 'pending').length,
			delayed: items.filter((it) => it.status === 'delayed').length,
			missingResponsable,
		},
		delayMinutes,
		santisimo: { totalSlots, coveredSlots, mealWindowSlots, unresolvedMealSlots },
		angelitos: { total: angelitosTotal, available: angelitosAvailable, inTable: angelitosInTable },
	};
}

/**
 * Mirror of `slots.mealWindow` recompute inside resolveSantisimoConflicts.
 * Returns the slots with the new mealWindow value applied.
 */
function recomputeMealWindow(
	items: ScheduleItem[],
	slots: SantisimoSlot[],
): SantisimoSlot[] {
	const blockers = items.filter((it) => it.blocksSantisimoAttendance);
	return slots.map((s) => ({
		...s,
		mealWindow: blockers.some(
			(b) => b.startTime < s.endTime && b.endTime > s.startTime,
		),
	}));
}

/**
 * Mirror of autoAssignAngelitos candidate selection. Returns participant ids
 * eligible to cover meal-window slots (type='partial_server' AND not in mesa).
 */
function angelitoPool(participants: Participant[]): string[] {
	return participants
		.filter((p) => p.type === 'partial_server' && p.tableId === null)
		.map((p) => p.id);
}

/**
 * Mirror of frontend RetreatDashboardView.isRetreatLive computed:
 * returns true iff today is in [startDate-1d, endDate].
 */
function isRetreatLive(
	startDate: Date | null,
	endDate: Date | null,
	today = new Date(),
): boolean {
	if (!startDate || !endDate) return false;
	const t = new Date(today);
	t.setHours(0, 0, 0, 0);
	const start = new Date(startDate);
	start.setHours(0, 0, 0, 0);
	start.setDate(start.getDate() - 1);
	const end = new Date(endDate);
	end.setHours(23, 59, 59, 999);
	return t >= start && t <= end;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function mkItem(overrides: Partial<ScheduleItem> = {}): ScheduleItem {
	const start = overrides.startTime ?? new Date('2026-04-25T19:00:00Z');
	const dur = overrides.durationMinutes ?? 30;
	return {
		id: 'i-' + Math.random().toString(36).slice(2, 8),
		retreatId: 'r1',
		name: 'item',
		type: 'otro',
		startTime: start,
		endTime: overrides.endTime ?? new Date(start.getTime() + dur * 60_000),
		durationMinutes: dur,
		status: 'pending',
		responsabilityId: null,
		responsability: null,
		responsables: [],
		scheduleTemplateId: null,
		blocksSantisimoAttendance: false,
		actualStartTime: null,
		actualEndTime: null,
		...overrides,
	};
}

function mkSlot(overrides: Partial<SantisimoSlot> = {}): SantisimoSlot {
	const start = overrides.startTime ?? new Date('2026-04-25T19:00:00Z');
	return {
		id: 's-' + Math.random().toString(36).slice(2, 8),
		retreatId: 'r1',
		startTime: start,
		endTime: overrides.endTime ?? new Date(start.getTime() + 30 * 60_000),
		capacity: 1,
		mealWindow: false,
		signups: [],
		...overrides,
	};
}

function mkP(overrides: Partial<Participant> = {}): Participant {
	return {
		id: 'p-' + Math.random().toString(36).slice(2, 8),
		retreatId: 'r1',
		type: 'walker',
		tableId: null,
		...overrides,
	};
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('dashboardStats aggregation', () => {
	const now = new Date('2026-04-25T18:00:00Z');

	it('counts today\'s items based on startTime same calendar day', () => {
		const todayMorning = new Date('2026-04-25T08:00:00Z');
		const yesterday = new Date('2026-04-24T20:00:00Z');
		const tomorrow = new Date('2026-04-26T08:00:00Z');
		const items = [
			mkItem({ startTime: todayMorning, status: 'completed' }),
			mkItem({ startTime: todayMorning, status: 'pending' }),
			mkItem({ startTime: yesterday, status: 'completed' }),
			mkItem({ startTime: tomorrow, status: 'pending' }),
		];
		const stats = dashboardStats(items, [], [], now);
		expect(stats.today.total).toBe(2);
		expect(stats.today.completed).toBe(1);
		expect(stats.items.total).toBe(4);
	});

	it('flags charlas/testimonios/misas without responsable as missing', () => {
		const items = [
			mkItem({ type: 'charla' }), // missing
			mkItem({ type: 'charla', responsabilityId: 'r-1' }), // covered
			mkItem({ type: 'testimonio', responsables: [{ participantId: 'p-1' }] }), // covered
			mkItem({ type: 'misa' }), // missing
			mkItem({ type: 'comida' }), // not in scope
			mkItem({ type: 'campana' }), // not in scope
		];
		const stats = dashboardStats(items, [], [], now);
		expect(stats.items.missingResponsable).toBe(2);
	});

	it('picks the active item as currentItem and the next pending as nextItem', () => {
		const items = [
			mkItem({ status: 'completed', startTime: new Date('2026-04-25T17:00:00Z') }),
			mkItem({ status: 'active', startTime: new Date('2026-04-25T17:30:00Z'), name: 'now' }),
			mkItem({ status: 'pending', startTime: new Date('2026-04-25T18:30:00Z'), name: 'next1' }),
			mkItem({ status: 'pending', startTime: new Date('2026-04-25T19:00:00Z'), name: 'next2' }),
		];
		// Items must be sorted by startTime for the algo to find next correctly
		items.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
		const stats = dashboardStats(items, [], [], now);
		expect(stats.currentItem?.name).toBe('now');
		expect(stats.nextItem?.name).toBe('next1');
	});

	it('sums delay only for completed items finished after planned endTime', () => {
		const start = new Date('2026-04-25T08:00:00Z');
		const end = new Date('2026-04-25T08:30:00Z');
		const items = [
			mkItem({
				startTime: start,
				endTime: end,
				status: 'completed',
				actualEndTime: new Date('2026-04-25T08:42:00Z'), // +12m
			}),
			mkItem({
				startTime: start,
				endTime: end,
				status: 'completed',
				actualEndTime: new Date('2026-04-25T08:25:00Z'), // -5m, ignored
			}),
			mkItem({ startTime: start, endTime: end, status: 'pending' }), // not finished
		];
		const stats = dashboardStats(items, [], [], now);
		expect(stats.delayMinutes).toBe(12);
	});

	it('computes santisimo coverage and meal-window stats', () => {
		const slots = [
			mkSlot({ capacity: 1, signups: [{ id: 'a', participantId: 'p1' }] }), // covered
			mkSlot({ capacity: 1, signups: [], mealWindow: true }), // unresolved meal
			mkSlot({ capacity: 2, signups: [{ id: 'b', participantId: 'p2' }] }), // partial, mealWindow false
			mkSlot({ capacity: 1, signups: [{ id: 'c', participantId: 'p3' }], mealWindow: true }), // covered meal
		];
		const stats = dashboardStats([], slots, [], now);
		expect(stats.santisimo).toEqual({
			totalSlots: 4,
			coveredSlots: 2,
			mealWindowSlots: 2,
			unresolvedMealSlots: 1,
		});
	});

	it('counts angelitos by type=partial_server and splits by tableId', () => {
		const participants = [
			mkP({ type: 'partial_server', tableId: null }),
			mkP({ type: 'partial_server', tableId: null }),
			mkP({ type: 'partial_server', tableId: 't-1' }), // in mesa, unavailable
			mkP({ type: 'walker', tableId: null }), // not angelito
			mkP({ type: 'server', tableId: 't-1' }), // not angelito
		];
		const stats = dashboardStats([], [], participants, now);
		expect(stats.angelitos).toEqual({ total: 3, available: 2, inTable: 1 });
	});
});

describe('recomputeMealWindow', () => {
	it('marks slots that overlap a blocking item', () => {
		const cena = mkItem({
			type: 'comida',
			startTime: new Date('2026-04-25T19:00:00Z'),
			endTime: new Date('2026-04-25T19:30:00Z'),
			blocksSantisimoAttendance: true,
		});
		const slotInside = mkSlot({
			startTime: new Date('2026-04-25T19:10:00Z'),
			endTime: new Date('2026-04-25T19:20:00Z'),
		});
		const slotOutside = mkSlot({
			startTime: new Date('2026-04-25T20:00:00Z'),
			endTime: new Date('2026-04-25T20:30:00Z'),
		});
		const result = recomputeMealWindow([cena], [slotInside, slotOutside]);
		expect(result.find((s) => s.id === slotInside.id)?.mealWindow).toBe(true);
		expect(result.find((s) => s.id === slotOutside.id)?.mealWindow).toBe(false);
	});

	it('non-blocking items do not flag any slot', () => {
		const charla = mkItem({
			type: 'charla',
			startTime: new Date('2026-04-25T19:00:00Z'),
			endTime: new Date('2026-04-25T19:30:00Z'),
			blocksSantisimoAttendance: false,
		});
		const slot = mkSlot({
			startTime: new Date('2026-04-25T19:10:00Z'),
			endTime: new Date('2026-04-25T19:20:00Z'),
		});
		const result = recomputeMealWindow([charla], [slot]);
		expect(result[0].mealWindow).toBe(false);
	});

	it('respects half-open interval: a slot ending exactly at start is NOT a meal window', () => {
		const comida = mkItem({
			type: 'comida',
			startTime: new Date('2026-04-25T19:00:00Z'),
			endTime: new Date('2026-04-25T19:30:00Z'),
			blocksSantisimoAttendance: true,
		});
		const adjacent = mkSlot({
			startTime: new Date('2026-04-25T18:30:00Z'),
			endTime: new Date('2026-04-25T19:00:00Z'),
		});
		const result = recomputeMealWindow([comida], [adjacent]);
		expect(result[0].mealWindow).toBe(false);
	});
});

describe('angelitoPool', () => {
	it('only includes partial_server participants not seated at a mesa', () => {
		const participants = [
			mkP({ id: 'angel-free', type: 'partial_server', tableId: null }),
			mkP({ id: 'angel-mesa', type: 'partial_server', tableId: 't-1' }),
			mkP({ id: 'walker', type: 'walker', tableId: null }),
			mkP({ id: 'server', type: 'server', tableId: null }),
			mkP({ id: 'waiting', type: 'waiting', tableId: null }),
		];
		expect(angelitoPool(participants)).toEqual(['angel-free']);
	});

	it('returns empty array when no partial_server participants exist', () => {
		const participants = [
			mkP({ type: 'walker' }),
			mkP({ type: 'server' }),
		];
		expect(angelitoPool(participants)).toEqual([]);
	});

	it('does not match nicknames containing "angel" — must be the explicit type', () => {
		// The previous heuristic matched names; the new logic uses type only.
		const participants = [
			mkP({ id: 'misnamed', type: 'walker' }), // nickname could be "Angel" but type=walker
			mkP({ id: 'real-angelito', type: 'partial_server' }),
		];
		expect(angelitoPool(participants)).toEqual(['real-angelito']);
	});
});

// ── materializeFromTemplate date math ─────────────────────────────────────────
// Mirrors the date computation inside RetreatScheduleService.materializeFromTemplate
// when cloning template items into a retreat.

interface TemplateItem {
	defaultDay: number;
	defaultStartTime: string | null;
	defaultDurationMinutes: number;
	defaultOrder: number;
}

function materializeDate(
	baseDate: Date,
	t: TemplateItem,
): { startTime: Date; endTime: Date } {
	const day = t.defaultDay ?? 1;
	const itemDate = new Date(baseDate);
	itemDate.setDate(itemDate.getDate() + (day - 1));
	let h = 9;
	let m = 0;
	if (t.defaultStartTime) {
		const parts = t.defaultStartTime.split(':');
		h = parseInt(parts[0] ?? '9', 10);
		m = parseInt(parts[1] ?? '0', 10);
	}
	itemDate.setHours(h, m, 0, 0);
	const duration = t.defaultDurationMinutes ?? 15;
	const endTime = new Date(itemDate.getTime() + duration * 60_000);
	return { startTime: itemDate, endTime };
}

describe('materializeFromTemplate — date math', () => {
	const base = new Date(2026, 7, 28); // local 2026-08-28 00:00 (Friday)

	it('day=1 places the item on baseDate at the configured time', () => {
		const { startTime } = materializeDate(base, {
			defaultDay: 1,
			defaultStartTime: '17:30',
			defaultDurationMinutes: 50,
			defaultOrder: 40,
		});
		expect(startTime.getFullYear()).toBe(2026);
		expect(startTime.getMonth()).toBe(7);
		expect(startTime.getDate()).toBe(28);
		expect(startTime.getHours()).toBe(17);
		expect(startTime.getMinutes()).toBe(30);
	});

	it('day=2 advances exactly +1 calendar day', () => {
		const { startTime } = materializeDate(base, {
			defaultDay: 2,
			defaultStartTime: '06:00',
			defaultDurationMinutes: 30,
			defaultOrder: 10,
		});
		expect(startTime.getDate()).toBe(29); // baseDate + 1
		expect(startTime.getMonth()).toBe(7);
		expect(startTime.getHours()).toBe(6);
	});

	it('day=3 advances +2 calendar days even across a month boundary', () => {
		// August has 31 days. day 3 of a retreat starting Aug 30 -> Sep 1.
		const baseLate = new Date(2026, 7, 30);
		const { startTime } = materializeDate(baseLate, {
			defaultDay: 3,
			defaultStartTime: '07:00',
			defaultDurationMinutes: 30,
			defaultOrder: 50,
		});
		expect(startTime.getMonth()).toBe(8); // September
		expect(startTime.getDate()).toBe(1);
	});

	it('falls back to 09:00 when defaultStartTime is null', () => {
		const { startTime } = materializeDate(base, {
			defaultDay: 1,
			defaultStartTime: null,
			defaultDurationMinutes: 60,
			defaultOrder: 0,
		});
		expect(startTime.getHours()).toBe(9);
		expect(startTime.getMinutes()).toBe(0);
	});

	it('endTime equals startTime + durationMinutes', () => {
		const { startTime, endTime } = materializeDate(base, {
			defaultDay: 1,
			defaultStartTime: '19:00',
			defaultDurationMinutes: 80, // Presentaciones individuales
			defaultOrder: 110,
		});
		const diff = (endTime.getTime() - startTime.getTime()) / 60_000;
		expect(diff).toBe(80);
		expect(endTime.getHours()).toBe(20);
		expect(endTime.getMinutes()).toBe(20);
	});

	it('keeps order stable when many items share the same day/start', () => {
		// Two items with the same day and start time but different order should
		// produce identical timestamps. The algorithm relies on the database query
		// ordering (defaultOrder ASC), not the date itself.
		const item1: TemplateItem = {
			defaultDay: 1,
			defaultStartTime: '21:30',
			defaultDurationMinutes: 7,
			defaultOrder: 180,
		};
		const item2: TemplateItem = {
			defaultDay: 1,
			defaultStartTime: '21:30',
			defaultDurationMinutes: 7,
			defaultOrder: 181,
		};
		const a = materializeDate(base, item1);
		const b = materializeDate(base, item2);
		expect(a.startTime.getTime()).toBe(b.startTime.getTime());
	});
});

describe('isRetreatLive (frontend dashboard gating)', () => {
	// Build dates in local TZ to match the algorithm (which uses setHours()
	// against local time). new Date(year, monthIdx, day) is local-midnight.
	const start = new Date(2026, 3, 25); // local 2026-04-25 00:00
	const end = new Date(2026, 3, 27); // local 2026-04-27 00:00

	it('returns true on the day before start (preparation grace)', () => {
		expect(isRetreatLive(start, end, new Date(2026, 3, 24, 15, 0))).toBe(true);
	});

	it('returns true on each day of the retreat', () => {
		expect(isRetreatLive(start, end, new Date(2026, 3, 25, 10, 0))).toBe(true);
		expect(isRetreatLive(start, end, new Date(2026, 3, 26, 10, 0))).toBe(true);
		expect(isRetreatLive(start, end, new Date(2026, 3, 27, 22, 0))).toBe(true);
	});

	it('returns false 3 days before start', () => {
		expect(isRetreatLive(start, end, new Date(2026, 3, 22, 12, 0))).toBe(false);
	});

	it('returns false the day after end', () => {
		expect(isRetreatLive(start, end, new Date(2026, 3, 28, 12, 0))).toBe(false);
	});

	it('returns false when start or end is missing', () => {
		expect(isRetreatLive(null, end)).toBe(false);
		expect(isRetreatLive(start, null)).toBe(false);
		expect(isRetreatLive(null, null)).toBe(false);
	});
});
