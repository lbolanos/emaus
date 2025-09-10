import { defineStore } from 'pinia';
import { ref } from 'vue';
import { useToast } from '@repo/ui/components/ui/toast/use-toast';
import type { Charge } from '@repo/types';
import { api } from '@/services/api';

export const useChargeStore = defineStore('charge', () => {
	const charges = ref<Charge[]>([]);
	const loading = ref(false);
	const error = ref<string | null>(null);
	const { toast } = useToast();

	async function fetchCharges(retreatId: string) {
		loading.value = true;
		error.value = null;
		try {
			const response = await api.get('/charges', { params: { retreatId } });
			charges.value = response.data;
		} catch (e: any) {
			error.value = 'Failed to fetch charges.';
			toast({ title: 'Error', description: error.value, variant: 'destructive' });
			console.error(e);
		} finally {
			loading.value = false;
		}
	}

	async function createCharge(data: { name: string; retreatId: string }) {
		try {
			const { data: newCharge } = await api.post<Charge>('/charges', data);
			charges.value.push(newCharge);
			toast({ title: 'Success', description: 'Charge created successfully.' });
		} catch (e: any) {
			toast({ title: 'Error', description: 'Failed to create charge.', variant: 'destructive' });
			console.error(e);
		}
	}

	async function updateCharge(chargeId: string, data: { name: string }) {
		try {
			const { data: updatedCharge } = await api.put<Charge>(`/charges/${chargeId}`, data);
			const index = charges.value.findIndex((c) => c.id === chargeId);
			if (index !== -1) {
				charges.value[index] = updatedCharge;
			}
			toast({ title: 'Success', description: 'Charge updated successfully.' });
		} catch (e: any) {
			toast({ title: 'Error', description: 'Failed to update charge.', variant: 'destructive' });
			console.error(e);
		}
	}

	async function deleteCharge(chargeId: string) {
		try {
			await api.delete(`/charges/${chargeId}`);
			charges.value = charges.value.filter((c) => c.id !== chargeId);
			toast({ title: 'Success', description: 'Charge deleted successfully.' });
		} catch (e: any) {
			toast({ title: 'Error', description: 'Failed to delete charge.', variant: 'destructive' });
			console.error(e);
		}
	}

	async function assignParticipant(chargeId: string, participantId: string | null) {
		try {
			let updatedCharge: Charge;

			if (participantId) {
				// Assign participant
				const response = await api.post<Charge>(`/charges/${chargeId}/assign`, { participantId });
				updatedCharge = response.data;
			} else {
				// Un-assign participant
				const currentCharge = charges.value.find((c) => c.id === chargeId);
				if (!currentCharge?.participantId) return; // Nothing to do
				const response = await api.delete<Charge>(
					`/charges/${chargeId}/assign/${currentCharge.participantId}`,
				);
				updatedCharge = response.data;
			}

			const index = charges.value.findIndex((c) => c.id === chargeId);
			if (index !== -1) {
				charges.value[index] = updatedCharge;
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
		charges,
		loading,
		error,
		fetchCharges,
		createCharge,
		updateCharge,
		deleteCharge,
		assignParticipant,
	};
});
