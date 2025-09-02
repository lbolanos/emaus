import { defineStore } from 'pinia';
import { ref } from 'vue';
import { useToast } from '@repo/ui/components/ui/toast/use-toast';
import type { House } from 'types';
import { api } from '@/services/api';

export const useHouseStore = defineStore('house', () => {
  const houses = ref<House[]>([]);
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
        description: error.response?.data?.message || error.message || 'Failed to fetch houses',
        variant: 'destructive',
      });
    } finally {
      loading.value = false;
    }
  }

  return {
    houses,
    loading,
    fetchHouses,
  };
});
