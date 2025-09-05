import axios from 'axios';
//import { useAuthStore } from '@/stores/authStore';
import type { TableMesa } from '@repo/types';

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

/*api.interceptors.response.use(
  response => response,
  (error) => {
    if (error.response?.status === 401) {
      const authStore = useAuthStore();
      authStore.logout();
    }

    return Promise.reject(error);
  },
);

export default api;*/

// TableMesa API functions
export const getTablesByRetreat = async (retreatId: string): Promise<TableMesa[]> => {
  const response = await api.get(`/tables/retreat/${retreatId}`);
  return response.data;
};

export const updateTable = async (tableId: string, data: Partial<TableMesa>): Promise<TableMesa> => {
  const response = await api.put(`/tables/${tableId}`, data);
  return response.data;
};

export const assignLeaderToTable = async (tableId: string, participantId: string, role: 'lider' | 'colider1' | 'colider2'): Promise<TableMesa> => {
  // This endpoint doesn't exist yet, but we can prepare the frontend for it.
  // We'll use the generic updateTable for now.
  return updateTable(tableId, { [`${role}Id`]: participantId });
};

export const rebalanceTables = async (retreatId: string): Promise<void> => {
  await api.post(`/tables/rebalance/${retreatId}`);
};

export const assignWalkerToTable = async (tableId: string, participantId: string): Promise<void> => {
  await api.post(`/tables/${tableId}/walkers`, { participantId });
};
