import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { useToast } from '@repo/ui/components/ui/toast/use-toast';
import type { Participant, CreateParticipant } from '@repo/types';
import { api } from '@/services/api';

export const useParticipantStore = defineStore('participant', () => {
  const allParticipants = ref<Participant[]>([]);
  const loading = ref(false);
  const { toast } = useToast();

  const walkers = computed(() => allParticipants.value.filter(p => p.type === 'walker'));
  const servers = computed(() => allParticipants.value.filter(p => p.type === 'server'));
  const waiting = computed(() => allParticipants.value.filter(p => p.type === 'waiting'));

  async function fetchParticipants(retreatId: string, isCanceled?: boolean) {
    try {
      loading.value = true;
      const response = await api.get('/participants', { params: { retreatId, isCanceled } });
      allParticipants.value = response.data;
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.response?.data?.message || error.message || `Failed to fetch participants`,
        variant: 'destructive',
      });
      throw error;
    } finally {
      loading.value = false;
    }
  }

  async function createParticipant(data: CreateParticipant) {
    try {
      loading.value = true;
      const response = await api.post('/participants/new', data);
      allParticipants.value.push(response.data);
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

  async function importParticipants(retreatId: string, participantsData: any[]) {
    try {
      loading.value = true;
      const response = await api.post(`/participants/import/${retreatId}`, { participants: participantsData });
      await fetchParticipants(retreatId);
      toast({
        title: 'Success',
        description: `${response.data.importedCount} participants imported, ${response.data.updatedCount} updated.`,
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.response?.data?.message || error.message || 'Failed to import participants',
        variant: 'destructive',
      });
      throw error;
    } finally {
      loading.value = false;
    }
  }

  async function updateParticipant(id: string, data: Partial<Participant>) {
    if (!id) {
      const error = new Error('Participant ID is missing');
      toast({
        title: 'Error',
        description: 'Participant ID is missing, cannot update.',
        variant: 'destructive',
      });
      throw error;
    }
    try {
      loading.value = true;
      const response = await api.put(`/participants/${id}`, data);
      const index = allParticipants.value.findIndex(p => p.id === id);
      if (index !== -1) {
        allParticipants.value[index] = response.data;
      }
      toast({
        title: 'Success',
        description: 'Participant updated successfully',
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.response?.data?.message || error.message || 'Failed to update participant',
        variant: 'destructive',
      });
      throw error;
    } finally {
      loading.value = false;
    }
  }

  async function deleteParticipant(id: string) {
    try {
      loading.value = true;
      await api.delete(`/participants/${id}`);
      allParticipants.value = allParticipants.value.filter(p => p.id !== id);
      toast({
        title: 'Success',
        description: 'Participant deleted successfully',
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.response?.data?.message || error.message || 'Failed to delete participant',
        variant: 'destructive',
      });
      throw error;
    } finally {
      loading.value = false;
    }
  }

  function clearParticipants() {
    allParticipants.value = [];
  }

  return {
    allParticipants,
    walkers,
    servers,
    waiting,
    loading,
    fetchParticipants,
    createParticipant,
    clearParticipants,
    importParticipants,
    updateParticipant,
    deleteParticipant,
  };
});
