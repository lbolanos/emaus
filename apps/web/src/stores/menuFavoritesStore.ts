import { defineStore } from 'pinia';
import { h, ref } from 'vue';
import { ToastAction, useToast } from '@repo/ui';
import { getUserProfile, updateUserProfile } from '@/services/api';
import { apiErrorMessage } from '@/services/apiError';
import i18n from '@/i18n';
import { FAVORITE_MENU_ITEMS_LIMIT } from '@repo/types';

const HINT_STORAGE_KEY = 'favorites-hint-dismissed';
// Undo needs to be reachable: the toast outlives the default 5s.
const UNDO_TOAST_MS = 8000;

// Sidebar menu favorites (specs/menu-favorites): the ordered list of route
// names the user pinned. The API seeds it on first read (top pages by
// telemetry), so `favoriteMenuItems` only arrives null before that first GET.
// The same GET carries `favoriteSuggestions` (most-viewed menu routes not
// pinned yet, with their view count) for the favorites-header popover.
export const useMenuFavoritesStore = defineStore('menuFavorites', () => {
	const favoriteMenuItems = ref<string[]>([]);
	const suggestions = ref<Array<{ route: string; views: number }>>([]);
	const loaded = ref(false);
	// One-time discovery hint under the favorites header: shows until the
	// user pins/unpins anything or closes it.
	const hintDismissed = ref(localStorage.getItem(HINT_STORAGE_KEY) === 'true');
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
				description: apiErrorMessage(err, 'No se pudieron cargar los favoritos del menú.'),
				variant: 'destructive',
			});
		}
	}

	function isFavorite(routeName: string): boolean {
		return favoriteMenuItems.value.includes(routeName);
	}

	function dismissHint() {
		if (hintDismissed.value) return;
		hintDismissed.value = true;
		localStorage.setItem(HINT_STORAGE_KEY, 'true');
	}

	// Success toast with an undo action: the dwell menu gives no visual
	// confirmation by itself (the pin moved, but the section may be folded),
	// and undoing a wrong pin beats hunting the row in its real section.
	function announceToggle(routeName: string, pinning: boolean) {
		const t = i18n.global.t;
		const handle = toast({
			title: pinning ? t('sidebar.pinnedToast') : t('sidebar.unpinnedToast'),
			duration: UNDO_TOAST_MS,
			action: h(
				ToastAction,
				{
					// Required prop: its absence throws in ToastAction's setup,
					// which the app-level errorHandler reads as a boot failure
					// and answers with a full page reload (seen in QA).
					altText: t('sidebar.undo'),
					onClick: () => {
						handle.dismiss();
						toggleFavorite(routeName);
					},
				},
				() => t('sidebar.undo'),
			),
		});
	}

	// Optimistic toggle with rollback: the change has to react instantly on
	// mobile, where the PUT round-trip is visible. When the list is full the
	// NEW pin wins and the oldest one drops — slice(0, limit) would silently
	// discard the pin the user just tapped instead. Suggestions move with the
	// pin: pinning removes the suggestion (it graduated), unpinning offers it
	// back at the top of the popover (undo path, without its view count —
	// that comes back on the next GET) — both rolled back together.
	async function toggleFavorite(routeName: string) {
		const previous = [...favoriteMenuItems.value];
		const previousSuggestions = [...suggestions.value];
		const pinning = !isFavorite(routeName);
		const next = pinning
			? [...previous, routeName].slice(-FAVORITE_MENU_ITEMS_LIMIT)
			: previous.filter((name) => name !== routeName);
		favoriteMenuItems.value = next;
		suggestions.value = pinning
			? previousSuggestions.filter((s) => s.route !== routeName)
			: [
					{ route: routeName, views: 0 },
					...previousSuggestions.filter((s) => s.route !== routeName),
				].slice(0, 5);
		// First interaction with the feature: the discovery hint has done its job.
		dismissHint();
		try {
			await updateUserProfile({ favoriteMenuItems: next });
			announceToggle(routeName, pinning);
		} catch (err: any) {
			favoriteMenuItems.value = previous;
			suggestions.value = previousSuggestions;
			toast({
				title: 'Error',
				description: apiErrorMessage(err, 'No se pudo guardar el cambio en favoritos.'),
				variant: 'destructive',
			});
		}
	}

	return {
		favoriteMenuItems,
		suggestions,
		loaded,
		hintDismissed,
		loadFavorites,
		isFavorite,
		dismissHint,
		toggleFavorite,
	};
});
