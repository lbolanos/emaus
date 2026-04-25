import { defineStore } from 'pinia';
import { ref } from 'vue';
import { santisimoApi, type SantisimoSlotWithSignups } from '../services/api';

export const useSantisimoStore = defineStore('santisimo', () => {
	const slots = ref<SantisimoSlotWithSignups[]>([]);
	const loading = ref(false);
	const error = ref<string | null>(null);

	const fetchSlots = async (retreatId: string) => {
		loading.value = true;
		error.value = null;
		try {
			slots.value = await santisimoApi.listSlots(retreatId);
		} catch (e: any) {
			error.value = e?.response?.data?.message || e?.message || 'Failed to fetch';
		} finally {
			loading.value = false;
		}
	};

	const generateSlots = async (
		retreatId: string,
		payload: {
			startDateTime: string;
			endDateTime: string;
			slotMinutes?: number;
			capacity?: number;
			clearExisting?: boolean;
		},
	) => {
		loading.value = true;
		error.value = null;
		try {
			slots.value = await santisimoApi.generateSlots(retreatId, payload);
		} catch (e: any) {
			error.value = e?.response?.data?.message || e?.message || 'Failed to generate';
			throw e;
		} finally {
			loading.value = false;
		}
	};

	const updateSlot = async (
		id: string,
		data: Partial<{
			startTime: string;
			endTime: string;
			capacity: number;
			isDisabled: boolean;
			intention: string | null;
			notes: string | null;
		}>,
	) => {
		const updated = await santisimoApi.updateSlot(id, data);
		const idx = slots.value.findIndex((s) => s.id === id);
		if (idx >= 0) slots.value[idx] = { ...slots.value[idx], ...updated };
		return updated;
	};

	const deleteSlot = async (id: string) => {
		await santisimoApi.deleteSlot(id);
		slots.value = slots.value.filter((s) => s.id !== id);
	};

	const adminCreateSignup = async (
		retreatId: string,
		data: { slotId: string; name: string; phone?: string | null; email?: string | null; userId?: string | null },
	) => {
		await santisimoApi.adminCreateSignup(retreatId, data);
		await fetchSlots(retreatId);
	};

	const deleteSignup = async (retreatId: string, signupId: string) => {
		await santisimoApi.deleteSignup(signupId);
		await fetchSlots(retreatId);
	};

	return {
		slots,
		loading,
		error,
		fetchSlots,
		generateSlots,
		updateSlot,
		deleteSlot,
		adminCreateSignup,
		deleteSignup,
	};
});
