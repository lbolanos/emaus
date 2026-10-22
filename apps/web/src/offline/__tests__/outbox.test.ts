import { describe, it, expect, beforeEach } from 'vitest';
import { createMemoryStore, getOfflineStore, setOfflineStoreForTests } from '../storage';
import { answerFromCache, saveResponse, setCacheUser, type CachedResponse } from '../readCache';
import {
	_reloadOutboxForTests,
	commitToSavedAnswers,
	conflictOps,
	discardOp,
	enqueue,
	markConflict,
	outbox,
	pendingOps,
	removeOp,
	retryOp,
} from '../outbox';
import { matchQueueable, type OutboxOp } from '../outboxKinds';
import { _resetConnectivityForTests } from '../connectivity';

/** specs/offline-mode M4: the queue on the device and how it paints the screens. */

const R = 'r1';
const AT = '2026-10-17T22:30:00.000Z';
const offline = () => Object.assign(new Error('Network Error'), { isAxiosError: true, code: 'ERR_NETWORK' });

async function seed() {
	await saveResponse({ url: '/participants', params: { retreatId: R, includePayments: true } }, [
		{ id: 'p1', firstName: 'Ana', lastName: 'López', tableId: 't1', medicationDetails: 'x' },
		{ id: 'p2', firstName: 'Beto', lastName: 'Ruiz', tableId: null },
	]);
	await saveResponse({ url: `/participants/reception/${R}` }, {
		total: 2,
		arrived: 0,
		pending: 2,
		pendingList: [
			{ participantId: 'p1', firstName: 'Ana', lastName: 'López', totalPaid: 0 },
			{ participantId: 'p2', firstName: 'Beto', lastName: 'Ruiz', totalPaid: 0 },
		],
		arrivedList: [],
	});
	await saveResponse({ url: `/schedule/retreats/${R}/items` }, [
		{ id: 'i1', retreatId: R, day: 1, name: 'Bienvenida', startTime: '2026-10-16T23:00:00.000Z', endTime: '2026-10-16T23:30:00.000Z', status: 'pending' },
	]);
	await saveResponse({ url: `/retreats/${R}/beds` }, [
		{ id: 'b1', roomNumber: '3', bedNumber: '2', participantId: null, participant: null },
	]);
	await saveResponse({ url: `/tables/retreat/${R}` }, [
		{ id: 't1', name: 'Mesa 1', walkers: [{ id: 'p1', firstName: 'Ana', lastName: 'López' }] },
		{ id: 't2', name: 'Mesa 2', walkers: [] },
	]);
}

function queue(method: string, path: string, body: any, key = crypto.randomUUID()) {
	const match = matchQueueable(method, path, body)!;
	return enqueue({ match, method, path, body, key, occurredAt: AT });
}

