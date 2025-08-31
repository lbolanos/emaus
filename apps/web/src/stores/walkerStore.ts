import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Walker, CreateWalker } from '@repo/types'
import { api } from '@/services/api'

export const useWalkerStore = defineStore('walker', () => {
  const walkers = ref<Walker[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  const walkerCount = computed(() => walkers.value.length);

  async function fetchWalkers(retreatId: string) {
    if (!retreatId) {
      walkers.value = [];
      return;
    }
    loading.value = true;
    error.value = null;
    try {
      const response = await api.get('/walkers', { params: { retreatId } });
      walkers.value = response.data;
    } catch (err) {
      error.value = 'Failed to fetch walkers.';
    } finally {
      loading.value = false;
    }
  }

  async function createWalker(walkerData: CreateWalker) {
    loading.value = true;
    error.value = null;
    try {
      const response = await api.post('/walkers', walkerData);
      walkers.value.push(response.data);
    } catch (err) {
      error.value = 'Failed to create walker.';
      throw err; // Rethrow to be caught in the component
    } finally {
      loading.value = false;
    }
  }

  return { walkers, loading, error, walkerCount, fetchWalkers, createWalker };
})