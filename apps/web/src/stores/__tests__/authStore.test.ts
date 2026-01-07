import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { createMockUser } from '@/test/utils';

// Mock the api service
vi.mock('@/services/api', () => ({
	api: {
		get: vi.fn(),
		post: vi.fn(),
		put: vi.fn(),
		delete: vi.fn(),
	},
}));

// Mock vue-router
vi.mock('vue-router', () => ({
	useRouter: () => ({
		push: vi.fn(),
	}),
}));

// Mock @repo/ui useToast
vi.mock('@repo/ui', () => ({
	useToast: () => ({
		toast: vi.fn(),
	}),
	// Also export other components that the store might indirectly import
	Button: { template: '<button><slot /></button>' },
	Input: { template: '<input />' },
	Dialog: { template: '<div><slot /></div>' },
	DialogBody: { template: '<div><slot /></div>' },
	useToast: () => ({ toast: vi.fn() }),
}));

describe('AuthStore', () => {
	let store: any;
	let useAuthStore: any;

	beforeEach(async () => {
		setActivePinia(createPinia());
		// Import store after mocks are set up
		const authStoreModule = await import('../authStore');
		useAuthStore = authStoreModule.useAuthStore;
		store = useAuthStore();
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe('Initial State', () => {
		it('should initialize with empty state', () => {
			expect(store.user).toBeNull();
			expect(store.userProfile).toBeNull();
			expect(store.loading).toBe(false);
			expect(store.isAuthenticated).toBe(false);
			expect(store.refreshingProfile).toBe(false);
		});
	});

	describe('Login', () => {
		it('should login successfully with valid credentials', async () => {
			const mockUser = createMockUser();
			const { api } = await import('@/services/api');
			// API returns the user data with profile nested inside
			// The store sets: user.value = response.data, userProfile.value = response.data.profile
			(api.post as any).mockResolvedValue({
				data: {
					...mockUser,
					profile: mockUser,
				},
			});

			await store.login('test@example.com', 'password123');

			expect(api.post).toHaveBeenCalledWith('/auth/login', {
				email: 'test@example.com',
				password: 'password123',
			});
			// user is the full response data (includes profile property)
			expect(store.userProfile).toEqual(mockUser);
			expect(store.isAuthenticated).toBe(true);
			expect(store.loading).toBe(false);
			// Also check that user contains the profile
			expect(store.user).toHaveProperty('profile');
			expect(store.user.profile).toEqual(mockUser);
		});

		it('should handle login failure with invalid credentials', async () => {
			const { api } = await import('@/services/api');
			const error = {
				response: {
					data: { message: 'Invalid email or password' },
				},
			};
			(api.post as any).mockRejectedValue(error);

			await expect(store.login('wrong@example.com', 'wrongpassword')).rejects.toEqual(
				error.response?.data,
			);

			expect(store.isAuthenticated).toBe(false);
			expect(store.user).toBeNull();
			expect(store.userProfile).toBeNull();
			expect(store.loading).toBe(false);
		});

		it('should set loading state during login', async () => {
			const { api } = await import('@/services/api');
			let resolveLogin: (value: any) => void;
			const loginPromise = new Promise((resolve) => {
				resolveLogin = resolve;
			});
			(api.post as any).mockReturnValue(loginPromise);

			// Don't await - we want to check the loading state immediately
			const pendingLogin = store.login('test@example.com', 'password');
			// Wait a tick for the loading state to be set
			await new Promise((resolve) => setTimeout(resolve, 0));
			expect(store.loading).toBe(true);

			resolveLogin!({
				data: { ...createMockUser(), profile: createMockUser() },
			});
			await pendingLogin;

			expect(store.loading).toBe(false);
		});
	});

	describe('Register', () => {
		it('should register successfully with valid data', async () => {
			const registerData = {
				email: 'newuser@example.com',
				password: 'password123',
				displayName: 'New User',
			};

			const { api } = await import('@/services/api');
			(api.post as any).mockResolvedValue({});

			await store.register(registerData);

			expect(api.post).toHaveBeenCalledWith('/auth/register', registerData);
			expect(store.loading).toBe(false);
		});

		it('should handle registration failure', async () => {
			const registerData = {
				email: 'existing@example.com',
				password: 'password123',
				displayName: 'Existing User',
			};

			const { api } = await import('@/services/api');
			const error = {
				response: {
					data: { message: 'User already exists' },
				},
			};
			(api.post as any).mockRejectedValue(error);

			await expect(store.register(registerData)).rejects.toEqual(error.response?.data);
			expect(store.loading).toBe(false);
		});
	});

	describe('Check Auth Status', () => {
		it('should set authenticated state when user is logged in', async () => {
			const mockUser = createMockUser();
			const { api } = await import('@/services/api');
			(api.get as any).mockResolvedValue({
				data: {
					...mockUser,
					profile: mockUser,
				},
			});

			await store.checkAuthStatus();

			expect(api.get).toHaveBeenCalledWith('/auth/status');
			expect(store.userProfile).toEqual(mockUser);
			expect(store.isAuthenticated).toBe(true);
			expect(store.user).toHaveProperty('profile');
			expect(store.user.profile).toEqual(mockUser);
		});

		it('should set unauthenticated state when user is not logged in', async () => {
			const { api } = await import('@/services/api');
			(api.get as any).mockResolvedValue({
				data: { authenticated: false },
			});

			await store.checkAuthStatus();

			expect(store.user).toBeNull();
			expect(store.userProfile).toBeNull();
			expect(store.isAuthenticated).toBe(false);
		});

		it('should handle auth status check error gracefully', async () => {
			const { api } = await import('@/services/api');
			(api.get as any).mockRejectedValue(new Error('Network error'));

			await store.checkAuthStatus();

			expect(store.user).toBeNull();
			expect(store.userProfile).toBeNull();
			expect(store.isAuthenticated).toBe(false);
		});
	});

	describe('Logout', () => {
		it('should logout successfully', async () => {
			const mockUser = createMockUser();
			store.user = mockUser;
			store.userProfile = mockUser;
			store.isAuthenticated = true;

			const { api } = await import('@/services/api');
			(api.post as any).mockResolvedValue({});

			await store.logout();

			expect(api.post).toHaveBeenCalledWith('/auth/logout');
			expect(store.isAuthenticated).toBe(false);
			expect(store.user).toBeNull();
			expect(store.userProfile).toBeNull();
			expect(store.loading).toBe(false);
		});

		it('should handle logout error', async () => {
			store.isAuthenticated = true;

			const { api } = await import('@/services/api');
			(api.post as any).mockRejectedValue(new Error('Logout failed'));

			await store.logout();

			expect(store.loading).toBe(false);
		});
	});

	describe('Request Password Reset', () => {
		it('should request password reset successfully', async () => {
			const { api } = await import('@/services/api');
			(api.post as any).mockResolvedValue({});

			await store.requestPasswordReset({ email: 'test@example.com' });

			expect(api.post).toHaveBeenCalledWith('/auth/password/request', {
				email: 'test@example.com',
			});
			expect(store.loading).toBe(false);
		});

		it('should handle password reset request error', async () => {
			const { api } = await import('@/services/api');
			const error = {
				response: {
					data: { message: 'User not found' },
				},
			};
			(api.post as any).mockRejectedValue(error);

			await expect(store.requestPasswordReset({ email: 'notfound@example.com' })).rejects.toEqual(
				error.response?.data,
			);
			expect(store.loading).toBe(false);
		});
	});

	describe('Reset Password', () => {
		it('should reset password successfully with valid token', async () => {
			const { api } = await import('@/services/api');
			(api.post as any).mockResolvedValue({});

			await store.resetPassword({
				token: 'valid-token',
				newPassword: 'newPassword123',
			});

			expect(api.post).toHaveBeenCalledWith('/auth/password/reset', {
				token: 'valid-token',
				newPassword: 'newPassword123',
			});
			expect(store.loading).toBe(false);
		});

		it('should handle reset password error', async () => {
			const { api } = await import('@/services/api');
			const error = {
				response: {
					data: { message: 'Invalid or expired token' },
				},
			};
			(api.post as any).mockRejectedValue(error);

			await expect(
				store.resetPassword({
					token: 'invalid-token',
					newPassword: 'password123',
				}),
			).rejects.toEqual(error.response?.data);
			expect(store.loading).toBe(false);
		});
	});

	describe('Refresh User Profile', () => {
		it('should refresh user profile successfully when authenticated', async () => {
			const mockUser = createMockUser();
			store.isAuthenticated = true;
			store.userProfile = mockUser;

			const { api } = await import('@/services/api');
			const updatedProfile = { ...mockUser, displayName: 'Updated Name' };
			(api.get as any).mockResolvedValue({
				data: {
					...mockUser,
					profile: updatedProfile,
				},
			});

			await store.refreshUserProfile();

			expect(api.get).toHaveBeenCalledWith('/auth/status');
			expect(store.userProfile).toEqual(updatedProfile);
			expect(store.refreshingProfile).toBe(false);
		});

		it('should not refresh profile when not authenticated', async () => {
			store.isAuthenticated = false;

			await store.refreshUserProfile();

			const { api } = await import('@/services/api');
			expect(api.get).not.toHaveBeenCalled();
		});

		it('should handle 401 error by logging out', async () => {
			const mockUser = createMockUser();
			store.isAuthenticated = true;
			store.user = mockUser;
			store.userProfile = mockUser;

			const { api } = await import('@/services/api');
			const error = {
				response: { status: 401 },
			};
			(api.get as any).mockRejectedValue(error);

			await store.refreshUserProfile();

			expect(store.isAuthenticated).toBe(false);
			expect(store.user).toBeNull();
			expect(store.userProfile).toBeNull();
		});

		it('should handle non-401 errors gracefully', async () => {
			const mockUser = createMockUser();
			store.isAuthenticated = true;
			store.userProfile = mockUser;

			const { api } = await import('@/services/api');
			(api.get as any).mockRejectedValue(new Error('Network error'));

			await store.refreshUserProfile();

			// Should remain authenticated on non-401 errors
			expect(store.isAuthenticated).toBe(true);
			expect(store.userProfile).toEqual(mockUser);
			expect(store.refreshingProfile).toBe(false);
		});
	});

	describe('Session Persistence', () => {
		it('should maintain auth state across store instances', async () => {
			const mockUser = createMockUser();
			const { api } = await import('@/services/api');
			(api.post as any).mockResolvedValue({
				data: {
					...mockUser,
					profile: mockUser,
				},
			});

			// Login in first store instance
			await store.login('test@example.com', 'password');
			expect(store.isAuthenticated).toBe(true);

			// Create second store instance (should share state via Pinia)
			const store2 = useAuthStore();
			expect(store2.isAuthenticated).toBe(true);
			expect(store2.userProfile).toEqual(mockUser);
		});
	});

	describe('Loading States', () => {
		it('should set loading state during async operations', async () => {
			const { api } = await import('@/services/api');
			let resolveLogin: (value: any) => void;
			const loginPromise = new Promise((resolve) => {
				resolveLogin = resolve;
			});
			(api.post as any).mockReturnValue(loginPromise);

			const loginPromise2 = store.login('test@example.com', 'password');
			expect(store.loading).toBe(true);

			resolveLogin!({
				data: { ...createMockUser(), profile: createMockUser() },
			});
			await loginPromise2;

			expect(store.loading).toBe(false);
		});

		it('should set refreshingProfile during profile refresh', async () => {
			const mockUser = createMockUser();
			store.isAuthenticated = true;

			const { api } = await import('@/services/api');
			let resolveRefresh: (value: any) => void;
			const refreshPromise = new Promise((resolve) => {
				resolveRefresh = resolve;
			});
			(api.get as any).mockReturnValue(refreshPromise);

			const profileRefreshPromise = store.refreshUserProfile();
			expect(store.refreshingProfile).toBe(true);

			resolveRefresh!({
				data: { ...mockUser, profile: mockUser },
			});
			await profileRefreshPromise;

			expect(store.refreshingProfile).toBe(false);
		});
	});
});
