import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { Participant } from '@repo/types'
import { api } from '@/services/api';

export const useServerStore = defineStore('server', () => {
  const servers = ref<Participant[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);

  const serverCount = computed(() => servers.value.length);

  function clearServers() {
    servers.value = [];
  }

  async function fetchServers(retreatId: string) {
    if (!retreatId) {
      servers.value = [];
      return;
    }
    loading.value = true;
    error.value = null;
    try {
      const response = await api.get('/participants', { params: { retreatId, type: 'server' } });
      servers.value = response.data;
    } catch (err) {
      error.value = 'Failed to fetch servers.';
      throw err;
    } finally {
      loading.value = false;
    }
  }


  return { servers, loading, error, serverCount, fetchServers, clearServers };
});