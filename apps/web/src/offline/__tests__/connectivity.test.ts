import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
	_resetConnectivityForTests,
	connectivity,
	isNetworkError,
	onReconnect,
	probe,
	reportNetworkFailure,
	reportServedFromCache,
	reportSuccess,
} from '../connectivity';

/** specs/offline-mode D10: the state comes from what happens to requests. */
describe('connectivity', () => {
	beforeEach(() => _resetConnectivityForTests(true));
	afterEach(() => vi.unstubAllGlobals());

	it('a network failure means offline; any answer means online again', () => {
		reportNetworkFailure();
		expect(connectivity.online).toBe(false);
		reportSuccess(5_000);
		expect(connectivity.online).toBe(true);
		expect(connectivity.lastOnlineAt).toBe(5_000);
	});

	it('reconnect listeners fire on the way back, not on every answer', () => {
		const listener = vi.fn();
		onReconnect(listener);

		reportSuccess();
		expect(listener).not.toHaveBeenCalled();

		reportNetworkFailure();
		reportSuccess();
		reportSuccess();
		expect(listener).toHaveBeenCalledTimes(1);
	});

	it('remembers the oldest saved answer shown while offline and forgets it when back', () => {
		reportNetworkFailure();
		reportServedFromCache(3_000);
		reportServedFromCache(1_000);
		reportServedFromCache(2_000);
		expect(connectivity.oldestServedFromCacheAt).toBe(1_000);

		reportSuccess();
		expect(connectivity.oldestServedFromCacheAt).toBeNull();
	});

	it('isNetworkError: no answer is a lack of signal; a cancel or a server error is not', () => {
		expect(isNetworkError({ isAxiosError: true, code: 'ERR_NETWORK' })).toBe(true);
		expect(isNetworkError({ isAxiosError: true, code: 'ECONNABORTED' })).toBe(true);
		expect(isNetworkError({ isAxiosError: true, code: 'ERR_CANCELED' })).toBe(false);
		expect(isNetworkError({ isAxiosError: true, response: { status: 503 } })).toBe(false);
		expect(isNetworkError(new TypeError('boom'))).toBe(false);
	});

	it('probe: any HTTP answer from our origin counts as online', async () => {
		reportNetworkFailure();
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));
		expect(await probe()).toBe(true);
		expect(connectivity.online).toBe(true);
	});

	it('probe: a failed fetch keeps the app offline', async () => {
		vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
		expect(await probe()).toBe(false);
		expect(connectivity.online).toBe(false);
	});
});
