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

export const updateTable = async (
	tableId: string,
	data: Partial<TableMesa>,
): Promise<TableMesa> => {
	const response = await api.put(`/tables/${tableId}`, data);
	return response.data;
};

export const assignLeaderToTable = async (
	tableId: string,
	participantId: string,
	role: 'lider' | 'colider1' | 'colider2',
): Promise<TableMesa> => {
	const response = await api.post(`/tables/${tableId}/leader/${role}`, { participantId });
	return response.data;
};

export const assignWalkerToTable = async (
	tableId: string,
	participantId: string,
): Promise<TableMesa> => {
	const response = await api.post(`/tables/${tableId}/walkers`, { participantId });
	return response.data;
};

export const unassignLeader = async (
	tableId: string,
	role: 'lider' | 'colider1' | 'colider2',
): Promise<TableMesa> => {
	const response = await api.delete(`/tables/${tableId}/leader/${role}`);
	return response.data;
};

export const unassignWalker = async (tableId: string, walkerId: string): Promise<TableMesa> => {
	const response = await api.delete(`/tables/${tableId}/walkers/${walkerId}`);
	return response.data;
};
