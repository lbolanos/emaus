import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { Participant } from '@repo/types';
import { api } from '@/services/api';

export const useParticipantStore = defineStore('participant', () => {
  const participants = ref<Participant[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);

  const fetchParticipants = async (retreatId?: string) => {
    loading.value = true;
    error.value = null;
    try {
      const response = await api.get<Participant[]>('/participants', {
        params: { retreatId },
      });
      participants.value = response.data;
    } catch (err: any) {
      error.value = err.message || 'Failed to fetch participants';
      console.error('Error fetching participants:', err);
    } finally {
      loading.value = false;
    }
  };

  return {
    participants,
    loading,
    error,
    fetchParticipants,
  };
});
