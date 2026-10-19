import { ref } from 'vue';
import { defineStore } from 'pinia';
import { useToast } from '@repo/ui';
import { getUserProfile, updateUserProfile } from '@/services/api';
import i18n from '@/i18n';

// Sidebar favorite retreats. Persisted server-side on the user profile
// (GET/PUT /social/profile → favoriteRetreatIds) so it follows the user
// across devices; orphan ids (a retreat no longer in retreatStore.retreats)
// are kept here but hidden by the UI.
export const useFavoriteRetreatsStore = defineStore('favoriteRetreats', () => {
	const favoriteIds = ref<string[]>([]);
	const loaded = ref(false);
	const { toast } = useToast();

	async function load() {
		try {
			const profile = await getUserProfile();
			favoriteIds.value = profile?.favoriteRetreatIds ?? [];
		} catch {
			// The sidebar renders fine without favorites; do not toast on a
			// background load.
			favoriteIds.value = [];
		} finally {
			loaded.value = true;
		}
	}

	function isFavorite(retreatId: string): boolean {
		return favoriteIds.value.includes(retreatId);
	}

	async function toggleFavorite(retreatId: string) {
		const previous = [...favoriteIds.value];
		const next = isFavorite(retreatId)
			? previous.filter((id) => id !== retreatId)
			: [...previous, retreatId];
		// Optimistic update; roll back if the server rejects it.
		favoriteIds.value = next;
		try {
			await updateUserProfile({ favoriteRetreatIds: next });
		} catch {
			favoriteIds.value = previous;
			toast({
				title: i18n.global.t('sidebar.favoriteRetreats'),
				description: i18n.global.t('sidebar.favoriteToggleFailed'),
				variant: 'destructive',
			});
		}
	}

	return {
		favoriteIds,
		loaded,
		load,
		isFavorite,
		toggleFavorite,
	};
});
