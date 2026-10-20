import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { User, UserProfile } from '@repo/types';
import { api } from '../services/api';
import { apiErrorMessage } from '@/services/apiError';
import { useRouter } from 'vue-router';
import { useToast } from '@repo/ui';
import { telemetryService } from '../services/telemetryService';
import { isOfflineModeEnabled } from '@/offline/flag';
import { clearAuthProfile, loadAuthProfile, saveAuthProfile } from '@/offline/authProfile';
import { clearSavedResponses, setCacheUser } from '@/offline/readCache';

/**
 * `/auth/status` runs inside the router guard before the first screen paints.
 * With a bad signal it must give up quickly so the app can start from the saved
 * profile (specs/offline-mode, D8) instead of hanging on a blank page.
 */
const AUTH_STATUS_TIMEOUT_MS = 8_000;

// Auth input types
interface RegisterUserInput {
	email: string;
	password: string;
	displayName: string;
	recaptchaToken?: string;
}

interface RequestPasswordResetInput {
	email: string;
}

interface ResetPasswordInput {
	token: string;
	newPassword: string;
}

export const useAuthStore = defineStore('auth', () => {
	const user = ref<User | null>(null);
	const userProfile = ref<UserProfile | null>(null);
	const loading = ref(false);
	const refreshingProfile = ref(false);
	const isAuthenticated = ref(false);
	/** Where the session state came from: the server, or the copy saved on the device. */
	const authSource = ref<'server' | 'cache' | null>(null);
	const router = useRouter();
	const { toast } = useToast();

	/** Remember the confirmed profile so the app can start without signal (D8). */
	function rememberProfile(status: any) {
		setCacheUser(status?.id ?? null);
		authSource.value = 'server';
		if (isOfflineModeEnabled() && status?.id) void saveAuthProfile(status);
	}

	function forgetProfile() {
		setCacheUser(null);
		authSource.value = null;
		void clearAuthProfile();
	}

	/** Without signal: start from the last profile the server confirmed, if any. */
	async function restoreSavedProfile(): Promise<boolean> {
		if (!isOfflineModeEnabled() || isAuthenticated.value) return false;
		const saved = await loadAuthProfile<any>();
		if (!saved?.id) return false;
		user.value = saved;
		userProfile.value = saved.profile;
		isAuthenticated.value = true;
		authSource.value = 'cache';
		setCacheUser(saved.id);
		return true;
	}

	async function login(email: string, password: string, recaptchaToken?: string): Promise<void> {
		try {
			loading.value = true;
			const response = await api.post('/auth/login', { email, password, recaptchaToken });
			user.value = response.data;
			userProfile.value = response.data.profile;
			isAuthenticated.value = true;
			rememberProfile(response.data);

			// Initialize telemetry session
			if (response.data.id) {
				telemetryService.initialize(response.data.id).catch(() => {});
			}

			toast({
				title: 'Success',
				description: 'Logged in successfully',
			});
		} catch (error: any) {
			isAuthenticated.value = false;
			user.value = null;
			userProfile.value = null;
			toast({
				title: 'Login Failed',
				description:
					apiErrorMessage(error, 'An unexpected error occurred.'),
				variant: 'destructive',
			});
			// Rethrow the error to be caught in the component
			throw error.response?.data || error;
		} finally {
			loading.value = false;
		}
	}

	async function register(data: RegisterUserInput) {
		try {
			loading.value = true;
			await api.post('/auth/register', data);
			toast({
				title: 'Registro exitoso',
				description: 'Tu cuenta ha sido creada. Por favor inicia sesión.',
			});
		} catch (error: any) {
			// No toast here — the component shows inline error
			throw error.response?.data || error;
		} finally {
			loading.value = false;
		}
	}

	async function checkAuthStatus() {
		try {
			const response = await api.get('/auth/status', { timeout: AUTH_STATUS_TIMEOUT_MS });
			if (response.data && response.data.authenticated !== false) {
				user.value = response.data;
				userProfile.value = response.data.profile;
				isAuthenticated.value = true;
				rememberProfile(response.data);

				// Initialize telemetry if not already active (e.g. page refresh)
				if (!telemetryService.isTelemetryActive() && response.data.id) {
					telemetryService.initialize(response.data.id).catch(() => {});
				}
			} else {
				user.value = null;
				userProfile.value = null;
				isAuthenticated.value = false;
				forgetProfile();
			}
		} catch (error: any) {
			// Don't reset auth state on rate-limit or network errors —
			// treat them as "unknown" rather than "not authenticated",
			// so the router guard doesn't redirect to login in a loop.
			const status = error?.response?.status;
			if (status === 429 || !error?.response) {
				console.warn('[Auth] checkAuthStatus failed (rate-limit or network), keeping current state');
				// On a cold start the state "kept" is logged out, which sends the team
				// to the login screen. Both cases mean "unknown", not "logged out":
				// start from the last profile the server confirmed (specs/offline-mode, D8).
				await restoreSavedProfile();
				return;
			}
			user.value = null;
			userProfile.value = null;
			isAuthenticated.value = false;
			forgetProfile();
		}
	}

	async function logout() {
		try {
			loading.value = true;
			// End telemetry session before logout
			await telemetryService.endSession().catch(() => {});
			await api.post('/auth/logout');
			isAuthenticated.value = false;
			user.value = null;
			userProfile.value = null;
			// Saved data leaves the device with the session (D9). Pending writes
			// are not touched here: they are never dropped without the user saying so.
			forgetProfile();
			await clearSavedResponses().catch(() => {});

			// Reset data stores to prevent stale data leaking across sessions
			const { useInventoryStore } = await import('./inventoryStore');
			const { useParticipantStore } = await import('./participantStore');
			useInventoryStore().$reset();
			useParticipantStore().$reset();

			toast({
				title: 'Success',
				description: 'Logged out successfully',
			});
			router.push('/login');
		} catch (error: any) {
			toast({
				title: 'Logout Failed',
				description:
					apiErrorMessage(error, 'An unexpected error occurred.'),
				variant: 'destructive',
			});
		} finally {
			loading.value = false;
		}
	}

	async function requestPasswordReset(input: RequestPasswordResetInput, recaptchaToken?: string) {
		try {
			loading.value = true;
			await api.post('/auth/password/request', { ...input, recaptchaToken });
			toast({
				title: 'Success',
				description: 'If an account with that email exists, a password reset link has been sent.',
			});
		} catch (error: any) {
			toast({
				title: 'Error',
				description:
					apiErrorMessage(error, 'An unexpected error occurred.'),
				variant: 'destructive',
			});
			throw error.response?.data || error;
		} finally {
			loading.value = false;
		}
	}

	async function resetPassword(input: ResetPasswordInput) {
		try {
			loading.value = true;
			await api.post('/auth/password/reset', input);
			toast({
				title: 'Success',
				description: 'Password has been reset successfully. You can now log in.',
			});
			router.push('/login');
		} catch (error: any) {
			toast({
				title: 'Password Reset Failed',
				description:
					apiErrorMessage(error, 'An unexpected error occurred.'),
				variant: 'destructive',
			});
			throw error.response?.data || error;
		} finally {
			loading.value = false;
		}
	}

	async function refreshUserProfile() {
		if (!isAuthenticated.value) return;

		try {
			refreshingProfile.value = true;
			const response = await api.get('/auth/status');
			if (response.data && response.data.authenticated !== false) {
				userProfile.value = response.data.profile;
			}
		} catch (error: any) {
			console.error('Failed to refresh user profile:', error);

			// Check if it's an authentication error
			if (error.response?.status === 401) {
				// User session expired, logout
				isAuthenticated.value = false;
				user.value = null;
				userProfile.value = null;
				toast({
					title: 'Session Expired',
					description: 'Your session has expired. Please log in again.',
					variant: 'destructive',
				});
				router.push('/login');
			} else {
				// Don't logout on other errors, just show warning
				toast({
					title: 'Warning',
					description: 'Could not refresh permissions. Some features may be limited.',
					variant: 'default',
				});
			}
		} finally {
			refreshingProfile.value = false;
		}
	}

	return {
		user,
		userProfile,
		loading,
		refreshingProfile,
		isAuthenticated,
		authSource,
		checkAuthStatus,
		login,
		register,
		logout,
		requestPasswordReset,
		resetPassword,
		refreshUserProfile,
	};
});
