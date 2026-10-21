import { describe, it, expect } from 'vitest';
import { applyOps, KINDS, matchQueueable, type OutboxOp } from '../outboxKinds';

/** specs/offline-mode M4 + D13: the writes that wait for signal and how each one paints the saved data. */

const R = 'r1';
const AT = '2026-10-17T22:30:00.000Z';

function op(kind: OutboxOp['kind'], body: any, meta: OutboxOp['meta'], extra: Partial<OutboxOp> = {}): OutboxOp {
	return {
		id: `000-${kind}`,
		key: 'k',
		kind,
		method: KINDS.find((k) => k.kind === kind)!.method,
		url: '/x',
		body,
		retreatId: R,
		userId: 'u1',
		occurredAt: AT,
		status: 'pending',
		attempts: 0,
		lastError: null,
		lastStatus: null,
		meta,
		...extra,
	};
}

const reception = () => ({
	total: 3,
	arrived: 1,
	pending: 2,
	pendingList: [
		{ participantId: 'p1', firstName: 'Ana', totalPaid: 0, checkedIn: false, checkedInAt: null },
		{ participantId: 'p2', firstName: 'Beto', totalPaid: 500, checkedIn: false, checkedInAt: null },
	],
	arrivedList: [{ participantId: 'p3', firstName: 'Ceci', checkedIn: true, checkedInAt: '2026-10-16T23:00:00Z' }],
});

const participants = () => [
	{ id: 'p1', firstName: 'Ana', lastName: 'López', tableId: 't1', totalPaid: 0, paymentRemaining: 3000, paymentStatus: 'unpaid', payments: [] },
	{ id: 'p2', firstName: 'Beto', lastName: 'Ruiz', tableId: null, bagMade: false },
];

const schedule = () => [
	{ id: 'i1', day: 1, name: 'Bienvenida', startTime: '2026-10-16T23:00:00.000Z', endTime: '2026-10-16T23:30:00.000Z', status: 'pending' },
	{ id: 'i2', day: 1, name: 'Cena', startTime: '2026-10-17T00:00:00.000Z', endTime: '2026-10-17T01:00:00.000Z', status: 'pending' },
	{ id: 'i3', day: 2, name: 'Desayuno', startTime: '2026-10-17T14:00:00.000Z', endTime: '2026-10-17T15:00:00.000Z', status: 'pending' },
];

const beds = () => [
	{ id: 'b1', roomNumber: '1', bedNumber: '1', participantId: 'p1', participant: { id: 'p1', firstName: 'Ana' } },
	{ id: 'b2', roomNumber: '1', bedNumber: '2', participantId: null, participant: null },
];

const tables = () => [
	{ id: 't1', name: 'Mesa 1', lider: { id: 's1' }, walkers: [{ id: 'p1', firstName: 'Ana' }] },
	{ id: 't2', name: 'Mesa 2', lider: null, walkers: [] },
];

describe('matchQueueable', () => {
	it.each([
		['put', '/participants/p1/checkin', { retreatId: R, checkedIn: true }, 'reception.checkin', R],
		['post', '/payments', { retreatId: R, participantId: 'p1', amount: 500 }, 'reception.payment', R],
		['put', '/participants/0f8fad5b-d9cb-469f-a165-70867728950e', { isCancelled: true, contextRetreatId: R }, 'participant.setCancelled', R],
		['patch', `/history/retreat/${R}/participant/p1/bag-made`, { bagMade: true }, 'bags.bagMade', R],
		['post', '/schedule/items/i1/start', undefined, 'schedule.start', null],
		['post', '/schedule/items/i1/complete', undefined, 'schedule.complete', null],
		['post', '/schedule/items/i1/shift', { minutesDelta: 5 }, 'schedule.shift', null],
		['post', `/schedule/retreats/${R}/days/2/shift`, { minutesDelta: -5 }, 'schedule.shiftDay', R],
		['put', '/retreat-beds/b2/assign', { participantId: 'p2' }, 'beds.assign', null],
		['post', '/tables/t2/walkers', { participantId: 'p2' }, 'tables.assignWalker', null],
		['delete', '/tables/t1/walkers/p1', undefined, 'tables.unassignWalker', null],
	])('%s %s → %s', (method, path, body, kind, retreatId) => {
		const m = matchQueueable(method, path, body);
		expect(m?.def.kind).toBe(kind);
		expect(m?.retreatId).toBe(retreatId);
	});

	it('a full-record edit of a participant is never queued', () => {
		const full = { firstName: 'Ana', isCancelled: true, contextRetreatId: R };
		expect(matchQueueable('put', '/participants/0f8fad5b-d9cb-469f-a165-70867728950e', full)).toBeNull();
	});

	it.each([
		['post', '/participants/new'],
		['post', `/retreats/${R}/auto-assign-beds`],
		['delete', `/retreats/${R}/bed-assignments`],
		['post', `/schedule/retreats/${R}/bell`],
		['patch', '/schedule/items/i1'],
		['get', '/participants'],
	])('%s %s is not queueable', (method, path) => {
		expect(matchQueueable(method, path, {})).toBeNull();
	});

	it('a payment without participant or retreat is not queued', () => {
		expect(matchQueueable('post', '/payments', { amount: 1 })).toBeNull();
	});

	describe('record edit without signal (D13)', () => {
		const PATH = '/participants/0f8fad5b-d9cb-469f-a165-70867728950e';

		it('the changed fields of the list, with expectedValues, are queued', () => {
			const body = { cellPhone: '5599998888', expectedValues: { cellPhone: '5512345678' }, contextRetreatId: R };
			const m = matchQueueable('put', PATH, body);
			expect(m?.def.kind).toBe('participant.edit');
			expect(m?.retreatId).toBe(R);
		});

		it.each([
			['no expectedValues (the regular edit)', { cellPhone: '5599998888', contextRetreatId: R }],
			['a field outside the list (email)', { email: 'x@example.com', expectedValues: { email: 'a@example.com' } }],
			['a health field', { medicationDetails: 'x', expectedValues: { medicationDetails: null } }],
			['a retreat field (isCancelled)', { isCancelled: true, parish: 'x', expectedValues: { parish: 'y' } }],
			['expectedValues outside the list', { parish: 'x', expectedValues: { email: 'a@example.com' } }],
			['nothing to change', { expectedValues: {}, contextRetreatId: R }],
		])('%s is not queued', (_label, body) => {
			expect(matchQueueable('put', PATH, body)).toBeNull();
		});

		it('the no-show cancellation is still its own kind', () => {
			expect(matchQueueable('put', PATH, { isCancelled: true, contextRetreatId: R })?.def.kind).toBe(
				'participant.setCancelled',
			);
		});
	});
});

