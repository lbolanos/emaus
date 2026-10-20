import { describe, it, expect, beforeEach } from 'vitest';
import { SENSITIVE_HEALTH_FIELDS } from '@repo/types';
import {
	answerFromCache,
	cacheKey,
	clearSavedResponses,
	matchCacheableRoute,
	OfflineNoDataError,
	purgeResponses,
	saveResponse,
	setCacheUser,
	stripHealthForCache,
	type CachedResponse,
} from '../readCache';
import { createMemoryStore, getOfflineStore, setOfflineStoreForTests } from '../storage';
import { _resetConnectivityForTests, connectivity } from '../connectivity';

const RETREAT = 'e9b3c568-050a-4d66-a99d-305f287a59df';
const networkError = () => Object.assign(new Error('Network Error'), { isAxiosError: true, code: 'ERR_NETWORK' });
const timeoutError = () => Object.assign(new Error('timeout of 15000ms exceeded'), { isAxiosError: true, code: 'ECONNABORTED' });

const walker = () => ({
	id: 'p1',
	firstName: 'Ana',
	lastName: 'López',
	cellPhone: '5512345678',
	hasMedication: true,
	snores: false,
	medicationDetails: 'Insulina',
	medicationSchedule: '8:00',
	dietaryRestrictionsDetails: 'Sin gluten',
	disabilitySupport: 'Silla de ruedas',
	notes: 'Llamar a su hermana',
	emergencyContact1Name: 'Rosa',
	emergencyContact1Relation: 'Hermana',
	emergencyContact1CellPhone: '5599999999',
	emergencyContact2Email: 'x@example.com',
});

describe('matchCacheableRoute', () => {
	it.each([
		['/participants', { retreatId: RETREAT, includePayments: true }, 'participants', RETREAT],
		[`/participants/reception/${RETREAT}`, undefined, 'reception', RETREAT],
		[`/retreats/${RETREAT}/beds`, undefined, 'beds', RETREAT],
		[`/tables/retreat/${RETREAT}`, undefined, 'tables', RETREAT],
		[`/schedule/retreats/${RETREAT}/items`, undefined, 'schedule', RETREAT],
		['/responsibilities', { retreatId: RETREAT }, 'responsibilities', RETREAT],
		[`/santisimo/retreats/${RETREAT}/slots`, undefined, 'santisimo', RETREAT],
		[`/service-teams/retreat/${RETREAT}`, undefined, 'serviceTeams', RETREAT],
		['/retreats', undefined, 'retreats', null],
		[`/retreats/${RETREAT}`, undefined, 'retreat', RETREAT],
	])('%s → %s', (url, params, name, retreatId) => {
		expect(matchCacheableRoute({ method: 'get', url, params })).toEqual({ name, retreatId });
	});

	it('also understands absolute URLs that include /api', () => {
		expect(
			matchCacheableRoute({ method: 'get', url: `http://localhost:3084/api/retreats/${RETREAT}/beds` }),
		).toEqual({ name: 'beds', retreatId: RETREAT });
	});

	it.each([
		['post', '/participants'],
		['get', '/messages/templates'],
		['get', '/auth/status'],
		['get', `/participants/${RETREAT}`],
		['get', '/payments'],
	])('%s %s is not cached', (method, url) => {
		expect(matchCacheableRoute({ method, url })).toBeNull();
	});

	it('a request can opt out', () => {
		expect(matchCacheableRoute({ method: 'get', url: '/retreats', offlineCache: false })).toBeNull();
	});
});

describe('cacheKey', () => {
	it('is per user and does not depend on the order of the params', () => {
		const a = cacheKey({ url: '/participants', params: { retreatId: RETREAT, includePayments: true } }, 'u1');
		const b = cacheKey({ url: '/participants', params: { includePayments: true, retreatId: RETREAT } }, 'u1');
		const c = cacheKey({ url: '/participants', params: { retreatId: RETREAT, includePayments: true } }, 'u2');
		expect(a).toBe(b);
		expect(a).not.toBe(c);
		expect(a).toBe(`u1|/participants?includePayments=true&retreatId=${RETREAT}`);
	});

	it('ignores empty params', () => {
		expect(cacheKey({ url: '/participants', params: { retreatId: RETREAT, type: '' } }, 'u1')).toBe(
			`u1|/participants?retreatId=${RETREAT}`,
		);
	});
});

