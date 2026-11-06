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

export type LetterReviewStatus = 'approved' | 'hidden';

export const useLetterStore = defineStore('letters', () => {
	const letters = ref<Letter[]>([]);
	const counts = ref<LettersInbox['counts']>({ pending: 0, approved: 0, hidden: 0 });
	const mailboxes = ref<LetterMailboxRow[]>([]);
	const loading = ref(false);
	const mailboxesLoading = ref(false);
	const error = ref<string | null>(null);

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
				counts.value = {
					...counts.value,
					[previous]: Math.max(0, counts.value[previous] - 1),
					[status]: counts.value[status] + 1,
				};
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
		mailboxes,
		loading,
		mailboxesLoading,
		error,
		fetchLetters,
		fetchMailboxes,
		activateMailboxes,
		toggleMailbox,
		reviewLetter,
		markPrinted,
		fetchPrintBatch,
	};
});
