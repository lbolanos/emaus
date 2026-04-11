import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { createMockUser } from '@/test/utils';

vi.mock('@/services/api', () => ({
	api: {
		get: vi.fn(),
		post: vi.fn(),
		put: vi.fn(),
		delete: vi.fn(),
	},
}));

vi.mock('vue-router', () => ({
	useRouter: () => ({
		push: vi.fn(),
	}),
}));

vi.mock('@repo/ui', () => ({
	useToast: () => ({ toast: vi.fn() }),
	Button: { template: '<button><slot /></button>' },
	Input: { template: '<input />' },
	Dialog: { template: '<div><slot /></div>' },
	DialogBody: { template: '<div><slot /></div>' },
}));

/**
 * Tests that checkAuthStatus() does not reset isAuthenticated on
 * rate-limit (429) or network errors.
 *
 * Before the fix, a 429 on /auth/status would set isAuthenticated=false,
 * causing the router guard to redirect to /login, which triggered more
 * requests and created an infinite loop.
 */
describe('AuthStore rate-limit resilience', () => {
	let store: any;

	beforeEach(async () => {
		setActivePinia(createPinia());
		const { useAuthStore } = await import('../authStore');
		store = useAuthStore();
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('should preserve isAuthenticated=true when checkAuthStatus gets a 429', async () => {
		// Start in an authenticated state
		const mockUser = createMockUser();
		store.user = mockUser;
		store.userProfile = mockUser;
		store.isAuthenticated = true;

		const { api } = await import('@/services/api');
		(api.get as any).mockRejectedValue({
			response: { status: 429, data: { error: 'API_RATE_LIMIT_EXCEEDED' } },
		});

		await store.checkAuthStatus();

		expect(store.isAuthenticated).toBe(true);
		expect(store.user).toEqual(mockUser);
		expect(store.userProfile).toEqual(mockUser);
	});

	it('should preserve isAuthenticated=true on network errors (no response)', async () => {
		const mockUser = createMockUser();
		store.user = mockUser;
		store.userProfile = mockUser;
		store.isAuthenticated = true;

		const { api } = await import('@/services/api');
		(api.get as any).mockRejectedValue(new Error('Network Error'));

		await store.checkAuthStatus();

		expect(store.isAuthenticated).toBe(true);
		expect(store.user).toEqual(mockUser);
		expect(store.userProfile).toEqual(mockUser);
	});

	it('should still reset isAuthenticated on a real 401 error', async () => {
		const mockUser = createMockUser();
		store.user = mockUser;
		store.userProfile = mockUser;
		store.isAuthenticated = true;

		const { api } = await import('@/services/api');
		(api.get as any).mockRejectedValue({
			response: { status: 401, data: { error: 'UNAUTHORIZED' } },
		});

		await store.checkAuthStatus();

		expect(store.isAuthenticated).toBe(false);
		expect(store.user).toBeNull();
		expect(store.userProfile).toBeNull();
	});

	it('should still reset isAuthenticated on a 403 error', async () => {
		const mockUser = createMockUser();
		store.user = mockUser;
		store.userProfile = mockUser;
		store.isAuthenticated = true;

		const { api } = await import('@/services/api');
		(api.get as any).mockRejectedValue({
			response: { status: 403, data: { error: 'FORBIDDEN' } },
		});

		await store.checkAuthStatus();

		expect(store.isAuthenticated).toBe(false);
		expect(store.user).toBeNull();
		expect(store.userProfile).toBeNull();
	});

	it('should not change isAuthenticated=false to true on 429 (no false positive)', async () => {
		store.user = null;
		store.userProfile = null;
		store.isAuthenticated = false;

		const { api } = await import('@/services/api');
		(api.get as any).mockRejectedValue({
			response: { status: 429, data: { error: 'API_RATE_LIMIT_EXCEEDED' } },
		});

		await store.checkAuthStatus();

		// Should stay false — 429 means "unknown", not "authenticated"
		expect(store.isAuthenticated).toBe(false);
		expect(store.user).toBeNull();
	});
});
