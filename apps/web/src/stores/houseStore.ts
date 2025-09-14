import { defineStore } from 'pinia';
import { ref } from 'vue';
import { useToast } from '@repo/ui';
import type { House, CreateHouse, UpdateHouse } from '@repo/types';
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
				description: error.response?.data?.message || error.message || `Failed to fetch houses`,
				variant: 'destructive',
			});
			throw error;
		} finally {
			loading.value = false;
		}
	}

	async function createHouse(data: CreateHouse) {
		try {
			loading.value = true;
			const response = await api.post('/houses', data);
			houses.value.push(response.data);
			toast({
				title: 'Success',
				description: 'House created successfully',
			});
			return true;
		} catch (error: any) {
			toast({
				title: 'Error',
				description: error.response?.data?.message || error.message || 'Failed to create house',
				variant: 'destructive',
			});
			return false;
		} finally {
			loading.value = false;
		}
	}

	async function updateHouse(id: string, data: UpdateHouse) {
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
			const index = houses.value.findIndex((h) => h.id === id);
			if (index !== -1) {
				houses.value[index] = response.data;
			}
			toast({
				title: 'Success',
				description: 'House updated successfully',
			});
			return true;
		} catch (error: any) {
			toast({
				title: 'Error',
				description: error.response?.data?.message || error.message || 'Failed to update house',
				variant: 'destructive',
			});
			return false;
		} finally {
			loading.value = false;
		}
	}

	async function deleteHouse(id: string) {
		try {
			loading.value = true;
			await api.delete(`/houses/${id}`);
			houses.value = houses.value.filter((h) => h.id !== id);
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

	async function fetchHouseById(id: string) {
		try {
			loading.value = true;
			const response = await api.get(`/houses/${id}`);
			// Optionally update the houses array if needed, or just return the data
			const index = houses.value.findIndex((h) => h.id === id);
			if (index !== -1) {
				houses.value[index] = response.data;
			}
			return response.data;
		} catch (error: any) {
			toast({
				title: 'Error',
				description:
					error.response?.data?.message || error.message || `Failed to fetch house ${id}`,
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
		fetchHouseById,
		createHouse,
		updateHouse,
		deleteHouse,
	};
});