describe('outbox', () => {
	beforeEach(async () => {
		setOfflineStoreForTests(createMemoryStore());
		setCacheUser('u1');
		_resetConnectivityForTests(false);
		await _reloadOutboxForTests();
		await seed();
	});

	it('a check-in is saved with the walker name and answered like the server would', async () => {
		const { op, response } = await queue('put', '/participants/p1/checkin', { retreatId: R, checkedIn: true, occurredAt: AT });

		expect(op).toMatchObject({ kind: 'reception.checkin', retreatId: R, status: 'pending', userId: 'u1' });
		expect(op.meta.name).toBe('Ana López');
		expect(response).toEqual({ checkedIn: true, checkedInAt: AT });
		const stored = await getOfflineStore().entries<OutboxOp>('outbox');
		expect(stored).toHaveLength(1);
	});

	it('a community attendance takes its label from the caller, not from the body', async () => {
		const path = '/communities/c1/meetings/m1/attendance/single';
		const body = { memberId: 'mem1', attended: true };
		const match = matchQueueable('post', path, body)!;

		const { op } = await enqueue({
			match,
			method: 'post',
			path,
			body,
			key: crypto.randomUUID(),
			occurredAt: AT,
			meta: { name: 'Ana López' },
		});

		expect(op).toMatchObject({ kind: 'community.attendance', retreatId: null });
		expect(op.meta).toMatchObject({ name: 'Ana López', memberId: 'mem1', meetingId: 'm1' });
		expect(op.body).toEqual(body);
	});

	it('the queued check-in shows in Recepción even when the data comes from the phone', async () => {
		await queue('put', '/participants/p1/checkin', { retreatId: R, checkedIn: true });

		const answer: any = await answerFromCache({ method: 'get', url: `/participants/reception/${R}` }, offline());

		expect(answer.data.arrivedList.map((e: any) => e.participantId)).toEqual(['p1']);
		expect(answer.data.pending).toBe(1);
	});

	it('a schedule start finds its retreat and item in the saved agenda', async () => {
		const { op, response } = await queue('post', '/schedule/items/i1/start', { occurredAt: AT });

		expect(op.retreatId).toBe(R);
		expect(op.meta.item).toBe('Bienvenida');
		expect(response).toMatchObject({ id: 'i1', status: 'active', actualStartTime: AT });
	});

	it('a bed assignment carries the participant to paint the card, without health data', async () => {
		const { op, response } = await queue('put', '/retreat-beds/b1/assign', { participantId: 'p2' });

		expect(op.retreatId).toBe(R);
		expect(op.meta.bed).toBe('3-2');
		expect(op.meta.participant).toMatchObject({ id: 'p2', firstName: 'Beto' });
		expect(response).toMatchObject({ id: 'b1', participantId: 'p2' });
		const p1 = (await queue('put', '/retreat-beds/b1/assign', { participantId: 'p1' })).op;
		expect(p1.meta.participant).not.toHaveProperty('medicationDetails');
	});

	it('moving a walker answers with the updated table', async () => {
		const { response }: any = await queue('post', '/tables/t2/walkers', { participantId: 'p1' });
		expect(response.walkers.map((w: any) => w.id)).toEqual(['p1']);
	});

	it('writes made in the same millisecond keep the order they were made in', async () => {
		// `queue` stamps every op with the same occurredAt (AT)
		await queue('put', '/participants/p1/checkin', { retreatId: R, checkedIn: true });
		await queue('put', '/participants/p1/checkin', { retreatId: R, checkedIn: false });
		await queue('put', '/participants/p2/checkin', { retreatId: R, checkedIn: true });
		expect(pendingOps().map((op) => [op.meta.participantId, op.body.checkedIn])).toEqual([
			['p1', true],
			['p1', false],
			['p2', true],
		]);
	});

	it('the same key twice is one write (a resend of a queued one)', async () => {
		await queue('put', '/participants/p1/checkin', { retreatId: R, checkedIn: true }, 'same-key');
		await queue('put', '/participants/p1/checkin', { retreatId: R, checkedIn: true }, 'same-key');
		expect(pendingOps()).toHaveLength(1);
	});

	it('the queue survives a reload of the page', async () => {
		await queue('put', '/participants/p1/checkin', { retreatId: R, checkedIn: true });
		await _reloadOutboxForTests();
		expect(pendingOps()).toHaveLength(1);
		expect(pendingOps()[0].meta.name).toBe('Ana López');
	});

	it('writes of other users on the same phone are not shown nor sent as this user', async () => {
		await queue('put', '/participants/p1/checkin', { retreatId: R, checkedIn: true });
		setCacheUser('u2');
		expect(pendingOps()).toHaveLength(0);
	});

	it('without a session nothing is queued', async () => {
		setCacheUser(null);
		await expect(queue('put', '/participants/p1/checkin', { retreatId: R, checkedIn: true })).rejects.toThrow();
	});

	it('once accepted, the change is written into the saved answers and leaves the queue', async () => {
		const { op } = await queue('put', '/participants/p1/checkin', { retreatId: R, checkedIn: true });

		await commitToSavedAnswers(op);
		await removeOp(op);

		const saved = await getOfflineStore().get<CachedResponse<any>>('responses', `u1|/participants/reception/${R}`);
		expect(saved!.data.arrivedList.map((e: any) => e.participantId)).toEqual(['p1']);
		expect(pendingOps()).toHaveLength(0);
	});

	it('a conflict is not painted, can be retried, and only leaves on an explicit discard', async () => {
		const { op } = await queue('put', '/participants/p1/checkin', { retreatId: R, checkedIn: true });
		await markConflict(op, 404, 'Participant not found in retreat');

		const answer: any = await answerFromCache({ method: 'get', url: `/participants/reception/${R}` }, offline());
		expect(answer.data.arrivedList).toEqual([]);
		expect(conflictOps()[0]).toMatchObject({ lastStatus: 404, lastError: 'Participant not found in retreat' });

		await retryOp(op);
		expect(pendingOps()).toHaveLength(1);

		await discardOp(op);
		expect(outbox.ops).toHaveLength(0);
		expect(await getOfflineStore().entries('outbox')).toHaveLength(0);
	});
});
