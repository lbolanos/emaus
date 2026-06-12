import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { MessageSequence } from '@repo/types';
import {
	getRetreatSequences,
	createMessageSequence,
	updateMessageSequence,
	deleteMessageSequence,
	getSequenceQueue,
	runSequences,
	dispatchScheduledMessage,
	type ScheduledMessageQueueItem,
} from '@/services/api';

/**
 * Secuencias de mensajes (drip) de un retiro + bandeja de pendientes de WhatsApp.
 */
export const useMessageSequenceStore = defineStore('message-sequence', () => {
	const sequences = ref<MessageSequence[]>([]);
	const queue = ref<ScheduledMessageQueueItem[]>([]);
	const loading = ref(false);
	const error = ref<string | null>(null);

	const fetchSequences = async (retreatId: string) => {
		loading.value = true;
		error.value = null;
		try {
			sequences.value = await getRetreatSequences(retreatId);
		} catch (e: any) {
			error.value = e?.message || 'Failed to fetch sequences';
		} finally {
			loading.value = false;
		}
	};

	const fetchQueue = async (retreatId: string) => {
		try {
			queue.value = await getSequenceQueue(retreatId);
		} catch (e: any) {
			error.value = e?.message || 'Failed to fetch queue';
		}
	};

	const create = async (data: Record<string, unknown>) => {
		const created = await createMessageSequence(data);
		sequences.value.unshift(created);
		return created;
	};

	const update = async (id: string, data: Record<string, unknown>) => {
		const updated = await updateMessageSequence(id, data);
		const idx = sequences.value.findIndex((s) => s.id === id);
		if (idx !== -1) sequences.value[idx] = updated;
		return updated;
	};

	const remove = async (id: string) => {
		await deleteMessageSequence(id);
		sequences.value = sequences.value.filter((s) => s.id !== id);
	};

	const run = async (retreatId: string) => {
		const result = await runSequences(retreatId);
		await fetchQueue(retreatId);
		return result;
	};

	const dispatch = async (id: string) => {
		await dispatchScheduledMessage(id);
		queue.value = queue.value.filter((q) => q.id !== id);
	};

	return {
		sequences,
		queue,
		loading,
		error,
		fetchSequences,
		fetchQueue,
		create,
		update,
		remove,
		run,
		dispatch,
	};
});
