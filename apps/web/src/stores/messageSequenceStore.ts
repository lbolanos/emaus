import { defineStore } from 'pinia';
import { ref } from 'vue';
import { getSocket } from '@/services/realtime';
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
	fetchScheduledMessages,
	rescheduleSequenceStep,
	type ScheduledMessageQueueItem,
	type ScheduledMessageDetail,
	type ScheduledMessageListItem,
	type ScheduledMessagesPage,
	type FetchScheduledMessagesOptions,
} from '@/services/api';

/**
 * Secuencias de mensajes (drip) de un retiro + bandeja de pendientes de WhatsApp.
 */
export const useMessageSequenceStore = defineStore('message-sequence', () => {
	const sequences = ref<MessageSequence[]>([]);
	const queue = ref<ScheduledMessageQueueItem[]>([]);
	const stats = ref<Record<string, Record<string, number>>>({});
	const issues = ref<ScheduledMessageQueueItem[]>([]);
	// Conteo real de problemas (sin cap): el contador del tab y el botón
	// "cargar más" se guían por éste, no por issues.length (que está capado).
	const issuesTotal = ref(0);
	const detail = ref<ScheduledMessageDetail | null>(null);
	const detailLoading = ref(false);
	const loading = ref(false);
	const error = ref<string | null>(null);

	// Pestaña "Programados": paginado server-side (filtros/orden/página en el API).
	const scheduled = ref<ScheduledMessageListItem[]>([]);
	const scheduledTotal = ref(0);
	const scheduledPage = ref(1);
	const scheduledTotalPages = ref(1);
	const scheduledTimezone = ref<string | null>(null);
	const scheduledLoading = ref(false);
	// Retiro del último fetch: alimenta el fallback de TZ y los refresh de stats
	// fire-and-forget (sin andar pasando el retreatId por todos lados).
	let currentRetreatId: string | null = null;

	// Realtime (bandeja en vivo, patrón receptionStore).
	const realtimeConnected = ref(false);
	let subscribedRetreatId: string | null = null;

	const fetchSequences = async (retreatId: string) => {
		loading.value = true;
		error.value = null;
		currentRetreatId = retreatId;
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
			issuesTotal.value = res.issuesTotal ?? res.issues.length;
		} catch (e: any) {
			error.value = e?.message || 'Failed to fetch stats';
		}
	};

	/**
	 * "Cargar más" del tab Problemas: appendea la página siguiente de issues.
	 * El fetch inicial trae las primeras 100 + `issuesTotal` (conteo real sin
	 * cap); dedupe por id por si una fila cambió de estado entre fetches.
	 */
	const loadMoreIssues = async () => {
		if (!currentRetreatId) return;
		const res = await getSequenceStats(currentRetreatId, {
			issuesOffset: issues.value.length,
		});
		const seen = new Set(issues.value.map((i) => i.id));
		issues.value.push(...res.issues.filter((i) => !seen.has(i.id)));
		issuesTotal.value = res.issuesTotal ?? issues.value.length;
	};

	/**
	 * Pestaña "Programados": TODO el filtrado/orden/paginación lo resuelve el
	 * servidor. La TZ viene en la respuesta (el cliente nunca la infiere); se
	 * expone como `scheduledTimezone` para pintar fechas y como fallback del
	 * resto de la vista (bandeja/detalle).
	 */
	const fetchScheduled = async (retreatId: string, opts: FetchScheduledMessagesOptions = {}) => {
		scheduledLoading.value = true;
		currentRetreatId = retreatId;
		try {
			const res: ScheduledMessagesPage = await fetchScheduledMessages(retreatId, opts);
			scheduled.value = res.items;
			scheduledTotal.value = res.total;
			scheduledPage.value = res.page;
			scheduledTotalPages.value = res.totalPages;
			scheduledTimezone.value = res.timezone;
		} catch (e: any) {
			error.value = e?.message || 'Failed to fetch scheduled messages';
		} finally {
			scheduledLoading.value = false;
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

	// Acción masiva sobre los mensajes con problema (reenviar/descartar). Con
	// `ids` acota el bulk a las filas filtradas/visibles en la UI (M6-D6).
	const bulkResolveIssues = async (retreatId: string, action: 'retry' | 'discard', ids?: string[]) => {
		const result = await bulkResolveSequenceIssues(retreatId, action, ids);
		await fetchQueue(retreatId);
		await fetchStats(retreatId);
		return result;
	};

	/**
	 * Reprogramar/encolar-ya un paso: mueve sus `pending` y refresca las tres
	 * vistas que pueden verse afectadas (Programados, bandeja y stats — con
	 * `immediate` los mensajes caen a `queued` en el servidor).
	 */
	const rescheduleStep = async (
		retreatId: string,
		stepId: string,
		payload: { immediate?: boolean; date?: string; hour?: number },
	) => {
		const result = await rescheduleSequenceStep(stepId, payload);
		await Promise.all([fetchQueue(retreatId), fetchStats(retreatId)]);
		return result;
	};

	// Refresca stats en el fondo (M6-D3): despachar/omitir/reintentar/descartar
	// cambian los contadores de los badges de la lista. Fire-and-forget — nunca
	// bloquea la acción ni la rompe si el fetch falla.
	const refreshStatsInBackground = () => {
		if (!currentRetreatId) return;
		fetchStats(currentRetreatId).catch(() => {});
	};

	const dispatch = async (id: string) => {
		await dispatchScheduledMessage(id);
		queue.value = queue.value.filter((q) => q.id !== id);
		refreshStatsInBackground();
	};

	const skip = async (id: string) => {
		await skipScheduledMessage(id);
		queue.value = queue.value.filter((q) => q.id !== id);
		refreshStatsInBackground();
	};

	// Re-encola un fallido: sale de la lista de problemas (volverá a la cola/cron).
	const retry = async (id: string) => {
		await retryScheduledMessage(id);
		issues.value = issues.value.filter((q) => q.id !== id);
		issuesTotal.value = Math.max(0, issuesTotal.value - 1);
		queue.value = queue.value.filter((q) => q.id !== id);
		refreshStatsInBackground();
	};

	// Descarta: sale de la lista de problemas y no reaparece.
	const discard = async (id: string) => {
		await discardScheduledMessage(id);
		issues.value = issues.value.filter((q) => q.id !== id);
		issuesTotal.value = Math.max(0, issuesTotal.value - 1);
		queue.value = queue.value.filter((q) => q.id !== id);
		refreshStatsInBackground();
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

	/**
	 * Sync en vivo de la bandeja (patrón receptionStore): join con ack, re-join
	 * al reconectar y, ante cualquier `sequences:queue-changed` del retiro
	 * activo, refresco de cola+stats en el fondo. El eco propio (yo despaché →
	 * me llega mi evento) es inofensivo: la acción ya actualizó el estado local
	 * y el refetch trae lo mismo. Devuelve un unsubscribe idempotente.
	 */
	function subscribeRealtime(retreatId: string) {
		const socket = getSocket();
		subscribedRetreatId = retreatId;

		const join = () => {
			socket.emit('sequences:subscribe', retreatId, (ok: boolean) => {
				realtimeConnected.value = !!ok;
			});
		};

		if (socket.connected) join();
		socket.on('connect', join);

		const listener = (e: { retreatId: string }) => {
			const active = subscribedRetreatId;
			if (!active || e.retreatId !== active) return;
			fetchQueue(active).catch(() => {});
			fetchStats(active).catch(() => {});
		};

		socket.on('sequences:queue-changed', listener);

		return function unsubscribe() {
			socket.emit('sequences:unsubscribe', retreatId);
			socket.off('connect', join);
			socket.off('sequences:queue-changed', listener);
			realtimeConnected.value = false;
			subscribedRetreatId = null;
		};
	}

	return {
		sequences,
		queue,
		stats,
		issues,
		issuesTotal,
		detail,
		detailLoading,
		loading,
		error,
		scheduled,
		scheduledTotal,
		scheduledPage,
		scheduledTotalPages,
		scheduledTimezone,
		scheduledLoading,
		realtimeConnected,
		fetchSequences,
		fetchQueue,
		fetchStats,
		loadMoreIssues,
		fetchScheduled,
		fetchDetail,
		clearDetail,
		create,
		update,
		remove,
		run,
		regenerateQueue,
		bulkResolveIssues,
		rescheduleStep,
		dispatch,
		skip,
		retry,
		discard,
		open,
		assign,
		setDoNotContact,
		subscribeRealtime,
	};
});
