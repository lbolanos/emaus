import { defineStore } from 'pinia';
import { ref } from 'vue';
import {
	lettersApi,
	type LettersInbox,
	type Letter,
	type LetterMailboxRow,
	type LetterPrintBatchEntry,
	type LetterStatus,
} from '../services/api';
import { apiErrorMessage } from '@/services/apiError';
import { getSocket } from '@/services/realtime';

export type LetterReviewStatus = 'approved' | 'hidden';

export const useLetterStore = defineStore('letters', () => {
	const letters = ref<Letter[]>([]);
	const counts = ref<LettersInbox['counts']>({
		pending: 0,
		approved: 0,
		hidden: 0,
		attached: 0,
	});
	const mailboxes = ref<LetterMailboxRow[]>([]);
	const loading = ref(false);
	const mailboxesLoading = ref(false);
	const error = ref<string | null>(null);
	// Badge del sidebar: pendientes del retiro seleccionado (ligero, sin bandeja).
	const pendingCount = ref<number | null>(null);
	let subscribedRetreatId: string | null = null;

	/**
	 * Badge en vivo (patrón de messageSequenceStore): se une a la sala del
	 * retiro y con cada carta recibida incrementa el pendiente — un refetch
	 * después trae lo mismo, así que el evento es idempotente para el estado.
	 */
	function subscribeRealtime(retreatId: string) {
		const socket = getSocket();
		subscribedRetreatId = retreatId;
		const join = () => {
			socket.emit('letters:subscribe', retreatId, (ok: boolean) => {
				if (!ok) return;
			});
		};
		if (socket.connected) join();
		socket.on('connect', join);
		socket.on('letters:received', (payload: { retreatId: string }) => {
			if (payload.retreatId !== retreatId) return;
			if (subscribedRetreatId === retreatId && pendingCount.value != null) {
				pendingCount.value += 1;
			}
		});
	}

	function unsubscribeRealtime(retreatId: string) {
		const socket = getSocket();
		socket.emit('letters:unsubscribe', retreatId);
		subscribedRetreatId = null;
	}

	/** Conteos ligeros para el badge del sidebar (sin bandeja). */
	const fetchCounts = async (retreatId: string) => {
		try {
			const fetched = await lettersApi.getLetterCounts(retreatId);
			counts.value = fetched;
			pendingCount.value = fetched.pending;
		} catch {
			// El badge es best-effort: sin datos queda null (sin badge).
		}
	};

	const fetchLetters = async (
		retreatId: string,
		filters: {
			participantId?: string;
			retreatParticipantId?: string;
			tableId?: string;
			status?: LetterStatus | '';
			q?: string;
		} = {},
	) => {
		loading.value = true;
		error.value = null;
		try {
			const inbox = await lettersApi.listLetters(retreatId, filters);
			letters.value = inbox.letters;
			counts.value = inbox.counts;
		} catch (e: unknown) {
			error.value = apiErrorMessage(e, 'No se pudieron cargar las cartas');
		} finally {
			loading.value = false;
		}
	};

	const fetchMailboxes = async (retreatId: string) => {
		mailboxesLoading.value = true;
		error.value = null;
		try {
			mailboxes.value = await lettersApi.getMailboxes(retreatId);
		} catch (e: unknown) {
			error.value = apiErrorMessage(e, 'No se pudieron cargar los buzones');
		} finally {
			mailboxesLoading.value = false;
		}
	};

	const activateMailboxes = async (retreatId: string) => {
		error.value = null;
		try {
			const result = await lettersApi.activateMailboxes(retreatId);
			await fetchMailboxes(retreatId);
			return result;
		} catch (e: unknown) {
			error.value = apiErrorMessage(e, 'No se pudieron activar los buzones');
			throw e;
		}
	};

	const toggleMailbox = async (
		retreatId: string,
		retreatParticipantId: string,
		mailboxEnabled: boolean,
	) => {
		try {
			const updated = await lettersApi.toggleMailbox(
				retreatId,
				retreatParticipantId,
				mailboxEnabled,
			);
			const row = mailboxes.value.find((m) => m.retreatParticipantId === retreatParticipantId);
			if (row) {
				row.mailboxEnabled = updated.mailboxEnabled;
				// El API devuelve la dirección completa (con el dominio de su config) —
				// no reconstruirla en el cliente con un dominio hardcodeado.
				if (updated.mailboxAddress) {
					row.mailboxCode = updated.mailboxCode;
					row.mailboxAddress = updated.mailboxAddress;
				}
			}
		} catch (e: unknown) {
			error.value = apiErrorMessage(e, 'No se pudo actualizar el buzón');
			throw e;
		}
	};

	const reviewLetter = async (letterId: string, status: LetterReviewStatus) => {
		try {
			const updated = await lettersApi.reviewLetter(letterId, status);
			const index = letters.value.findIndex((l) => l.id === letterId);
			const previous = index >= 0 ? letters.value[index].status : 'pending';
			if (index >= 0) letters.value[index] = { ...letters.value[index], ...updated };
			if (previous !== status) {
				const countsTyped = counts.value as Record<string, number>;
				countsTyped[previous] = Math.max(0, (countsTyped[previous] ?? 0) - 1);
				countsTyped[status] = (countsTyped[status] ?? 0) + 1;
			}
			return updated;
		} catch (e: unknown) {
			error.value = apiErrorMessage(e, 'No se pudo revisar la carta');
			throw e;
		}
	};

	const markPrinted = async (retreatId: string, letterIds: string[], batchId: string) => {
		try {
			return await lettersApi.markPrinted(retreatId, letterIds, batchId);
		} catch (e: unknown) {
			error.value = apiErrorMessage(e, 'No se pudo marcar el lote impreso');
			throw e;
		}
	};

	const fetchPrintBatch = async (
		retreatId: string,
		scope: 'participant' | 'table' | 'retreat',
		opts: { participantIds?: string[]; tableId?: string } = {},
	): Promise<LetterPrintBatchEntry[]> => {
		return lettersApi.getPrintBatch(retreatId, scope, opts);
	};

	return {
		letters,
		counts,
		pendingCount,
		mailboxes,
		loading,
		mailboxesLoading,
		error,
		fetchLetters,
		fetchCounts,
		subscribeRealtime,
		unsubscribeRealtime,
		fetchMailboxes,
		activateMailboxes,
		toggleMailbox,
		reviewLetter,
		markPrinted,
		fetchPrintBatch,
	};
});
