import { defineStore } from 'pinia';
import { ref, reactive } from 'vue';
import { useToast } from '@repo/ui';
import type { Participant, CreateParticipant, Tag } from '@repo/types';
import { api, setAttendanceConfirmation as apiSetAttendanceConfirmation, updateParticipantPhones as apiUpdateParticipantPhones, type AttendanceConfirmation, type QuickPhonePatch, type QuickPhoneResult } from '@/services/api';
import { apiErrorMessage } from '@/services/apiError';

export const useParticipantStore = defineStore('participant', () => {
	const participants = ref<Participant[]>([]);
	const tags = ref<Tag[]>([]);
	const loading = ref(false);
	const loadingTags = ref(false);
	const error = ref<string | null>(null);
	const filters = reactive<Record<string, any>>({});
	const columnSelections = reactive<Record<string, string[]>>({});
	const { toast } = useToast();

	async function fetchTags(retreatId: string) {
		if (!retreatId) return;
		try {
			loadingTags.value = true;
			const response = await api.get('/tags', { params: { retreatId } });
			tags.value = response.data;
		} catch (error: any) {
			console.error('Failed to fetch tags:', error);
		} finally {
			loadingTags.value = false;
		}
	}

	// Dedup: avoid concurrent identical fetches
	let _pendingFetch: Promise<void> | null = null;
	let _pendingRetreatId: string | null = null;

	async function fetchParticipants() {
		if (!filters.retreatId) {
			const message = 'Retreat ID is required to fetch participants.';
			error.value = message;
			toast({
				title: 'Error',
				description: message,
				variant: 'destructive',
			});
			return;
		}

		// If there's already an in-flight request for the same retreatId, reuse it
		if (_pendingFetch && _pendingRetreatId === filters.retreatId) {
			return _pendingFetch;
		}

		const retreatId = filters.retreatId;
		_pendingRetreatId = retreatId;

		_pendingFetch = (async () => {
			try {
				loading.value = true;
				error.value = null;
				const paramsWithPayments = { ...filters, includePayments: true };
				const response = await api.get('/participants', { params: paramsWithPayments });
				// Only apply result if retreatId hasn't changed while we were fetching
				if (filters.retreatId === retreatId) {
					participants.value = response.data;
				}
			} catch (err: any) {
				if (err.response?.status === 403) {
					console.log('Insufficient permissions to list participants');
					participants.value = [];
					return;
				}
				const errorMessage =
					apiErrorMessage(err, `Failed to fetch participants`);
				error.value = errorMessage;
				toast({
					title: 'Error',
					description: errorMessage,
					variant: 'destructive',
				});
				throw err;
			} finally {
				loading.value = false;
				_pendingFetch = null;
				_pendingRetreatId = null;
			}
		})();

		return _pendingFetch;
	}

	async function createParticipant(
		data: CreateParticipant,
		recaptchaToken?: string,
		dryRun?: boolean,
	) {
		try {
			loading.value = true;
			const response = await api.post('/participants/new', {
				...data,
				recaptchaToken,
				...(dryRun ? { dryRun: true } : {}),
			});

			if (dryRun) {
				return response.data;
			}

			participants.value.push(response.data);
			toast({
				title: 'Success',
				description: 'Participant created successfully',
			});
		} catch (error: any) {
			toast({
				title: 'Error',
				description:
					apiErrorMessage(error, 'Failed to create Participant'),
				variant: 'destructive',
			});
			throw error;
		} finally {
			loading.value = false;
		}
	}

	/**
	 * Registro público de pareja (retiros retreat_type='couples'): un submit crea a
	 * ambos cónyuges vinculados. Con dryRun devuelve {valid, error?, warnings} sin escribir.
	 */
	async function createCoupleParticipant(
		data: Record<string, unknown>,
		recaptchaToken?: string,
		dryRun?: boolean,
	) {
		try {
			loading.value = true;
			const response = await api.post('/participants/couple/new', {
				...data,
				recaptchaToken,
				...(dryRun ? { dryRun: true } : {}),
			});

			if (dryRun) {
				return response.data;
			}

			if (response.data?.husband) participants.value.push(response.data.husband);
			if (response.data?.wife) participants.value.push(response.data.wife);
			return response.data;
		} catch (error: any) {
			toast({
				title: 'Error',
				description: apiErrorMessage(error, 'Failed to register couple'),
				variant: 'destructive',
			});
			throw error;
		} finally {
			loading.value = false;
		}
	}

	async function importParticipants(retreatId: string, participantsData: any[], skipRefresh = false) {
		try {
			loading.value = true;
			const response = await api.post(`/participants/import/${retreatId}`, {
				participants: participantsData,
			});
			if (!skipRefresh) {
				await fetchParticipants();
			}

			// Return the response data for further processing
			return response.data;
		} catch (error: any) {
			toast({
				title: 'Error',
				description:
					apiErrorMessage(error, 'Failed to import participants'),
				variant: 'destructive',
			});
			throw error;
		} finally {
			loading.value = false;
		}
	}

	async function updateParticipant(id: string, data: Partial<Participant>) {
		if (!id) {
			const error = new Error('Participant ID is missing');
			toast({
				title: 'Error',
				description: 'Participant ID is missing, cannot update.',
				variant: 'destructive',
			});
			throw error;
		}
		try {
			loading.value = true;

			// Log the data being sent for debugging
			//console.log('Updating participant:', id, 'with data:', JSON.stringify(data, null, 2));

			await api.put(`/participants/${id}`, data);

			// Fetch the updated participant data including tags. Pass the
			// active retreat (from the data sent in or from filters) so the
			// overlay loads from the right retreat_participants row when the
			// participant attends multiple retreats.
			const refetchRetreatId =
				(data as any)?.contextRetreatId || filters.retreatId;
			const response = await api.get(`/participants/${id}`, {
				params: refetchRetreatId ? { retreatId: refetchRetreatId } : undefined,
			});

			const index = participants.value.findIndex((p) => p.id === id);
			if (index !== -1) {
				participants.value[index] = response.data;
			}
			toast({
				title: 'Success',
				description: 'Participant updated successfully',
			});
		} catch (error: any) {
			console.error('Error updating participant:', error);
			console.error('Error response:', error.response?.data);
			toast({
				title: 'Error',
				description: apiErrorMessage(
					error,
					error.response?.data?.details || 'Failed to update participant',
				),
				variant: 'destructive',
			});
			throw error;
		} finally {
			loading.value = false;
		}
	}

	async function deleteParticipant(id: string) {
		try {
			loading.value = true;
			await api.delete(`/participants/${id}`);
			participants.value = participants.value.filter((p) => p.id !== id);
			toast({
				title: 'Success',
				description: 'Participant deleted successfully',
			});
		} catch (error: any) {
			toast({
				title: 'Error',
				description:
					apiErrorMessage(error, 'Failed to delete participant'),
				variant: 'destructive',
			});
			throw error;
		} finally {
			loading.value = false;
		}
	}

	// Column selection methods
	function saveColumnSelection(viewName: string, columns: string[]) {
		columnSelections[viewName] = [...columns];
		try {
			localStorage.setItem(`participant-columns-${viewName}`, JSON.stringify(columns));
		} catch (error) {
			console.warn('Failed to save column selection to localStorage:', error);
		}
	}

	function loadColumnSelection(viewName: string): string[] | null {
		// First try to load from localStorage
		try {
			const stored = localStorage.getItem(`participant-columns-${viewName}`);
			if (stored) {
				const parsed = JSON.parse(stored);
				columnSelections[viewName] = parsed;
				return parsed;
			}
		} catch (error) {
			console.warn('Failed to load column selection from localStorage:', error);
		}

		// Fallback to reactive state
		return columnSelections[viewName] || null;
	}

	function getColumnSelection(
		viewName: string,
		defaultColumns: string[],
		validColumns?: string[],
	): string[] {
		const saved = loadColumnSelection(viewName);
		if (Array.isArray(saved) && saved.length > 0) {
			// Drop saved keys that no longer exist in the view's universe (a
			// column removed from the app, or a health column after the user's
			// permission was revoked). Ghost keys can't render, can't be
			// un-toggled in the picker (it only lists valid columns), and made
			// the health-export audit fire for data that wasn't in the file.
			const sanitized = validColumns
				? saved.filter((c) => validColumns.includes(c))
				: saved;
			if (sanitized.length === 0) {
				return defaultColumns;
			}
			// Merge: keep saved order/visibility, append any new default columns
			// that weren't in the saved selection (e.g. added after the user last saved).
			const isValid = validColumns ? (c: string) => validColumns.includes(c) : () => true;
			const missing = defaultColumns.filter((c) => !sanitized.includes(c) && isValid(c));
			if (missing.length > 0 || sanitized.length !== saved.length) {
				const merged = [...sanitized, ...missing];
				columnSelections[viewName] = merged;
				try {
					localStorage.setItem(`participant-columns-${viewName}`, JSON.stringify(merged));
				} catch (error) {
					console.warn('Failed to persist merged column selection:', error);
				}
				return merged;
			}
			return saved;
		}
		return defaultColumns;
	}

	function $reset() {
		participants.value = [];
		tags.value = [];
		loading.value = false;
		loadingTags.value = false;
		error.value = null;
		Object.keys(filters).forEach((key) => delete filters[key]);
	}

	// Confirmación de asistencia: actualización optimista (revierte si la API falla).
	async function setAttendanceConfirmation(participantId: string, status: AttendanceConfirmation) {
		const retreatId = filters.retreatId;
		if (!retreatId) return;
		const idx = participants.value.findIndex((p) => p.id === participantId);
		const prev = idx >= 0 ? (participants.value[idx] as any).attendanceConfirmation : undefined;
		if (idx >= 0) (participants.value[idx] as any).attendanceConfirmation = status;
		try {
			await apiSetAttendanceConfirmation(participantId, retreatId, status);
		} catch (e) {
			if (idx >= 0) (participants.value[idx] as any).attendanceConfirmation = prev;
			toast({ title: 'Error', description: 'No se pudo actualizar la confirmación.', variant: 'destructive' });
			throw e;
		}
	}

	// Quick phone edit (palancas): optimistic with rollback; on success the
	// row keeps the canonical values the server returned (national number,
	// no area code or prefix).
	async function updateParticipantPhones(
		participantId: string,
		phones: QuickPhonePatch,
	): Promise<QuickPhoneResult> {
		const retreatId = filters.retreatId;
		if (!retreatId) {
			// Fail loud: a silent return made the editor close its popover as
			// if the save had succeeded.
			toast({
				title: 'Error',
				description: 'No se pudo determinar el retiro activo para guardar los teléfonos.',
				variant: 'destructive',
			});
			throw new Error('updateParticipantPhones: filters.retreatId is not set');
		}
		const idx = participants.value.findIndex((p) => p.id === participantId);
		const prev =
			idx >= 0
				? {
						cellPhone: (participants.value[idx] as any).cellPhone,
						emergencyContact1CellPhone: (participants.value[idx] as any).emergencyContact1CellPhone,
						emergencyContact2CellPhone: (participants.value[idx] as any).emergencyContact2CellPhone,
					}
				: undefined;
		if (idx >= 0) Object.assign(participants.value[idx], phones);
		try {
			const result = await apiUpdateParticipantPhones(participantId, retreatId, phones);
			// The list may have been refetched while the request was in flight;
			// re-find the row so the canonical values (and the rollback below)
			// land on the right participant, not on whatever now sits at `idx`.
			const finalIdx = participants.value.findIndex((p) => p.id === participantId);
			if (finalIdx >= 0) Object.assign(participants.value[finalIdx], result);
			return result;
		} catch (e) {
			const rollbackIdx = participants.value.findIndex((p) => p.id === participantId);
			if (rollbackIdx >= 0 && prev) Object.assign(participants.value[rollbackIdx], prev);
			toast({ title: 'Error', description: apiErrorMessage(e, 'No se pudieron guardar los teléfonos.'), variant: 'destructive' });
			throw e;
		}
	}

	return {
		participants,
		tags,
		loading,
		loadingTags,
		error,
		filters,
		columnSelections,
		fetchTags,
		fetchParticipants,
		createParticipant,
		createCoupleParticipant,
		importParticipants,
		updateParticipant,
		deleteParticipant,
		setAttendanceConfirmation,
		updateParticipantPhones,
		saveColumnSelection,
		loadColumnSelection,
		getColumnSelection,
		$reset,
	};
});
