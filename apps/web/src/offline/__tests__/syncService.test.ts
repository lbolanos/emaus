import { describe, it, expect, beforeEach, vi } from 'vitest';

const apiMock = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('@/services/api', () => ({ api: apiMock }));

import { createMemoryStore, getOfflineStore, setOfflineStoreForTests } from '../storage';
import { saveResponse, setCacheUser, type CachedResponse } from '../readCache';
import { _reloadOutboxForTests, conflictOps, enqueue, outbox, pendingOps } from '../outbox';
import { matchQueueable } from '../outboxKinds';
import { _resetConnectivityForTests, connectivity } from '../connectivity';
import { flushOutbox, MAX_SERVER_ERRORS } from '../syncService';

/**
 * specs/offline-mode FR-12: oldest first, one at a time, same key; a lack of
 * signal stops the run, a rejection becomes a conflict and the run goes on, an
 * expired session waits for login. Nothing is dropped.
 */

const R = 'r1';
const network = () => Object.assign(new Error('Network Error'), { isAxiosError: true, code: 'ERR_NETWORK' });
const http = (status: number, data: any = {}) =>
	Object.assign(new Error(`HTTP ${status}`), { isAxiosError: true, response: { status, data } });

let seq = 0;
async function queueCheckin(participantId: string) {
	const body = { retreatId: R, checkedIn: true };
	const path = `/participants/${participantId}/checkin`;
	seq += 1;
	return enqueue({
		match: matchQueueable('put', path, body)!,
		method: 'put',
		path,
		body,
		key: `00000000-0000-4000-8000-00000000000${seq}`,
		occurredAt: new Date(Date.UTC(2026, 9, 17, 22, seq)).toISOString(),
	});
}

describe('flushOutbox', () => {
	beforeEach(async () => {
		seq = 0;
		apiMock.request.mockReset();
		setOfflineStoreForTests(createMemoryStore());
		setCacheUser('u1');
		_resetConnectivityForTests(true);
		delete window.EMAUS_RUNTIME_CONFIG;
		await _reloadOutboxForTests();
		await saveResponse({ url: `/participants/reception/${R}` }, {
			total: 2,
			arrived: 0,
			pending: 2,
			pendingList: [{ participantId: 'p1' }, { participantId: 'p2' }],
			arrivedList: [],
		});
	});

	it('sends oldest first with the op key and the outbox header, then empties the queue', async () => {
		const a = (await queueCheckin('p1')).op;
		const b = (await queueCheckin('p2')).op;
		apiMock.request.mockResolvedValue({ status: 200, data: {} });

		await flushOutbox();

		const calls = apiMock.request.mock.calls.map(([cfg]) => cfg);
		expect(calls.map((c) => c.url)).toEqual(['/participants/p1/checkin', '/participants/p2/checkin']);
		expect(calls[0]).toMatchObject({
			method: 'put',
			outboxReplay: true,
			headers: { 'Idempotency-Key': a.key, 'X-Client-Time': a.occurredAt, 'X-Outbox-Sync': '1' },
		});
		expect(calls[1].headers['Idempotency-Key']).toBe(b.key);
		expect(pendingOps()).toHaveLength(0);
		expect(await getOfflineStore().entries('outbox')).toHaveLength(0);
		// The accepted check-ins are now part of the saved answer.
		const saved = await getOfflineStore().get<CachedResponse<any>>('responses', `u1|/participants/reception/${R}`);
		expect(saved!.data.arrivedList.map((e: any) => e.participantId)).toEqual(['p1', 'p2']);
	});

	it('no signal: stops at the first write and keeps everything', async () => {
		await queueCheckin('p1');
		await queueCheckin('p2');
		apiMock.request.mockRejectedValue(network());

		await flushOutbox();

		expect(apiMock.request).toHaveBeenCalledTimes(1);
		expect(pendingOps()).toHaveLength(2);
		expect(pendingOps().every((op) => op.status === 'pending')).toBe(true);
		expect(connectivity.online).toBe(false);
	});

	it('the first request still running on the server: try later, keep the write', async () => {
		await queueCheckin('p1');
		apiMock.request.mockRejectedValue(http(409, { code: 'IDEMPOTENCY_IN_PROGRESS' }));

		await flushOutbox();

		expect(pendingOps()).toHaveLength(1);
		expect(conflictOps()).toHaveLength(0);
	});

	it('a rejection becomes a conflict with the server message and the rest goes on', async () => {
		await queueCheckin('p1');
		await queueCheckin('p2');
		apiMock.request
			.mockRejectedValueOnce(http(404, { message: 'Participant not found in retreat' }))
			.mockResolvedValueOnce({ status: 200, data: {} });

		await flushOutbox();

		expect(conflictOps()).toHaveLength(1);
		expect(conflictOps()[0]).toMatchObject({
			lastStatus: 404,
			lastError: 'Participant not found in retreat',
			meta: { participantId: 'p1' },
		});
		expect(pendingOps()).toHaveLength(0);
	});

	it('server errors are retried and become a conflict only after several in a row', async () => {
		await queueCheckin('p1');
		apiMock.request.mockRejectedValue(http(500, { message: 'Internal Server Error' }));

		for (let i = 1; i < MAX_SERVER_ERRORS; i++) {
			await flushOutbox();
			expect(pendingOps()[0].attempts).toBe(i);
		}
		await flushOutbox();

		expect(conflictOps()).toHaveLength(1);
	});

	it('an expired session stops the run, keeps the writes and asks for login', async () => {
		await queueCheckin('p1');
		await queueCheckin('p2');
		apiMock.request.mockRejectedValue(http(401));

		await flushOutbox();

		expect(outbox.needsLogin).toBe(true);
		expect(apiMock.request).toHaveBeenCalledTimes(1);
		expect(pendingOps()).toHaveLength(2);
	});

	it('two triggers at once share one run (no write is sent twice)', async () => {
		await queueCheckin('p1');
		let release!: () => void;
		apiMock.request.mockImplementation(() => new Promise((r) => (release = () => r({ status: 200 }))));

		const first = flushOutbox();
		const second = flushOutbox();
		await new Promise((r) => setTimeout(r, 0));
		release();
		await Promise.all([first, second]);

		expect(apiMock.request).toHaveBeenCalledTimes(1);
	});

	it('does nothing when offline mode is switched off', async () => {
		await queueCheckin('p1');
		window.EMAUS_RUNTIME_CONFIG = { apiUrl: '/api', offlineMode: false };

		await flushOutbox();

		expect(apiMock.request).not.toHaveBeenCalled();
	});
});
