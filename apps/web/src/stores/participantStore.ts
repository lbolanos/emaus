import { defineStore } from 'pinia';
import { ref } from 'vue';
import { useToast } from '@repo/ui/components/ui/toast/use-toast';
import type { Participant, CreateWalkerInput, CreateServerInput } from 'types';
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
    } finally {
      loading.value = false;
    }
  }

  async function createWalker(data: CreateWalkerInput) {
    try {
      loading.value = true;
      const response = await api.post('/participants/walker', data);
      participants.value.push(response.data);
      toast({
        title: 'Success',
        description: 'Walker created successfully',
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.response?.data?.message || error.message || 'Failed to create walker',
        variant: 'destructive',
      });
    } finally {
      loading.value = false;
    }
  }

  async function createServer(data: CreateServerInput) {
    try {
      loading.value = true;
      const response = await api.post('/participants/server', data);
      participants.value.push(response.data);
      toast({
        title: 'Success',
        description: 'Server created successfully',
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.response?.data?.message || error.message || 'Failed to create server',
        variant: 'destructive',
      });
    } finally {
      loading.value = false;
    }
  }

  return {
    participants,
    loading,
    fetchParticipants,
    createWalker,
    createServer,
  };
});
