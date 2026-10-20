import { describe, it, expect, beforeEach, vi } from 'vitest';

const apiMock = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('@/services/api', () => ({ api: apiMock }));

import {
	_resetAutoPrepareForTests,
	canPrepare,
	getPrepared,
	maybeAutoPrepare,
	prepareRetreat,
	prepareSteps,
	purgeClosedRetreats,
} from '../prepareRetreat';
import { createMemoryStore, getOfflineStore, setOfflineStoreForTests } from '../storage';
import { cacheKey, matchCacheableRoute, saveResponse, setCacheUser } from '../readCache';
import { _resetConnectivityForTests } from '../connectivity';

/** specs/offline-mode D4/D9: download the retreat, refresh it while live, delete it when it ends. */

const R = 'e9b3c568-050a-4d66-a99d-305f287a59df';
const retreat = (start: string, end: string) => ({ id: R, startDate: start, endDate: end, timezone: 'America/Mexico_City' });
// 2026-10-17 12:00 in Mexico City
const SATURDAY = new Date('2026-10-17T18:00:00.000Z');

describe('prepareSteps', () => {
	it('asks for exactly what the retreat views ask for, all of it cacheable', () => {
		for (const step of prepareSteps(R)) {
			expect(matchCacheableRoute({ method: 'get', url: step.url, params: step.params }), step.url).not.toBeNull();
		}
	});

	it('uses the same cache key as the participant list the views load', () => {
		const step = prepareSteps(R).find((s) => s.url === '/participants' && s.params?.includePayments);
		expect(cacheKey({ url: step!.url, params: step!.params }, 'u1')).toBe(
			cacheKey({ url: '/participants', params: { retreatId: R, includePayments: true } }, 'u1'),
		);
	});

	it('never asks for a health-only endpoint', () => {
		expect(prepareSteps(R).map((s) => s.url).join(' ')).not.toMatch(/food|medicine|health/i);
	});
});

describe('prepareRetreat', () => {
	beforeEach(() => {
		apiMock.get.mockReset();
		setOfflineStoreForTests(createMemoryStore());
		setCacheUser('u1');
		_resetConnectivityForTests(true);
		_resetAutoPrepareForTests();
	});

	it('downloads every step, reports progress and remembers when', async () => {
		apiMock.get.mockResolvedValue({ data: [{ id: 'x' }] });
		const progress: number[] = [];

		const summary = await prepareRetreat(R, (done) => progress.push(done), () => 1_000);

		const total = prepareSteps(R).length;
		expect(apiMock.get).toHaveBeenCalledTimes(total);
		expect(progress).toEqual(Array.from({ length: total }, (_, i) => i + 1));
		expect(summary).toMatchObject({ ok: total, failed: 0, at: 1_000 });
		expect(summary.bytes).toBeGreaterThan(0);
		expect(await getPrepared(R)).toMatchObject({ at: 1_000, ok: total });
	});

	it('answers from the phone or failures do not count as downloaded', async () => {
		apiMock.get
			.mockResolvedValueOnce({ data: [], fromCache: true })
			.mockRejectedValueOnce(new Error('Network Error'))
			.mockResolvedValue({ data: [] });

		const summary = await prepareRetreat(R);

		expect(summary.failed).toBe(2);
		expect(summary.ok).toBe(prepareSteps(R).length - 2);
	});

	it('nothing downloaded → nothing remembered', async () => {
		apiMock.get.mockRejectedValue(new Error('Network Error'));
		await prepareRetreat(R);
		expect(await getPrepared(R)).toBeNull();
	});
});

describe('canPrepare (7 days before the start until the end)', () => {
	it.each([
		['2026-10-08', false],
		['2026-10-09', true],
		['2026-10-16', true],
		['2026-10-18', true],
		['2026-10-19', false],
	])('on %s → %s', (day, expected) => {
		const at = new Date(`${day}T18:00:00.000Z`);
		expect(canPrepare(retreat('2026-10-16', '2026-10-18'), at)).toBe(expected);
	});
});

describe('maybeAutoPrepare', () => {
	beforeEach(() => {
		apiMock.get.mockReset().mockResolvedValue({ data: [] });
		setOfflineStoreForTests(createMemoryStore());
		setCacheUser('u1');
		_resetConnectivityForTests(true);
		_resetAutoPrepareForTests();
	});

	it('refreshes while the retreat is live', async () => {
		expect(await maybeAutoPrepare(retreat('2026-10-16', '2026-10-18'), SATURDAY)).toBe(true);
		expect(apiMock.get).toHaveBeenCalled();
	});

	it('at most every 15 minutes', async () => {
		await maybeAutoPrepare(retreat('2026-10-16', '2026-10-18'), SATURDAY);
		apiMock.get.mockClear();
		const tenMinutesLater = new Date(SATURDAY.getTime() + 10 * 60_000);
		expect(await maybeAutoPrepare(retreat('2026-10-16', '2026-10-18'), tenMinutesLater)).toBe(false);
		expect(apiMock.get).not.toHaveBeenCalled();
	});

	it('not outside the live window, not offline, not without a session', async () => {
		expect(await maybeAutoPrepare(retreat('2026-11-20', '2026-11-22'), SATURDAY)).toBe(false);
		_resetConnectivityForTests(false);
		expect(await maybeAutoPrepare(retreat('2026-10-16', '2026-10-18'), SATURDAY)).toBe(false);
		_resetConnectivityForTests(true);
		setCacheUser(null);
		expect(await maybeAutoPrepare(retreat('2026-10-16', '2026-10-18'), SATURDAY)).toBe(false);
		expect(apiMock.get).not.toHaveBeenCalled();
	});
});

describe('purgeClosedRetreats (D9: the cache lives only during the window)', () => {
	beforeEach(async () => {
		setOfflineStoreForTests(createMemoryStore());
		setCacheUser('u1');
		await saveResponse({ url: '/retreats' }, [
			retreat('2026-10-16', '2026-10-18'),
			{ id: 'next', startDate: '2026-11-20', endDate: '2026-11-22' },
		]);
		await saveResponse({ url: '/participants', params: { retreatId: R } }, [{ id: 'p1', firstName: 'A', lastName: 'B' }]);
		await saveResponse({ url: `/retreats/${R}/beds` }, []);
		await saveResponse({ url: '/participants', params: { retreatId: 'next' } }, []);
		await getOfflineStore().put('meta', `prepared:${R}`, { at: 1, ok: 1, failed: 0, bytes: 1 });
	});

	it('keeps everything during the retreat (Sunday included)', async () => {
		expect(await purgeClosedRetreats(new Date('2026-10-18T23:00:00.000Z'))).toBe(0);
	});

	it('the day after the end, the retreat leaves the phone; other retreats and the list stay', async () => {
		const removed = await purgeClosedRetreats(new Date('2026-10-19T15:00:00.000Z'));

		expect(removed).toBe(2);
		const keys = (await getOfflineStore().entries('responses')).map(([k]) => k);
		expect(keys).toEqual(expect.arrayContaining(['u1|/retreats', 'u1|/participants?retreatId=next']));
		expect(keys).toHaveLength(2);
		expect(await getPrepared(R)).toBeNull();
	});

	it('pending writes are never purged', async () => {
		await getOfflineStore().put('outbox', 'op-1', { id: 'op-1', retreatId: R });
		await purgeClosedRetreats(new Date('2026-10-25T15:00:00.000Z'));
		expect(await getOfflineStore().entries('outbox')).toHaveLength(1);
	});
});
