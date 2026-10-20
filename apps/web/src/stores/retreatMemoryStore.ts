import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { Retreat } from '@repo/types';
import { getAttendedRetreats, uploadRetreatMemoryPhoto, updateRetreatMemory } from '@/services/api';

export const useRetreatMemoryStore = defineStore('retreatMemory', () => {
	const attendedRetreats = ref<Retreat[]>([]);
	const loading = ref(false);
	const error = ref<string | null>(null);

	// A retreat counts as having memories when the legacy mirrors are set OR it
	// carries any gallery photo — including table group photos (source 'table'),
	// which never touch the memoryPhotoUrl mirror (spec table-memory-photo).
	const hasRetreatMemories = (r: Retreat) =>
		r.memoryPhotoUrl || r.musicPlaylistUrl || (r.memoryPhotos?.length ?? 0) > 0;

	const hasMemories = computed(() => {
		return attendedRetreats.value.some(hasRetreatMemories);
	});

	const retreatsWithMemories = computed(() => {
		return attendedRetreats.value.filter(hasRetreatMemories);
	});

	async function fetchAttendedRetreats() {
		loading.value = true;
		error.value = null;
		try {
			attendedRetreats.value = await getAttendedRetreats();
		} catch (err: any) {
			error.value = err.message || 'Error al cargar los retiros';
			throw err;
		} finally {
			loading.value = false;
		}
	}

	async function uploadPhoto(retreatId: string, photoData: string) {
		loading.value = true;
		error.value = null;
		try {
			const result = await uploadRetreatMemoryPhoto(retreatId, photoData);
			// Update local state
			const retreat = attendedRetreats.value.find((r) => r.id === retreatId);
			if (retreat) {
				retreat.memoryPhotoUrl = result.memoryPhotoUrl;
			}
			return result;
		} catch (err: any) {
			error.value = err.message || 'Error al subir la foto';
			throw err;
		} finally {
			loading.value = false;
		}
	}

	async function updateMusicUrl(retreatId: string, musicPlaylistUrl: string) {
		loading.value = true;
		error.value = null;
		try {
			const result = await updateRetreatMemory(retreatId, { musicPlaylistUrl });
			// Update local state
			const retreat = attendedRetreats.value.find((r) => r.id === retreatId);
			if (retreat) {
				retreat.musicPlaylistUrl = result.musicPlaylistUrl;
			}
			return result;
		} catch (err: any) {
			error.value = err.message || 'Error al actualizar la música';
			throw err;
		} finally {
			loading.value = false;
		}
	}

	function updateRetreatInList(retreat: Retreat) {
		const index = attendedRetreats.value.findIndex((r) => r.id === retreat.id);
		if (index !== -1) {
			attendedRetreats.value[index] = retreat;
		} else {
			attendedRetreats.value.push(retreat);
		}
	}

	return {
		attendedRetreats,
		loading,
		error,
		hasMemories,
		retreatsWithMemories,
		fetchAttendedRetreats,
		uploadPhoto,
		updateMusicUrl,
		updateRetreatInList,
	};
});
