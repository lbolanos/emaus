import { defineStore } from 'pinia';
import { ref } from 'vue';
import { useToast } from '@repo/ui';
import { getUserProfile, updateUserProfile } from '@/services/api';
import { apiErrorMessage } from '@/services/apiError';
import { FAVORITE_MENU_ITEMS_LIMIT } from '@repo/types';

// Sidebar menu favorites (specs/menu-favorites): the ordered list of route
// names the user pinned. The API seeds it on first read (top pages by
// telemetry), so `favoriteMenuItems` only arrives null before that first GET.
export const useMenuFavoritesStore = defineStore('menuFavorites', () => {
	const favoriteMenuItems = ref<string[]>([]);
	const loaded = ref(false);
	const { toast } = useToast();

	async function loadFavorites() {
		try {
			const profile = await getUserProfile();
			favoriteMenuItems.value = Array.isArray(profile?.favoriteMenuItems)
				? profile.favoriteMenuItems
				: [];
			loaded.value = true;
		} catch (err: any) {
			toast({
				title: 'Error',
				description: apiErrorMessage(err, 'Failed to load menu favorites.'),
				variant: 'destructive',
			});
		}
	}

	function isFavorite(routeName: string): boolean {
		return favoriteMenuItems.value.includes(routeName);
	}

	// Optimistic toggle with rollback: the star has to react instantly on
	// mobile, where the PUT round-trip is visible. When the list is full the
	// NEW pin wins and the oldest one drops — slice(0, limit) would silently
	// discard the pin the user just tapped instead.
	async function toggleFavorite(routeName: string) {
		const previous = [...favoriteMenuItems.value];
		const next = isFavorite(routeName)
			? previous.filter((name) => name !== routeName)
			: [...previous, routeName].slice(-FAVORITE_MENU_ITEMS_LIMIT);
		favoriteMenuItems.value = next;
		try {
			await updateUserProfile({ favoriteMenuItems: next });
		} catch (err: any) {
			favoriteMenuItems.value = previous;
			toast({
				title: 'Error',
				description: apiErrorMessage(err, 'Failed to update menu favorites.'),
				variant: 'destructive',
			});
		}
	}

	return {
		favoriteMenuItems,
		loaded,
		loadFavorites,
		isFavorite,
		toggleFavorite,
	};
});
