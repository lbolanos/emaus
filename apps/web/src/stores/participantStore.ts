import { defineStore } from 'pinia';
import { ref } from 'vue';
import { useToast } from '@repo/ui/components/ui/toast/use-toast';
import type { Participant, CreateParticipantInput } from 'types';
import { api } from '@/services/api';

export const useParticipantStore = defineStore('participant', () => {
  const participants = ref<Participant[]>([]);
  const loading = ref(false);
  const { toast } = useToast();

  async function fetchParticipants(retreatId: string, type: 'walker' | 'server', isCanceled?: boolean) {
    try {
      loading.value = true;
      const response = await api.get('/participants', { params: { retreatId, type, isCanceled } });
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

  async function importParticipants(retreatId: string, type: 'walker' | 'server', participantsData: any[]) {
    try {
      loading.value = true;
      const response = await api.post(`/participants/import/${retreatId}`, { participants: participantsData });
      // Assuming the API returns the updated list or a success message
      // Re-fetch participants to ensure the list is up-to-date
      await fetchParticipants(retreatId, type);
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
      const index = participants.value.findIndex(p => p.id === id);
      if (index !== -1) {
        participants.value[index] = response.data;
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
      participants.value = participants.value.filter(p => p.id !== id);
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
    participants.value = [];
  }



  return {
    participants,
    loading,
    fetchParticipants,
    createParticipant,
    clearParticipants,
    importParticipants,
    updateParticipant,
    deleteParticipant,
  };
});
