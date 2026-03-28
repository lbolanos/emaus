import { defineStore } from 'pinia';
import { ref, reactive } from 'vue';
import { useToast } from '@repo/ui';
import type { Participant, CreateParticipant, Tag } from '@repo/types';
import { api } from '@/services/api';

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
					err.response?.data?.message || err.message || `Failed to fetch participants`;
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
					error.response?.data?.message || error.message || 'Failed to create Participant',
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
					error.response?.data?.message || error.message || 'Failed to import participants',
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

			// Fetch the updated participant data including tags
			const response = await api.get(`/participants/${id}`);

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
				description:
					error.response?.data?.message ||
					error.response?.data?.details ||
					error.message ||
					'Failed to update participant',
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
					error.response?.data?.message || error.message || 'Failed to delete participant',
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

	function getColumnSelection(viewName: string, defaultColumns: string[]): string[] {
		const saved = loadColumnSelection(viewName);
		return saved || defaultColumns;
	}

	function $reset() {
		participants.value = [];
		tags.value = [];
		loading.value = false;
		loadingTags.value = false;
		error.value = null;
		Object.keys(filters).forEach((key) => delete filters[key]);
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
		importParticipants,
		updateParticipant,
		deleteParticipant,
		saveColumnSelection,
		loadColumnSelection,
		getColumnSelection,
		$reset,
	};
});
