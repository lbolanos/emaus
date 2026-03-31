import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { User, UserProfile } from '@repo/types';
import { api } from '../services/api';
import { useRouter } from 'vue-router';
import { useToast } from '@repo/ui';
import { telemetryService } from '../services/telemetryService';

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
	const router = useRouter();
	const { toast } = useToast();

	async function login(email: string, password: string, recaptchaToken?: string): Promise<void> {
		try {
			loading.value = true;
			const response = await api.post('/auth/login', { email, password, recaptchaToken });
			user.value = response.data;
			userProfile.value = response.data.profile;
			isAuthenticated.value = true;

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
					error.response?.data?.message || error.message || 'An unexpected error occurred.',
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
			const response = await api.get('/auth/status');
			if (response.data && response.data.authenticated !== false) {
				user.value = response.data;
				userProfile.value = response.data.profile;
				isAuthenticated.value = true;

				// Initialize telemetry if not already active (e.g. page refresh)
				if (!telemetryService.isTelemetryActive() && response.data.id) {
					telemetryService.initialize(response.data.id).catch(() => {});
				}
			} else {
				user.value = null;
				userProfile.value = null;
				isAuthenticated.value = false;
			}
		} catch (error) {
			user.value = null;
			userProfile.value = null;
			isAuthenticated.value = false;
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
					error.response?.data?.message || error.message || 'An unexpected error occurred.',
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
					error.response?.data?.message || error.message || 'An unexpected error occurred.',
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
					error.response?.data?.message || error.message || 'An unexpected error occurred.',
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
		checkAuthStatus,
		login,
		register,
		logout,
		requestPasswordReset,
		resetPassword,
		refreshUserProfile,
	};
});
