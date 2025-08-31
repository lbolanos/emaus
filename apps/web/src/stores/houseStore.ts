import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { House } from '@repo/types';
import { api } from '@/services/api';

export const useHouseStore = defineStore('house', () => {
  const houses = ref<House[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);

  async function fetchHouses() {
    loading.value = true;
    error.value = null;
    try {
      const response = await api.get('/houses');
      houses.value = response.data;
    } catch (err) {
      error.value = 'Failed to fetch houses.';
    } finally {
      loading.value = false;
    }
  }

  return { houses, loading, error, fetchHouses };
});
