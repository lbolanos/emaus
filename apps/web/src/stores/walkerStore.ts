import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Participant } from '@repo/types'
import { api } from '@/services/api'

export const useWalkerStore = defineStore('walker', () => {
  const walkers = ref<Participant[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  const walkerCount = computed(() => walkers.value.length);

  function clearWalkers() {
    walkers.value = [];
  }

  async function fetchWalkers(retreatId: string) {
    if (!retreatId) {
      walkers.value = [];
      return;
    }
    loading.value = true;
    error.value = null;
    try {
      const response = await api.get('/participants', { params: { retreatId, type: 'walker'  } });
      walkers.value = response.data;
    } catch (err) {
      error.value = 'Failed to fetch walkers.';
      throw err;
    } finally {
      loading.value = false;
    }
  }


  return { walkers, loading, error, walkerCount, fetchWalkers, clearWalkers };
})