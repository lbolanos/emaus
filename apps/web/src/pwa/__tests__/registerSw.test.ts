import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';

const wbMock = vi.hoisted(() => {
	const listeners: Record<string, Array<() => void>> = {};
	const instances: Array<{ url: string; options: unknown }> = [];
	const register = vi.fn();
	const update = vi.fn();
	const messageSkipWaiting = vi.fn();
	return {
		listeners,
		instances,
		register,
		update,
		messageSkipWaiting,
		emit(event: string) {
			(listeners[event] ?? []).slice().forEach((fn) => fn());
		},
		reset() {
			Object.keys(listeners).forEach((k) => delete listeners[k]);
			instances.splice(0);
			register.mockReset().mockResolvedValue(undefined);
			update.mockReset().mockResolvedValue(undefined);
			messageSkipWaiting.mockReset();
		},
	};
});

vi.mock('workbox-window', () => ({
	Workbox: class {
		constructor(url: string, options: unknown) {
			wbMock.instances.push({ url, options });
		}
		addEventListener(event: string, fn: () => void) {
			(wbMock.listeners[event] ??= []).push(fn);
		}
		register = wbMock.register;
		update = wbMock.update;
		messageSkipWaiting = wbMock.messageSkipWaiting;
	},
}));

import { registerServiceWorker, _resetForTests } from '../registerSw';
import { useVersionStore } from '@/stores/versionStore';

describe('registerServiceWorker', () => {
	const getRegistrations = vi.fn();
	const cacheKeys = vi.fn();
	const cacheDelete = vi.fn();
	let reloadMock: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		setActivePinia(createPinia());
		wbMock.reset();
		_resetForTests();
		delete window.EMAUS_RUNTIME_CONFIG;
		getRegistrations.mockReset().mockResolvedValue([]);
		cacheKeys.mockReset().mockResolvedValue([]);
		cacheDelete.mockReset().mockResolvedValue(true);
		Object.defineProperty(navigator, 'serviceWorker', {
			value: { getRegistrations },
			configurable: true,
		});
		vi.stubGlobal('caches', { keys: cacheKeys, delete: cacheDelete });
		reloadMock = vi.fn();
		Object.defineProperty(window, 'location', {
			value: { ...window.location, reload: reloadMock },
			writable: true,
			configurable: true,
		});
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.unstubAllGlobals();
	});

	it('registers /sw.js at the root scope in production', async () => {
		await registerServiceWorker({ isProduction: true });

		expect(wbMock.instances).toEqual([{ url: '/sw.js', options: { scope: '/' } }]);
		expect(wbMock.register).toHaveBeenCalledTimes(1);
	});

	it('does nothing outside production (the dev server has no sw.js)', async () => {
		await registerServiceWorker({ isProduction: false });

		expect(wbMock.instances).toHaveLength(0);
		expect(getRegistrations).not.toHaveBeenCalled();
	});

	it('registers only once per page', async () => {
		await registerServiceWorker({ isProduction: true });
		await registerServiceWorker({ isProduction: true });

		expect(wbMock.instances).toHaveLength(1);
	});

	it('unregisters workers and drops the app caches when offlineMode is false', async () => {
		const unregister = vi.fn().mockResolvedValue(true);
		getRegistrations.mockResolvedValue([{ unregister }, { unregister }]);
		cacheKeys.mockResolvedValue(['workbox-precache-v2-x', 'emaus-images', 'other-lib']);
		window.EMAUS_RUNTIME_CONFIG = { apiUrl: '/api', offlineMode: false };

		await registerServiceWorker({ isProduction: true });

		expect(wbMock.instances).toHaveLength(0);
		expect(unregister).toHaveBeenCalledTimes(2);
		expect(cacheDelete.mock.calls.map((c) => c[0]).sort()).toEqual([
			'emaus-images',
			'workbox-precache-v2-x',
		]);
	});

	it('keeps working when offlineMode is absent from runtime-config.js', async () => {
		window.EMAUS_RUNTIME_CONFIG = { apiUrl: '/api' };

		await registerServiceWorker({ isProduction: true });

		expect(wbMock.instances).toHaveLength(1);
	});

	it('shows the update banner when a new worker is waiting', async () => {
		await registerServiceWorker({ isProduction: true });
		const versionStore = useVersionStore();
		expect(versionStore.updateAvailable).toBe(false);

		wbMock.emit('waiting');

		expect(versionStore.updateAvailable).toBe(true);
	});

	it('activates the waiting worker and reloads once it takes control', async () => {
		await registerServiceWorker({ isProduction: true });
		wbMock.emit('waiting');

		const reloadPromise = useVersionStore().reloadForUpdate();
		await reloadPromise;

		expect(wbMock.messageSkipWaiting).toHaveBeenCalledTimes(1);
		expect(reloadMock).not.toHaveBeenCalled();
		wbMock.emit('controlling');
		expect(reloadMock).toHaveBeenCalledTimes(1);
	});

	it('checks for an update and waits for it to install before activating', async () => {
		await registerServiceWorker({ isProduction: true });
		wbMock.update.mockImplementation(async () => {
			setTimeout(() => wbMock.emit('waiting'), 50);
		});
		vi.useFakeTimers();

		const done = useVersionStore().reloadForUpdate();
		await vi.advanceTimersByTimeAsync(100);
		await done;

		expect(wbMock.update).toHaveBeenCalled();
		expect(wbMock.messageSkipWaiting).toHaveBeenCalledTimes(1);
	});

	it('falls back to a plain reload when no new worker shows up in time', async () => {
		await registerServiceWorker({ isProduction: true });
		vi.useFakeTimers();

		const done = useVersionStore().reloadForUpdate();
		await vi.advanceTimersByTimeAsync(20_000);
		await done;

		expect(wbMock.messageSkipWaiting).not.toHaveBeenCalled();
		expect(reloadMock).toHaveBeenCalledTimes(1);
	});

	it('swallows a failed registration and allows a later retry', async () => {
		wbMock.register.mockRejectedValueOnce(new Error('SecurityError'));
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

		await expect(registerServiceWorker({ isProduction: true })).resolves.toBeUndefined();
		await registerServiceWorker({ isProduction: true });

		expect(wbMock.instances).toHaveLength(2);
		warn.mockRestore();
	});
});
