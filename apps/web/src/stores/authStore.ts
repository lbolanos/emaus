import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { User } from '@repo/types/user';
import { api } from '../services/api';
import { useRouter } from 'vue-router';
import { useToast } from '@repo/ui/components/ui/toast/use-toast';

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null);
  const loading = ref(false);
  const isAuthenticated = ref(false);
  const router = useRouter();
  const { toast } = useToast();

  async function login(email: string, password: string): Promise<void> {
    try {
      loading.value = true;
      const response = await api.post('/auth/login', { email, password });
      user.value = response.data;
      isAuthenticated.value = true;
      toast({
        title: 'Success',
        description: 'Logged in successfully',
      });
    } catch (error: any) {
      isAuthenticated.value = false;
      user.value = null;
      toast({
        title: 'Login Failed',
        description: error.response?.data?.message || error.message || 'An unexpected error occurred.',
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
        title: 'Success',
        description: 'Registration successful. Please log in.',
      });
      router.push('/login');
    } catch (error: any) {
      toast({
        title: 'Registration Failed',
        description: error.response?.data?.message || error.message || 'An unexpected error occurred.',
        variant: 'destructive',
      });
      throw error.response?.data || error;
    } finally {
      loading.value = false;
    }
  }

  async function checkAuthStatus() {
    try {
      const response = await api.get('/auth/status');
      if (response.data) {
        user.value = response.data;
        isAuthenticated.value = true;
      }
    } catch (error) {
      user.value = null;
      isAuthenticated.value = false;
    }
  }

  async function logout() {
    try {
      loading.value = true;
      await api.post('/auth/logout');
      isAuthenticated.value = false;
      user.value = null;
      toast({
        title: 'Success',
        description: 'Logged out successfully',
      });
      router.push('/login');
    } catch (error: any) {
      toast({
        title: 'Logout Failed',
        description: error.response?.data?.message || error.message || 'An unexpected error occurred.',
        variant: 'destructive',
      });
    } finally {
      loading.value = false;
    }
  }

  async function requestPasswordReset(input: RequestPasswordResetInput) {
    try {
      loading.value = true;
      await api.post('/auth/password/request', input);
      toast({
        title: 'Success',
        description: 'If an account with that email exists, a password reset link has been sent.',
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.response?.data?.message || error.message || 'An unexpected error occurred.',
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
        description: error.response?.data?.message || error.message || 'An unexpected error occurred.',
        variant: 'destructive',
      });
      throw error.response?.data || error;
    } finally {
      loading.value = false;
    }
  }

  return {
    user,
    loading,
    isAuthenticated,
    checkAuthStatus,
    login,
    register,
    logout,
    requestPasswordReset,
    resetPassword,
  };
});