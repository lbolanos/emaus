import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useVersionStore } from '../versionStore';

describe('versionStore', () => {
	let store: ReturnType<typeof useVersionStore>;

	beforeEach(() => {
		setActivePinia(createPinia());
		store = useVersionStore();
		vi.useFakeTimers();
		vi.restoreAllMocks();
	});

	afterEach(() => {
		store.stopPolling();
		vi.useRealTimers();
	});

	describe('initial state', () => {
		it('starts with updateAvailable false', () => {
			expect(store.updateAvailable).toBe(false);
		});

		it('starts with dismissed false', () => {
			expect(store.dismissed).toBe(false);
		});

		it('starts with detectedVersion null', () => {
			expect(store.detectedVersion).toBeNull();
		});
	});

	describe('checkVersion (via startPolling)', () => {
		it('sets updateAvailable and detectedVersion when server version differs', async () => {
			const fetchMock = vi.fn().mockResolvedValue({
				ok: true,
				json: () => Promise.resolve({ version: 'new-deploy-hash' }),
			});
			vi.stubGlobal('fetch', fetchMock);

			store.startPolling();
			await vi.advanceTimersByTimeAsync(0);

			expect(store.updateAvailable).toBe(true);
			expect(store.detectedVersion).toBe('new-deploy-hash');
			expect(fetchMock).toHaveBeenCalledWith(
				expect.stringMatching(/^\/version\.json\?_=\d+$/),
				{ cache: 'no-store' },
			);
		});

		it('keeps updateAvailable false when version matches', async () => {
			const fetchMock = vi.fn().mockResolvedValue({
				ok: true,
				json: () => Promise.resolve({ version: 'test-version' }),
			});
			vi.stubGlobal('fetch', fetchMock);

			store.startPolling();
			await vi.advanceTimersByTimeAsync(0);

			expect(store.updateAvailable).toBe(false);
		});

		it('handles fetch failure silently', async () => {
			const fetchMock = vi.fn().mockRejectedValue(new Error('Network error'));
			vi.stubGlobal('fetch', fetchMock);

			store.startPolling();
			await vi.advanceTimersByTimeAsync(0);

			expect(store.updateAvailable).toBe(false);
		});

		it('handles non-ok response silently', async () => {
			const fetchMock = vi.fn().mockResolvedValue({ ok: false });
			vi.stubGlobal('fetch', fetchMock);

			store.startPolling();
			await vi.advanceTimersByTimeAsync(0);

			expect(store.updateAvailable).toBe(false);
		});

		it('handles response with no version field', async () => {
			const fetchMock = vi.fn().mockResolvedValue({
				ok: true,
				json: () => Promise.resolve({}),
			});
			vi.stubGlobal('fetch', fetchMock);

			store.startPolling();
			await vi.advanceTimersByTimeAsync(0);

			expect(store.updateAvailable).toBe(false);
		});

		it('polls every 5 minutes', async () => {
			const fetchMock = vi.fn().mockResolvedValue({
				ok: true,
				json: () => Promise.resolve({ version: 'test-version' }),
			});
			vi.stubGlobal('fetch', fetchMock);

			store.startPolling();
			await vi.advanceTimersByTimeAsync(0);
			expect(fetchMock).toHaveBeenCalledTimes(1);

			await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
			expect(fetchMock).toHaveBeenCalledTimes(2);

			await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
			expect(fetchMock).toHaveBeenCalledTimes(3);
		});
	});

	describe('startPolling guard', () => {
		it('does not create duplicate intervals when called twice', async () => {
			const fetchMock = vi.fn().mockResolvedValue({
				ok: true,
				json: () => Promise.resolve({ version: 'test-version' }),
			});
			vi.stubGlobal('fetch', fetchMock);

			store.startPolling();
			store.startPolling(); // second call should be a no-op
			await vi.advanceTimersByTimeAsync(0);

			// Only 1 initial check (not 2)
			expect(fetchMock).toHaveBeenCalledTimes(1);

			// After 5 min, still only 1 additional (not 2)
			await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
			expect(fetchMock).toHaveBeenCalledTimes(2);
		});
	});

	describe('stopPolling', () => {
		it('stops the interval timer', async () => {
			const fetchMock = vi.fn().mockResolvedValue({
				ok: true,
				json: () => Promise.resolve({ version: 'test-version' }),
			});
			vi.stubGlobal('fetch', fetchMock);

			store.startPolling();
			await vi.advanceTimersByTimeAsync(0);
			expect(fetchMock).toHaveBeenCalledTimes(1);

			store.stopPolling();
			await vi.advanceTimersByTimeAsync(5 * 60 * 1000);

			expect(fetchMock).toHaveBeenCalledTimes(1);
		});
	});

	describe('dismiss', () => {
		it('sets dismissed to true', () => {
			expect(store.dismissed).toBe(false);
			store.dismiss();
			expect(store.dismissed).toBe(true);
		});
	});

	describe('reloadForUpdate', () => {
		it('stores detected version in sessionStorage before reload', async () => {
			const reloadMock = vi.fn();
			vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
				ok: true,
				json: () => Promise.resolve({ version: 'new-deploy-hash' }),
			}));
			Object.defineProperty(window, 'location', {
				value: { ...window.location, reload: reloadMock },
				writable: true,
				configurable: true,
			});

			// Trigger version detection first
			store.startPolling();
			await vi.advanceTimersByTimeAsync(0);
			expect(store.detectedVersion).toBe('new-deploy-hash');

			store.reloadForUpdate();

			expect(sessionStorage.getItem('version_update_skipped')).toBe('new-deploy-hash');
			expect(reloadMock).toHaveBeenCalled();
		});
	});

	describe('skipped version', () => {
		it('does not show banner if version was already skipped via sessionStorage', async () => {
			sessionStorage.setItem('version_update_skipped', 'new-deploy-hash');
			const fetchMock = vi.fn().mockResolvedValue({
				ok: true,
				json: () => Promise.resolve({ version: 'new-deploy-hash' }),
			});
			vi.stubGlobal('fetch', fetchMock);

			store.startPolling();
			await vi.advanceTimersByTimeAsync(0);

			expect(store.updateAvailable).toBe(false);
		});

		it('shows banner if a newer version appears after the skipped one', async () => {
			sessionStorage.setItem('version_update_skipped', 'old-hash');
			const fetchMock = vi.fn().mockResolvedValue({
				ok: true,
				json: () => Promise.resolve({ version: 'even-newer-hash' }),
			});
			vi.stubGlobal('fetch', fetchMock);

			store.startPolling();
			await vi.advanceTimersByTimeAsync(0);

			expect(store.updateAvailable).toBe(true);
		});
	});

	describe('visibility change', () => {
		it('checks version when tab becomes visible', async () => {
			const fetchMock = vi.fn().mockResolvedValue({
				ok: true,
				json: () => Promise.resolve({ version: 'test-version' }),
			});
			vi.stubGlobal('fetch', fetchMock);

			store.startPolling();
			await vi.advanceTimersByTimeAsync(0);
			const callsAfterStart = fetchMock.mock.calls.length;

			Object.defineProperty(document, 'hidden', { value: false, writable: true });
			document.dispatchEvent(new Event('visibilitychange'));
			await vi.advanceTimersByTimeAsync(0);

			expect(fetchMock.mock.calls.length).toBeGreaterThan(callsAfterStart);
		});

		it('does not check version when tab is hidden', async () => {
			const fetchMock = vi.fn().mockResolvedValue({
				ok: true,
				json: () => Promise.resolve({ version: 'test-version' }),
			});
			vi.stubGlobal('fetch', fetchMock);

			store.startPolling();
			await vi.advanceTimersByTimeAsync(0);
			const callsAfterStart = fetchMock.mock.calls.length;

			Object.defineProperty(document, 'hidden', { value: true, writable: true });
			document.dispatchEvent(new Event('visibilitychange'));
			await vi.advanceTimersByTimeAsync(0);

			expect(fetchMock).toHaveBeenCalledTimes(callsAfterStart);
		});
	});
});
