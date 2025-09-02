import { defineStore } from 'pinia';
import { ref } from 'vue';
import { useToast } from '@repo/ui/components/ui/toast/use-toast';
import type { Participant, CreateParticipantInput } from 'types';
import { api } from '@/services/api';

export const useParticipantStore = defineStore('participant', () => {
  const participants = ref<Participant[]>([]);
  const loading = ref(false);
  const { toast } = useToast();

  async function fetchParticipants(retreatId: string, type: 'walker' | 'server') {
    try {
      loading.value = true;
      const response = await api.get('/participants', { params: { retreatId, type } });
      participants.value = response.data;
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.response?.data?.message || error.message || `Failed to fetch ${type}s`,
        variant: 'destructive',
      });
      throw error;
    } finally {
      loading.value = false;
    }
  }

  async function createParticipant(data: CreateParticipantInput) {
    try {
      loading.value = true;
      const response = await api.post('/participants/new', data);
      participants.value.push(response.data);
      toast({
        title: 'Success',
        description: 'Participant created successfully',
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.response?.data?.message || error.message || 'Failed to create Participant',
        variant: 'destructive',
      });
      throw error;
    } finally {
      loading.value = false;
    }
  }

  function clearParticipants() {
    participants.value = [];
  }



  return {
    participants,
    loading,
    fetchParticipants,
    createParticipant,
    clearParticipants,
  };
});
