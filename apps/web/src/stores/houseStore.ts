import { defineStore } from 'pinia';
import { ref } from 'vue';
import { useToast } from '@repo/ui/components/ui/toast/use-toast';
// import type { House, CreateHouseInput, UpdateHouseInput } from 'types'; // TODO: Create types
import { api } from '@/services/api';

// TODO: remove any
export const useHouseStore = defineStore('house', () => {
  const houses = ref<any[]>([]);
  const loading = ref(false);
  const { toast } = useToast();

  async function fetchHouses() {
    try {
      loading.value = true;
      const response = await api.get('/houses');
      houses.value = response.data;
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.response?.data?.message || error.message || `Failed to fetch houses`,
        variant: 'destructive',
      });
      throw error;
    } finally {
      loading.value = false;
    }
  }

  async function createHouse(data: any) {
    try {
      loading.value = true;
      const response = await api.post('/houses', data);
      houses.value.push(response.data);
      toast({
        title: 'Success',
        description: 'House created successfully',
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.response?.data?.message || error.message || 'Failed to create house',
        variant: 'destructive',
      });
      throw error;
    } finally {
      loading.value = false;
    }
  }

  async function updateHouse(id: string, data: any) {
    if (!id) {
      const error = new Error('House ID is missing');
      toast({
        title: 'Error',
        description: 'House ID is missing, cannot update.',
        variant: 'destructive',
      });
      throw error;
    }
    try {
      loading.value = true;
      const response = await api.put(`/houses/${id}`, data);
      const index = houses.value.findIndex(h => h.id === id);
      if (index !== -1) {
        houses.value[index] = response.data;
      }
      toast({
        title: 'Success',
        description: 'House updated successfully',
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.response?.data?.message || error.message || 'Failed to update house',
        variant: 'destructive',
      });
      throw error;
    } finally {
      loading.value = false;
    }
  }

  async function deleteHouse(id: string) {
    try {
      loading.value = true;
      await api.delete(`/houses/${id}`);
      houses.value = houses.value.filter(h => h.id !== id);
      toast({
        title: 'Success',
        description: 'House deleted successfully',
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.response?.data?.message || error.message || 'Failed to delete house',
        variant: 'destructive',
      });
      throw error;
    } finally {
      loading.value = false;
    }
  }

  return {
    houses,
    loading,
    fetchHouses,
    createHouse,
    updateHouse,
    deleteHouse,
  };
});