describe('reducers', () => {
	it('check-in moves the walker to Llegaron with the device time', () => {
		const out: any = applyOps('reception', reception(), [
			op('reception.checkin', { retreatId: R, checkedIn: true }, { participantId: 'p1' }),
		]);
		expect(out.pendingList.map((e: any) => e.participantId)).toEqual(['p2']);
		expect(out.arrivedList.at(-1)).toMatchObject({ participantId: 'p1', checkedIn: true, checkedInAt: AT });
		expect(out).toMatchObject({ total: 3, arrived: 2, pending: 1 });
	});

	it('undo moves it back and clears the time', () => {
		const out: any = applyOps('reception', reception(), [
			op('reception.checkin', { retreatId: R, checkedIn: false }, { participantId: 'p3' }),
		]);
		expect(out.pendingList.at(-1)).toMatchObject({ participantId: 'p3', checkedIn: false, checkedInAt: null });
		expect(out).toMatchObject({ arrived: 0, pending: 3 });
	});

	it('a payment adds to what reception and the list show as paid', () => {
		const pay = op('reception.payment', { retreatId: R, participantId: 'p1', amount: 1000, paymentMethod: 'cash' }, { participantId: 'p1' });
		const rec: any = applyOps('reception', reception(), [pay]);
		const list: any = applyOps('participants', participants(), [pay]);
		expect(rec.pendingList[0].totalPaid).toBe(1000);
		expect(list[0]).toMatchObject({ totalPaid: 1000, paymentRemaining: 2000, paymentStatus: 'partial' });
		expect(list[0].payments).toHaveLength(1);
	});

	it('cancelling a no-show takes them out of reception, their bed and their table', () => {
		const cancel = op('participant.setCancelled', { isCancelled: true, contextRetreatId: R }, { participantId: 'p1' });
		const rec: any = applyOps('reception', reception(), [cancel]);
		const bedList: any = applyOps('beds', beds(), [cancel]);
		const tableList: any = applyOps('tables', tables(), [cancel]);
		const list: any = applyOps('participants', participants(), [cancel]);
		expect(rec).toMatchObject({ total: 2, pending: 1 });
		expect(bedList[0]).toMatchObject({ participantId: null, participant: null });
		expect(tableList[0].walkers).toEqual([]);
		expect(list[0]).toMatchObject({ isCancelled: true, tableId: null });
	});

	it('a record edit paints the new values wherever the person shows up', () => {
		const edit = op(
			'participant.edit',
			{ firstName: 'Anita', cellPhone: '5599998888', expectedValues: { firstName: 'Ana', cellPhone: null }, contextRetreatId: R },
			{ participantId: 'p1' },
		);
		const list: any = applyOps('participants', participants(), [edit]);
		const rec: any = applyOps('reception', reception(), [edit]);
		const bedList: any = applyOps('beds', beds(), [edit]);
		const tableList: any = applyOps('tables', tables(), [edit]);

		expect(list[0]).toMatchObject({ firstName: 'Anita', cellPhone: '5599998888', lastName: 'López' });
		expect(list[0]).not.toHaveProperty('expectedValues');
		expect(list[1].firstName).toBe('Beto');
		expect(rec.pendingList[0].firstName).toBe('Anita');
		// Only the keys a reception entry, a bed card or a table chip already show.
		expect(rec.pendingList[0]).not.toHaveProperty('cellPhone');
		expect(bedList[0].participant).toEqual({ id: 'p1', firstName: 'Anita' });
		expect(tableList[0].walkers[0]).toEqual({ id: 'p1', firstName: 'Anita' });
	});

	it('bag made', () => {
		const out: any = applyOps('participants', participants(), [
			op('bags.bagMade', { bagMade: true }, { participantId: 'p2' }),
		]);
		expect(out[1].bagMade).toBe(true);
	});

	it('start and complete keep the device time', () => {
		const out: any = applyOps('schedule', schedule(), [
			op('schedule.start', { occurredAt: AT }, { itemId: 'i1' }),
			op('schedule.complete', { occurredAt: AT }, { itemId: 'i2' }),
		]);
		expect(out[0]).toMatchObject({ status: 'active', actualStartTime: AT });
		expect(out[1]).toMatchObject({ status: 'completed', actualEndTime: AT });
	});

	it('+5 on an item moves it and the rest of its day, not the next day', () => {
		const out: any = applyOps('schedule', schedule(), [
			op('schedule.shift', { minutesDelta: 5, propagate: true }, { itemId: 'i1' }),
		]);
		expect(out[0].startTime).toBe('2026-10-16T23:05:00.000Z');
		expect(out[1].startTime).toBe('2026-10-17T00:05:00.000Z');
		expect(out[2].startTime).toBe('2026-10-17T14:00:00.000Z');
		// i1 was due before the device time and still pending: the server marks it late.
		expect(out[0].status).toBe('delayed');
		expect(out[1].status).toBe('delayed');
	});

	it('propagate:false moves only that item', () => {
		const out: any = applyOps('schedule', schedule(), [
			op('schedule.shift', { minutesDelta: -5, propagate: false }, { itemId: 'i2' }),
		]);
		expect(out[0].startTime).toBe('2026-10-16T23:00:00.000Z');
		expect(out[1].startTime).toBe('2026-10-16T23:55:00.000Z');
	});

	it('moving a day shifts only that day', () => {
		const out: any = applyOps('schedule', schedule(), [
			op('schedule.shiftDay', { minutesDelta: 10 }, { day: 2 }),
		]);
		expect(out[0].startTime).toBe('2026-10-16T23:00:00.000Z');
		expect(out[2]).toMatchObject({ startTime: '2026-10-17T14:10:00.000Z', endTime: '2026-10-17T15:10:00.000Z' });
	});

	it('moving someone to another bed frees the old one and paints the new card', () => {
		const out: any = applyOps('beds', beds(), [
			op('beds.assign', { participantId: 'p1' }, { bedId: 'b2', participantId: 'p1', participant: { id: 'p1', firstName: 'Ana' } }),
		]);
		expect(out[0]).toMatchObject({ participantId: null, participant: null });
		expect(out[1]).toMatchObject({ participantId: 'p1', participant: { firstName: 'Ana' } });
	});

	it('freeing a bed', () => {
		const out: any = applyOps('beds', beds(), [op('beds.assign', { participantId: null }, { bedId: 'b1' })]);
		expect(out[0]).toMatchObject({ participantId: null, participant: null });
	});

	it('moving a walker to another table', () => {
		const move = op('tables.assignWalker', { participantId: 'p1' }, { tableId: 't2', participantId: 'p1', participant: { id: 'p1', firstName: 'Ana' } });
		const out: any = applyOps('tables', tables(), [move]);
		expect(out[0].walkers).toEqual([]);
		expect(out[1].walkers.map((w: any) => w.id)).toEqual(['p1']);
		const single: any = applyOps('table', tables()[1], [move]);
		expect(single.walkers.map((w: any) => w.id)).toEqual(['p1']);
		const list: any = applyOps('participants', participants(), [move]);
		expect(list[0].tableId).toBe('t2');
	});

	it('removing a walker from a table', () => {
		const out: any = applyOps('tables', tables(), [
			op('tables.unassignWalker', undefined, { tableId: 't1', walkerId: 'p1', participantId: 'p1' }),
		]);
		expect(out[0].walkers).toEqual([]);
	});

	it('never mutates the saved data it is given', () => {
		const saved = reception();
		applyOps('reception', saved, [op('reception.checkin', { checkedIn: true }, { participantId: 'p1' })]);
		expect(saved.pendingList).toHaveLength(2);
	});

	it('routes a write does not touch are returned as they were', () => {
		const saved = schedule();
		expect(applyOps('schedule', saved, [op('bags.bagMade', { bagMade: true }, { participantId: 'p1' })])).toBe(saved);
	});

	it('every kind has a label for the pending-changes panel', () => {
		for (const def of KINDS) {
			const label = def.label(op(def.kind, { checkedIn: true, participantId: 'p1', minutesDelta: 5 }, { name: 'Ana', item: 'Cena', bed: '1-1', table: 'Mesa 1', amount: 5, day: 1 }));
			expect(label.key).toMatch(/^offline\.ops\./);
		}
	});
});
