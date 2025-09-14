import { defineStore } from 'pinia';
import { ref } from 'vue';
import { useToast } from '@repo/ui';
import type { Responsability } from '@repo/types';
import { api } from '@/services/api';

export const useResponsabilityStore = defineStore('responsability', () => {
	const responsibilities = ref<Responsability[]>([]);
	const loading = ref(false);
	const error = ref<string | null>(null);
	const { toast } = useToast();

	async function fetchResponsibilities(retreatId: string) {
		loading.value = true;
		error.value = null;
		try {
			const response = await api.get('/responsibilities', { params: { retreatId } });
			responsibilities.value = response.data;
		} catch (e: any) {
			error.value = 'Failed to fetch responsibilities.';
			toast({ title: 'Error', description: error.value, variant: 'destructive' });
			console.error(e);
		} finally {
			loading.value = false;
		}
	}

	async function createResponsability(data: { name: string; retreatId: string }) {
		try {
			const { data: newResponsability } = await api.post<Responsability>('/responsibilities', data);
			responsibilities.value.push(newResponsability);
			toast({ title: 'Success', description: 'Responsability created successfully.' });
		} catch (e: any) {
			toast({
				title: 'Error',
				description: 'Failed to create responsability.',
				variant: 'destructive',
			});
			console.error(e);
		}
	}

	async function updateResponsability(responsabilityId: string, data: { name: string }) {
		try {
			const { data: updatedResponsability } = await api.put<Responsability>(
				`/responsibilities/${responsabilityId}`,
				data,
			);
			const index = responsibilities.value.findIndex((c) => c.id === responsabilityId);
			if (index !== -1) {
				responsibilities.value[index] = updatedResponsability;
			}
			toast({ title: 'Success', description: 'Responsability updated successfully.' });
		} catch (e: any) {
			toast({
				title: 'Error',
				description: 'Failed to update responsability.',
				variant: 'destructive',
			});
			console.error(e);
		}
	}

	async function deleteResponsability(responsabilityId: string) {
		try {
			await api.delete(`/responsibilities/${responsabilityId}`);
			responsibilities.value = responsibilities.value.filter((c) => c.id !== responsabilityId);
			toast({ title: 'Success', description: 'Responsability deleted successfully.' });
		} catch (e: any) {
			toast({
				title: 'Error',
				description: 'Failed to delete responsability.',
				variant: 'destructive',
			});
			console.error(e);
		}
	}

	async function assignParticipant(responsabilityId: string, participantId: string | null) {
		try {
			let updatedResponsability: Responsability;

			if (participantId) {
				// Assign participant
				const response = await api.post<Responsability>(
					`/responsibilities/${responsabilityId}/assign`,
					{ participantId },
				);
				updatedResponsability = response.data;
			} else {
				// Un-assign participant
				const currentResponsability = responsibilities.value.find((c) => c.id === responsabilityId);
				if (!currentResponsability?.participantId) return; // Nothing to do
				const response = await api.delete<Responsability>(
					`/responsibilities/${responsabilityId}/assign/${currentResponsability.participantId}`,
				);
				updatedResponsability = response.data;
			}

			const index = responsibilities.value.findIndex((c) => c.id === responsabilityId);
			if (index !== -1) {
				responsibilities.value[index] = updatedResponsability;
			}
			toast({ title: 'Success', description: 'Participant assigned successfully.' });
		} catch (e: any) {
			toast({
				title: 'Error',
				description: 'Failed to assign participant.',
				variant: 'destructive',
			});
			console.error(e);
		}
	}

	return {
		responsibilities,
		loading,
		error,
		fetchResponsibilities,
		createResponsability,
		updateResponsability,
		deleteResponsability,
		assignParticipant,
	};
});
