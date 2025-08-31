import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { Retreat, CreateRetreat } from '@repo/types';
import { api } from '@/services/api';

export const useRetreatStore = defineStore('retreat', () => {
  const retreats = ref<Retreat[]>([]);
  const selectedRetreatId = ref<string | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);

  const mostRecentRetreat = computed(() => {
    if (retreats.value.length > 0) {
      return retreats.value[0]; // Assumes retreats are sorted by date descending
    }
    return null;
  });

  function selectRetreat(retreatId: string) {
    selectedRetreatId.value = retreatId;
  }

  async function fetchRetreats() {
    loading.value = true;
    error.value = null;
    try {
      const response = await api.get('/retreats');
      retreats.value = response.data;
      if (mostRecentRetreat.value) {
        selectRetreat(mostRecentRetreat.value.id);
      }
    } catch (err) {
      error.value = 'Failed to fetch retreats.';
    } finally {
      loading.value = false;
    }
  }

  async function createRetreat(retreatData: CreateRetreat) {
    loading.value = true;
    error.value = null;
    try {
      const response = await api.post('/retreats', retreatData);
      retreats.value.unshift(response.data); // Add to the beginning of the list
      selectRetreat(response.data.id);
    } catch (err) {
      error.value = 'Failed to create retreat.';
      throw err;
    } finally {
      loading.value = false;
    }
  }

  return {
    retreats,
    selectedRetreatId,
    loading,
    error,
    mostRecentRetreat,
    selectRetreat,
    fetchRetreats,
    createRetreat,
  };
});