describe('stripHealthForCache (decision 2026-10-19: health never on the device)', () => {
	it('removes every sensitive field from a participant and keeps the rest', () => {
		const [clean] = stripHealthForCache([walker()]);
		for (const field of SENSITIVE_HEALTH_FIELDS) {
			expect(clean).not.toHaveProperty(field);
		}
		expect(clean).toMatchObject({
			id: 'p1',
			firstName: 'Ana',
			cellPhone: '5512345678',
			hasMedication: true,
			snores: false,
		});
	});

	it('reaches participants nested in beds and tables', () => {
		const beds = [{ id: 'b1', roomNumber: '1', participant: walker() }];
		const tables = [{ id: 't1', name: 'Mesa 1', walkers: [walker()], lider: walker() }];
		const [bed] = stripHealthForCache(beds);
		const [table] = stripHealthForCache(tables);
		expect(bed.participant).not.toHaveProperty('medicationDetails');
		expect(table.walkers[0]).not.toHaveProperty('notes');
		expect(table.lider).not.toHaveProperty('emergencyContact1CellPhone');
	});

	it('keeps the notes of things that are not people (schedule items)', () => {
		const items = [{ id: 'i1', name: 'Charla', notes: 'Micrófono inalámbrico' }];
		expect(stripHealthForCache(items)[0].notes).toBe('Micrófono inalámbrico');
	});

	it('does not touch the original object (the online view keeps everything)', () => {
		const original = [walker()];
		stripHealthForCache(original);
		expect(original[0].medicationDetails).toBe('Insulina');
	});
});

describe('save and answer from the device', () => {
	const config = { method: 'get', url: '/participants', params: { retreatId: RETREAT, includePayments: true } };

	beforeEach(() => {
		setOfflineStoreForTests(createMemoryStore());
		setCacheUser('u1');
		_resetConnectivityForTests(true);
	});

	it('answers a failed GET with the saved data, marked fromCache', async () => {
		await saveResponse(config, [walker()], 1_000);

		const answer = await answerFromCache(config, networkError());

		expect(answer).toMatchObject({ status: 200, fromCache: true, fetchedAt: 1_000 });
		expect((answer as any).data[0].firstName).toBe('Ana');
		expect(connectivity.oldestServedFromCacheAt).toBe(1_000);
	});

	it('a timeout counts as no signal', async () => {
		await saveResponse(config, [walker()]);
		expect(await answerFromCache(config, timeoutError())).toMatchObject({ fromCache: true });
	});

	it('what is saved never contains health fields, whatever the user can see', async () => {
		await saveResponse(config, [walker()]);
		const entries = await getOfflineStore().entries<CachedResponse>('responses');
		const raw = JSON.stringify(entries);
		for (const field of SENSITIVE_HEALTH_FIELDS) {
			expect(raw).not.toContain(`"${field}"`);
		}
		expect(raw).not.toContain('Insulina');
	});

	it('nothing saved → OfflineNoDataError, and the banner learns a screen is missing', async () => {
		const answer = await answerFromCache(config, networkError());
		expect(answer).toBeInstanceOf(OfflineNoDataError);
		expect(connectivity.missedWhileOffline).toBe(true);
	});

	it('an answer from the server (4xx/5xx) is never replaced by the cache', async () => {
		await saveResponse(config, [walker()]);
		const serverError = { isAxiosError: true, response: { status: 500 } };
		expect(await answerFromCache(config, serverError)).toBeNull();
	});

	it('another user on the same phone does not see this user\'s data', async () => {
		await saveResponse(config, [walker()]);
		setCacheUser('u2');
		expect(await answerFromCache(config, networkError())).toBeInstanceOf(OfflineNoDataError);
	});

	it('without a known user nothing is saved or served', async () => {
		setCacheUser(null);
		await saveResponse(config, [walker()]);
		expect(await getOfflineStore().entries('responses')).toHaveLength(0);
		expect(await answerFromCache(config, networkError())).toBeNull();
	});

	it('non-cacheable routes are left alone', async () => {
		const other = { method: 'get', url: '/messages/templates' };
		await saveResponse(other, { a: 1 });
		expect(await getOfflineStore().entries('responses')).toHaveLength(0);
		expect(await answerFromCache(other, networkError())).toBeNull();
	});

	it('purge removes the saved answers of closed retreats only', async () => {
		await saveResponse(config, [walker()]);
		await saveResponse({ method: 'get', url: `/retreats/${RETREAT}/beds` }, []);
		await saveResponse({ method: 'get', url: '/participants', params: { retreatId: 'other' } }, []);
		await saveResponse({ method: 'get', url: '/retreats' }, []);

		const removed = await purgeResponses((id) => id === RETREAT);

		expect(removed).toBe(2);
		const keys = (await getOfflineStore().entries('responses')).map(([k]) => k);
		expect(keys).toEqual(expect.arrayContaining(['u1|/retreats', 'u1|/participants?retreatId=other']));
		expect(keys).toHaveLength(2);
	});

	it('clearSavedResponses empties the cache', async () => {
		await saveResponse(config, [walker()]);
		await clearSavedResponses();
		expect(await getOfflineStore().entries('responses')).toHaveLength(0);
	});
});
