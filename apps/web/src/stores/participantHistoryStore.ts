import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

export type RoleInRetreat = 'walker' | 'server' | 'leader' | 'coordinator' | 'charlista';

export interface ParticipantHistory {
	id: string;
	userId: string;
	participantId: string | null;
	retreatId: string;
	roleInRetreat: RoleInRetreat;
	isPrimaryRetreat: boolean;
	notes?: string;
	metadata?: Record<string, any>;
	createdAt: string;
	// Relations populated from backend
	retreat?: {
		id: string;
		parish: string;
		startDate: string;
		endDate: string;
		house?: {
			id: string;
			name: string;
		};
	};
	participant?: {
		id: string;
		firstName: string;
		lastName: string;
		type: string;
	};
	user?: {
		id: string;
		displayName: string;
		email: string;
		profile?: {
			bio?: string;
			avatarUrl?: string;
		};
	};
}

export const useParticipantHistoryStore = defineStore('participantHistory', () => {
	const retreatHistory = ref<ParticipantHistory[]>([]);
	const loading = ref(false);
	const error = ref<string | null>(null);

	// Computed properties
	const hasHistory = computed(() => retreatHistory.value.length > 0);

	const primaryRetreat = computed(() => {
		return retreatHistory.value.find((h) => h.isPrimaryRetreat) || null;
	});

	const walkerRetreats = computed(() => {
		return retreatHistory.value.filter((h) => h.roleInRetreat === 'walker');
	});

	const serverRetreats = computed(() => {
		return retreatHistory.value.filter((h) => h.roleInRetreat === 'server');
	});

	const charlistaRetreats = computed(() => {
		return retreatHistory.value.filter((h) => h.roleInRetreat === 'charlista');
	});

	const retreatNames = computed(() => {
		return retreatHistory.value.map((h) => h.retreat?.parish || '').filter(Boolean);
	});

	// Actions
	async function fetchUserHistory() {
		loading.value = true;
		error.value = null;
		try {
			const { getUserRetreatHistory } = await import('@/services/api');
			retreatHistory.value = await getUserRetreatHistory();
		} catch (err: any) {
			error.value = err.message || 'Error al cargar el historial de retiros';
			throw err;
		} finally {
			loading.value = false;
		}
	}

	async function fetchHistoryByRole(role: RoleInRetreat) {
		loading.value = true;
		error.value = null;
		try {
			const { getUserRetreatHistoryByRole } = await import('@/services/api');
			retreatHistory.value = await getUserRetreatHistoryByRole(role);
		} catch (err: any) {
			error.value = err.message || 'Error al cargar el historial de retiros';
			throw err;
		} finally {
			loading.value = false;
		}
	}

	async function fetchHistoryForRetreat(retreatId: string) {
		loading.value = true;
		error.value = null;
		try {
			const { getParticipantsHistoryByRetreat } = await import('@/services/api');
			const participants = await getParticipantsHistoryByRetreat(retreatId);
			// Filter to only include current user's history
			const { useAuthStore } = await import('@/stores/authStore');
			const authStore = useAuthStore();
			retreatHistory.value = participants.filter(
				(p: ParticipantHistory) => p.userId === authStore.user?.id,
			);
		} catch (err: any) {
			error.value = err.message || 'Error al cargar el historial del retiro';
			throw err;
		} finally {
			loading.value = false;
		}
	}

	async function fetchPrimaryRetreat() {
		loading.value = true;
		error.value = null;
		try {
			const { getPrimaryRetreat } = await import('@/services/api');
			const primary = await getPrimaryRetreat();
			if (primary) {
				// Update the primary retreat in the list
				const index = retreatHistory.value.findIndex((h) => h.id === primary.id);
				if (index !== -1) {
					retreatHistory.value[index] = primary;
				}
				return primary;
			}
			return null;
		} catch (err: any) {
			error.value = err.message || 'Error al cargar el retiro primario';
			throw err;
		} finally {
			loading.value = false;
		}
	}

	function clearHistory() {
		retreatHistory.value = [];
		error.value = null;
	}

	return {
		retreatHistory,
		loading,
		error,
		hasHistory,
		primaryRetreat,
		walkerRetreats,
		serverRetreats,
		charlistaRetreats,
		retreatNames,
		fetchUserHistory,
		fetchHistoryByRole,
		fetchHistoryForRetreat,
		fetchPrimaryRetreat,
		clearHistory,
	};
});
