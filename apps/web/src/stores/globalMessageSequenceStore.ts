import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { GlobalMessageSequence } from '@repo/types';
import {
	getGlobalSequences,
	createGlobalSequence,
	updateGlobalSequence,
	deleteGlobalSequence,
	toggleGlobalSequenceActive,
	copyGlobalSequenceToRetreat,
} from '@/services/api';

/**
 * Plantillas globales de secuencias de mensajes (drip) reutilizables en
 * cualquier retiro. Se importan a un retiro vía `copyToRetreat`.
 */
export const useGlobalMessageSequenceStore = defineStore('global-message-sequence', () => {
	const sequences = ref<GlobalMessageSequence[]>([]);
	const loading = ref(false);
	const error = ref<string | null>(null);

	const fetchSequences = async () => {
		loading.value = true;
		error.value = null;
		try {
			sequences.value = await getGlobalSequences();
		} catch (e: any) {
			error.value = e?.message || 'Failed to fetch global sequences';
		} finally {
			loading.value = false;
		}
	};

	const create = async (data: Record<string, unknown>) => {
		const created = await createGlobalSequence(data);
		sequences.value.unshift(created);
		return created;
	};

	const update = async (id: string, data: Record<string, unknown>) => {
		const updated = await updateGlobalSequence(id, data);
		const idx = sequences.value.findIndex((s) => s.id === id);
		if (idx !== -1) sequences.value[idx] = updated;
		return updated;
	};

	const remove = async (id: string) => {
		await deleteGlobalSequence(id);
		sequences.value = sequences.value.filter((s) => s.id !== id);
	};

	const toggleActive = async (id: string) => {
		const updated = await toggleGlobalSequenceActive(id);
		const idx = sequences.value.findIndex((s) => s.id === id);
		if (idx !== -1) sequences.value[idx] = updated;
		return updated;
	};

	const copyToRetreat = async (id: string, retreatId: string) => {
		return copyGlobalSequenceToRetreat(id, retreatId);
	};

	return {
		sequences,
		loading,
		error,
		fetchSequences,
		create,
		update,
		remove,
		toggleActive,
		copyToRetreat,
	};
});
