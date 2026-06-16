import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { MessageSequence } from '@repo/types';
import {
	getRetreatSequences,
	createMessageSequence,
	updateMessageSequence,
	deleteMessageSequence,
	getSequenceQueue,
	getSequenceStats,
	getScheduledMessageDetail,
	runSequences,
	regenerateSequenceQueue,
	bulkResolveSequenceIssues,
	dispatchScheduledMessage,
	skipScheduledMessage,
	retryScheduledMessage,
	discardScheduledMessage,
	openScheduledMessage,
	assignScheduledMessage,
	setParticipantDoNotContact,
	type ScheduledMessageQueueItem,
	type ScheduledMessageDetail,
} from '@/services/api';

/**
 * Secuencias de mensajes (drip) de un retiro + bandeja de pendientes de WhatsApp.
 */
export const useMessageSequenceStore = defineStore('message-sequence', () => {
	const sequences = ref<MessageSequence[]>([]);
	const queue = ref<ScheduledMessageQueueItem[]>([]);
	const stats = ref<Record<string, Record<string, number>>>({});
	const issues = ref<ScheduledMessageQueueItem[]>([]);
	const detail = ref<ScheduledMessageDetail | null>(null);
	const detailLoading = ref(false);
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

	const fetchStats = async (retreatId: string) => {
		try {
			const res = await getSequenceStats(retreatId);
			stats.value = res.stats;
			issues.value = res.issues;
		} catch (e: any) {
			error.value = e?.message || 'Failed to fetch stats';
		}
	};

	const fetchDetail = async (id: string) => {
		detailLoading.value = true;
		detail.value = null;
		try {
			detail.value = await getScheduledMessageDetail(id);
		} catch (e: any) {
			error.value = e?.message || 'Failed to fetch detail';
		} finally {
			detailLoading.value = false;
		}
		return detail.value;
	};

	const clearDetail = () => {
		detail.value = null;
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

	// Renueva el texto de los pendientes de la bandeja con la plantilla vigente.
	const regenerateQueue = async (retreatId: string) => {
		const result = await regenerateSequenceQueue(retreatId);
		await fetchQueue(retreatId);
		return result;
	};

	// Acción masiva sobre los mensajes con problema (reenviar/descartar).
	const bulkResolveIssues = async (retreatId: string, action: 'retry' | 'discard') => {
		const result = await bulkResolveSequenceIssues(retreatId, action);
		await fetchQueue(retreatId);
		await fetchStats(retreatId);
		return result;
	};

	const dispatch = async (id: string) => {
		await dispatchScheduledMessage(id);
		queue.value = queue.value.filter((q) => q.id !== id);
	};

	const skip = async (id: string) => {
		await skipScheduledMessage(id);
		queue.value = queue.value.filter((q) => q.id !== id);
	};

	// Re-encola un fallido: sale de la lista de problemas (volverá a la cola/cron).
	const retry = async (id: string) => {
		await retryScheduledMessage(id);
		issues.value = issues.value.filter((q) => q.id !== id);
		queue.value = queue.value.filter((q) => q.id !== id);
	};

	// Descarta: sale de la lista de problemas y no reaparece.
	const discard = async (id: string) => {
		await discardScheduledMessage(id);
		issues.value = issues.value.filter((q) => q.id !== id);
		queue.value = queue.value.filter((q) => q.id !== id);
	};

	// Registra apertura del deep-link (≠ enviado): el ítem permanece en la bandeja.
	const open = async (id: string) => {
		await openScheduledMessage(id);
		const it = queue.value.find((q) => q.id === id);
		if (it) it.openedAt = new Date().toISOString();
	};

	const assign = async (id: string, userId: string | null) => {
		await assignScheduledMessage(id, userId);
		const it = queue.value.find((q) => q.id === id);
		if (it) it.assignedTo = userId;
	};

	const setDoNotContact = async (retreatId: string, participantId: string, value: boolean) => {
		await setParticipantDoNotContact(retreatId, participantId, value);
		if (detail.value?.participant?.id === participantId) {
			detail.value.participant.doNotContact = value;
		}
	};

	return {
		sequences,
		queue,
		stats,
		issues,
		detail,
		detailLoading,
		loading,
		error,
		fetchSequences,
		fetchQueue,
		fetchStats,
		fetchDetail,
		clearDetail,
		create,
		update,
		remove,
		run,
		regenerateQueue,
		bulkResolveIssues,
		dispatch,
		skip,
		retry,
		discard,
		open,
		assign,
		setDoNotContact,
	};
});
