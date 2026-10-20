import { defineStore } from 'pinia';
import { ref } from 'vue';
import { useToast } from '@repo/ui';
import { getUserProfile, updateUserProfile } from '@/services/api';
import { apiErrorMessage } from '@/services/apiError';
import { FAVORITE_MENU_ITEMS_LIMIT } from '@repo/types';

// Sidebar menu favorites (specs/menu-favorites): the ordered list of route
// names the user pinned. The API seeds it on first read (top pages by
// telemetry), so `favoriteMenuItems` only arrives null before that first GET.
// The same GET carries `favoriteSuggestions` (most-viewed menu routes not
// pinned yet) for the favorites-header popover.
export const useMenuFavoritesStore = defineStore('menuFavorites', () => {
	const favoriteMenuItems = ref<string[]>([]);
	const suggestions = ref<string[]>([]);
	const loaded = ref(false);
	const { toast } = useToast();

	async function loadFavorites() {
		try {
			const profile = await getUserProfile();
			favoriteMenuItems.value = Array.isArray(profile?.favoriteMenuItems)
				? profile.favoriteMenuItems
				: [];
			suggestions.value = Array.isArray(profile?.favoriteSuggestions)
				? profile.favoriteSuggestions
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
	// discard the pin the user just tapped instead. Suggestions move with the
	// pin: pinning removes the suggestion (it graduated), unpinning offers it
	// back at the top of the popover (undo path) — both rolled back together.
	async function toggleFavorite(routeName: string) {
		const previous = [...favoriteMenuItems.value];
		const previousSuggestions = [...suggestions.value];
		const pinning = !isFavorite(routeName);
		const next = pinning
			? [...previous, routeName].slice(-FAVORITE_MENU_ITEMS_LIMIT)
			: previous.filter((name) => name !== routeName);
		favoriteMenuItems.value = next;
		suggestions.value = pinning
			? previousSuggestions.filter((name) => name !== routeName)
			: [routeName, ...previousSuggestions.filter((name) => name !== routeName)].slice(0, 5);
		try {
			await updateUserProfile({ favoriteMenuItems: next });
		} catch (err: any) {
			favoriteMenuItems.value = previous;
			suggestions.value = previousSuggestions;
			toast({
				title: 'Error',
				description: apiErrorMessage(err, 'Failed to update menu favorites.'),
				variant: 'destructive',
			});
		}
	}

	return {
		favoriteMenuItems,
		suggestions,
		loaded,
		loadFavorites,
		isFavorite,
		toggleFavorite,
	};
});
