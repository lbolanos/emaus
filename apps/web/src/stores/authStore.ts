import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { User } from '@repo/types/user';
import { api } from '../services/api';

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null);
  const isAuthenticated = ref(false);

  async function login(email: string, password: string): Promise<void> {
    try {
      const response = await api.post('/auth/login', { email, password });
      user.value = response.data;
      isAuthenticated.value = true;
    } catch (error: any) {
      isAuthenticated.value = false;
      user.value = null;
      // Rethrow the error to be caught in the component
      throw error.response?.data || error;
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
      await api.post('/auth/logout');
      user.value = null;
      isAuthenticated.value = false;
    } catch (error) {
      console.error('Failed to logout', error);
    }
  }

  return { user, isAuthenticated, login, checkAuthStatus, logout };
});