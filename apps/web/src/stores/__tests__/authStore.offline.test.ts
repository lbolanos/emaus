import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';

/**
 * specs/offline-mode D8: the app must start without signal from the last profile
 * the server confirmed, instead of sending the team to the login screen. The
 * saved copy only paints the UI; a real 401 forgets it.
 */

const apiMock = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));

vi.mock('@/services/api', () => ({ api: apiMock }));
vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@repo/ui', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('../../services/telemetryService', () => ({
	telemetryService: {
		initialize: vi.fn().mockResolvedValue(undefined),
		isTelemetryActive: vi.fn().mockReturnValue(true),
		endSession: vi.fn().mockResolvedValue(undefined),
	},
}));

import { useAuthStore } from '../authStore';
import { createMemoryStore, setOfflineStoreForTests } from '@/offline/storage';
import { loadAuthProfile, saveAuthProfile } from '@/offline/authProfile';
import { getCacheUser, setCacheUser } from '@/offline/readCache';

const status = {
	id: 'user-1',
	email: 'coordinador@example.com',
	displayName: 'Coordinador',
	profile: { roles: [{ role: { name: 'admin' } }], permissions: [] },
};

const networkError = () => Object.assign(new Error('Network Error'), { isAxiosError: true, code: 'ERR_NETWORK' });

describe('authStore without signal', () => {
	beforeEach(() => {
		setActivePinia(createPinia());
		setOfflineStoreForTests(createMemoryStore());
		setCacheUser(null);
		apiMock.get.mockReset();
		apiMock.post.mockReset();
		delete window.EMAUS_RUNTIME_CONFIG;
	});

	it('saves the confirmed profile after a successful status check', async () => {
		apiMock.get.mockResolvedValue({ data: status });
		const store = useAuthStore();

		await store.checkAuthStatus();
		await new Promise((r) => setTimeout(r, 0));

		expect(await loadAuthProfile<typeof status>()).toEqual(status);
		expect(store.authSource).toBe('server');
		expect(getCacheUser()).toBe('user-1');
	});

	it('starts from the saved profile when /auth/status cannot be reached', async () => {
		await saveAuthProfile(status);
		apiMock.get.mockRejectedValue(networkError());
		const store = useAuthStore();

		await store.checkAuthStatus();

		expect(store.isAuthenticated).toBe(true);
		expect(store.user?.id).toBe('user-1');
		expect(store.userProfile).toEqual(status.profile);
		expect(store.authSource).toBe('cache');
		expect(getCacheUser()).toBe('user-1');
	});

	it('a 429 on a cold start is "unknown" too: starts from the saved profile', async () => {
		await saveAuthProfile(status);
		apiMock.get.mockRejectedValue(
			Object.assign(new Error('Too Many Requests'), { response: { status: 429, data: {} } }),
		);
		const store = useAuthStore();

		await store.checkAuthStatus();

		expect(store.isAuthenticated).toBe(true);
		expect(store.authSource).toBe('cache');
	});

	it('stays logged out without signal when nothing was saved', async () => {
		apiMock.get.mockRejectedValue(networkError());
		const store = useAuthStore();

		await store.checkAuthStatus();

		expect(store.isAuthenticated).toBe(false);
	});

	it('ignores a saved profile older than the rolling session', async () => {
		await saveAuthProfile(status, Date.now() - 31 * 24 * 60 * 60 * 1000);
		apiMock.get.mockRejectedValue(networkError());
		const store = useAuthStore();

		await store.checkAuthStatus();

		expect(store.isAuthenticated).toBe(false);
	});

	it('a real 401 forgets the saved profile', async () => {
		await saveAuthProfile(status);
		apiMock.get.mockRejectedValue(
			Object.assign(new Error('Unauthorized'), { response: { status: 401, data: {} } }),
		);
		const store = useAuthStore();

		await store.checkAuthStatus();
		await new Promise((r) => setTimeout(r, 0));

		expect(store.isAuthenticated).toBe(false);
		expect(await loadAuthProfile()).toBeNull();
		expect(getCacheUser()).toBeNull();
	});

	it('does not use the saved profile when offline mode is switched off', async () => {
		await saveAuthProfile(status);
		window.EMAUS_RUNTIME_CONFIG = { apiUrl: '/api', offlineMode: false };
		apiMock.get.mockRejectedValue(networkError());
		const store = useAuthStore();

		await store.checkAuthStatus();

		expect(store.isAuthenticated).toBe(false);
	});

	it('logout clears the saved profile', async () => {
		apiMock.get.mockResolvedValue({ data: status });
		apiMock.post.mockResolvedValue({ data: {} });
		const store = useAuthStore();
		await store.checkAuthStatus();
		await new Promise((r) => setTimeout(r, 0));

		await store.logout();
		await new Promise((r) => setTimeout(r, 0));

		expect(await loadAuthProfile()).toBeNull();
		expect(getCacheUser()).toBeNull();
	});
});
