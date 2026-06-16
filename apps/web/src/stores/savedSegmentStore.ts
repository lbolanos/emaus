import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { SavedSegment, SegmentFilters } from '@repo/types';
import {
	getRetreatSegments,
	getCommunitySegments,
	createSavedSegment,
	updateSavedSegment,
	deleteSavedSegment,
} from '@/services/api';

/**
 * Segmentos guardados (combinaciones de filtros con nombre). Scope retiro o
 * comunidad. Usados para reaplicar filtros y como audiencia de envíos.
 */
export const useSavedSegmentStore = defineStore('saved-segment', () => {
	const segments = ref<SavedSegment[]>([]);
	const loading = ref(false);
	const error = ref<string | null>(null);

	const fetchForRetreat = async (retreatId: string) => {
		loading.value = true;
		error.value = null;
		try {
			segments.value = await getRetreatSegments(retreatId);
		} catch (e: any) {
			error.value = e?.message || 'Failed to fetch segments';
		} finally {
			loading.value = false;
		}
	};

	const fetchForCommunity = async (communityId: string) => {
		loading.value = true;
		error.value = null;
		try {
			segments.value = await getCommunitySegments(communityId);
		} catch (e: any) {
			error.value = e?.message || 'Failed to fetch segments';
		} finally {
			loading.value = false;
		}
	};

	const create = async (data: {
		name: string;
		scope: 'retreat' | 'community';
		retreatId?: string;
		communityId?: string;
		filters: SegmentFilters;
	}) => {
		const created = await createSavedSegment(data);
		segments.value.push(created);
		segments.value.sort((a, b) => a.name.localeCompare(b.name));
		return created;
	};

	const update = async (id: string, data: { name?: string; filters?: SegmentFilters }) => {
		const updated = await updateSavedSegment(id, data);
		const idx = segments.value.findIndex((s) => s.id === id);
		if (idx !== -1) segments.value[idx] = updated;
		return updated;
	};

	const remove = async (id: string) => {
		await deleteSavedSegment(id);
		segments.value = segments.value.filter((s) => s.id !== id);
	};

	return { segments, loading, error, fetchForRetreat, fetchForCommunity, create, update, remove };
});
