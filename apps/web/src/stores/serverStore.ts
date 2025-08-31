import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { Server, CreateServer } from '@repo/types';
import { api } from '@/services/api';

export const useServerStore = defineStore('server', () => {
  const servers = ref<Server[]>([]);
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
    } finally {
      loading.value = false;
    }
  }

  async function createServer(serverData: CreateServer) {
    loading.value = true;
    error.value = null;
    try {
      const response = await api.post('/participants/server', serverData);
      servers.value.push(response.data);
    } catch (err) {
      error.value = 'Failed to create server.';
      throw err; // Rethrow to be caught in the component
    } finally {
      loading.value = false;
    }
  }

  return { servers, loading, error, serverCount, fetchServers, createServer, clearServers };
});