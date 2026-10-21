import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { FAVORITE_MENU_ITEMS_LIMIT } from '@repo/types';
import i18n from '@/i18n';

const { mockGetUserProfile, mockUpdateUserProfile, mockToast, StubToastAction } = vi.hoisted(() => ({
	mockGetUserProfile: vi.fn(),
	mockUpdateUserProfile: vi.fn(),
	mockToast: vi.fn(),
	StubToastAction: { name: 'ToastAction' },
}));

vi.mock('@/services/api', () => ({
	getUserProfile: mockGetUserProfile,
	updateUserProfile: mockUpdateUserProfile,
}));

vi.mock('@repo/ui', () => ({
	useToast: () => ({ toast: mockToast }),
	ToastAction: StubToastAction,
}));

import { useMenuFavoritesStore } from '../menuFavoritesStore';

describe('menuFavoritesStore', () => {
	beforeEach(() => {
		setActivePinia(createPinia());
		vi.clearAllMocks();
		// The store returns the toast handle so the undo action can dismiss it.
		mockToast.mockReturnValue({ dismiss: vi.fn() });
		localStorage.clear();
		mockGetUserProfile.mockResolvedValue({ favoriteMenuItems: [] });
		mockUpdateUserProfile.mockResolvedValue({});
	});

	describe('loadFavorites', () => {
		it('populates favorites from the profile', async () => {
			mockGetUserProfile.mockResolvedValue({
				favoriteMenuItems: ['retreat-dashboard', 'walkers'],
			});

			const store = useMenuFavoritesStore();
			await store.loadFavorites();

			expect(store.favoriteMenuItems).toEqual(['retreat-dashboard', 'walkers']);
			expect(store.loaded).toBe(true);
		});

		it('falls back to [] when the profile has no array (null = never seeded)', async () => {
			mockGetUserProfile.mockResolvedValue({ favoriteMenuItems: null });

			const store = useMenuFavoritesStore();
			await store.loadFavorites();

			expect(store.favoriteMenuItems).toEqual([]);
			expect(store.loaded).toBe(true);
		});

		it('toasts and stays unloaded when the GET fails', async () => {
			mockGetUserProfile.mockRejectedValue(new Error('boom'));

			const store = useMenuFavoritesStore();
			await store.loadFavorites();

			expect(store.favoriteMenuItems).toEqual([]);
			expect(store.loaded).toBe(false);
			expect(mockToast).toHaveBeenCalledWith(
				expect.objectContaining({ variant: 'destructive' }),
			);
		});

		it('stays quiet without signal: the connectivity chip already says so', async () => {
			mockGetUserProfile.mockRejectedValue(
				Object.assign(new Error('Network Error'), { isAxiosError: true, code: 'ERR_NETWORK' }),
			);

			const store = useMenuFavoritesStore();
			await store.loadFavorites();

			expect(store.loaded).toBe(false);
			expect(mockToast).not.toHaveBeenCalled();
		});

		it('populates suggestions with view counts from the profile (empty when absent)', async () => {
			mockGetUserProfile.mockResolvedValueOnce({
				favoriteMenuItems: ['walkers'],
				favoriteSuggestions: [
					{ route: 'servers', views: 4 },
					{ route: 'tables', views: 0 },
				],
			});
			mockGetUserProfile.mockResolvedValueOnce({ favoriteMenuItems: ['walkers'] });

			const store = useMenuFavoritesStore();
			await store.loadFavorites();
			expect(store.suggestions).toEqual([
				{ route: 'servers', views: 4 },
				{ route: 'tables', views: 0 },
			]);

			await store.loadFavorites();
			expect(store.suggestions).toEqual([]);
		});
	});

	describe('isFavorite', () => {
		it('reflects membership of the loaded list', async () => {
			mockGetUserProfile.mockResolvedValue({ favoriteMenuItems: ['walkers'] });

			const store = useMenuFavoritesStore();
			await store.loadFavorites();

			expect(store.isFavorite('walkers')).toBe(true);
			expect(store.isFavorite('servers')).toBe(false);
		});
	});

	describe('toggleFavorite', () => {
		it('adds a favorite and PUTs the resulting list', async () => {
			mockGetUserProfile.mockResolvedValue({ favoriteMenuItems: ['walkers'] });
			const store = useMenuFavoritesStore();
			await store.loadFavorites();

			await store.toggleFavorite('servers');

			expect(store.favoriteMenuItems).toEqual(['walkers', 'servers']);
			expect(mockUpdateUserProfile).toHaveBeenCalledWith({
				favoriteMenuItems: ['walkers', 'servers'],
			});
		});

		it('removes an existing favorite and PUTs the remaining list', async () => {
			mockGetUserProfile.mockResolvedValue({ favoriteMenuItems: ['walkers', 'servers'] });
			const store = useMenuFavoritesStore();
			await store.loadFavorites();

			await store.toggleFavorite('walkers');

			expect(store.favoriteMenuItems).toEqual(['servers']);
			expect(mockUpdateUserProfile).toHaveBeenCalledWith({
				favoriteMenuItems: ['servers'],
			});
		});

		it('caps the list at FAVORITE_MENU_ITEMS_LIMIT, dropping the oldest pin', async () => {
			const full = Array.from({ length: FAVORITE_MENU_ITEMS_LIMIT }, (_, i) => `route-${i}`);
			mockGetUserProfile.mockResolvedValue({ favoriteMenuItems: full });
			const store = useMenuFavoritesStore();
			await store.loadFavorites();

			await store.toggleFavorite('route-new');

			expect(store.favoriteMenuItems).toHaveLength(FAVORITE_MENU_ITEMS_LIMIT);
			expect(store.favoriteMenuItems).not.toContain('route-0');
			expect(store.favoriteMenuItems).toContain('route-new');
		});

		it('rolls back and toasts when the PUT fails', async () => {
			mockGetUserProfile.mockResolvedValue({ favoriteMenuItems: ['walkers'] });
			const store = useMenuFavoritesStore();
			await store.loadFavorites();
			mockUpdateUserProfile.mockRejectedValue(new Error('boom'));

			await store.toggleFavorite('servers');

			expect(store.favoriteMenuItems).toEqual(['walkers']);
			expect(mockToast).toHaveBeenCalledWith(
				expect.objectContaining({ variant: 'destructive' }),
			);
		});

		it('moves suggestions with the pin (and rolls them back together)', async () => {
			mockGetUserProfile.mockResolvedValue({
				favoriteMenuItems: ['walkers'],
				favoriteSuggestions: [
					{ route: 'servers', views: 4 },
					{ route: 'tables', views: 2 },
				],
			});
			const store = useMenuFavoritesStore();
			await store.loadFavorites();

			// Pinning graduates the suggestion out of the popover.
			await store.toggleFavorite('servers');
			expect(store.suggestions).toEqual([{ route: 'tables', views: 2 }]);

			// Unpinning offers it back at the top of the popover (undo path);
			// its real view count returns with the next GET.
			await store.toggleFavorite('servers');
			expect(store.suggestions).toEqual([
				{ route: 'servers', views: 0 },
				{ route: 'tables', views: 2 },
			]);

			// A failed pin rolls favorites AND suggestions back together (the
			// catch runs before the awaited toggle resolves).
			mockUpdateUserProfile.mockRejectedValue(new Error('boom'));
			await store.toggleFavorite('tables');
			expect(store.favoriteMenuItems).not.toContain('tables');
			expect(store.suggestions).toEqual([
				{ route: 'servers', views: 0 },
				{ route: 'tables', views: 2 },
			]);
		});

		it('toasts success with an undo action that reverts the pin', async () => {
			mockGetUserProfile.mockResolvedValue({ favoriteMenuItems: ['walkers'] });
			const store = useMenuFavoritesStore();
			await store.loadFavorites();

			await store.toggleFavorite('servers');
			expect(store.favoriteMenuItems).toEqual(['walkers', 'servers']);

			expect(mockToast).toHaveBeenCalledTimes(1);
			const call = mockToast.mock.calls[0][0];
			// The title goes through i18n so it follows the active locale.
			expect(call.title).toBe(i18n.global.t('sidebar.pinnedToast'));
			expect(call.duration).toBeGreaterThan(5000); // undo must be reachable
			// The action is ToastAction with an onClick that toggles back.
			expect(call.action.type).toBe(StubToastAction);
			// altText is a required prop of the real ToastAction; leaving it
			// out throws in its setup and the app reloads the whole page.
			expect(call.action.props.altText).toBe(i18n.global.t('sidebar.undo'));

			call.action.props.onClick();
			expect(store.favoriteMenuItems).toEqual(['walkers']);
			expect(mockUpdateUserProfile).toHaveBeenLastCalledWith({
				favoriteMenuItems: ['walkers'],
			});
		});
	});

	describe('discovery hint', () => {
		it('shows the hint until the first toggle, then persists the dismissal', async () => {
			mockGetUserProfile.mockResolvedValue({ favoriteMenuItems: ['walkers'] });
			const store = useMenuFavoritesStore();
			await store.loadFavorites();
			expect(store.hintDismissed).toBe(false);

			await store.toggleFavorite('servers');
			expect(store.hintDismissed).toBe(true);
			expect(localStorage.getItem('favorites-hint-dismissed')).toBe('true');

			// A fresh store (next session) picks the persisted dismissal up.
			const nextSession = useMenuFavoritesStore();
			expect(nextSession.hintDismissed).toBe(true);
		});

		it('dismissHint persists without any toggle', () => {
			const store = useMenuFavoritesStore();
			store.dismissHint();

			expect(store.hintDismissed).toBe(true);
			expect(localStorage.getItem('favorites-hint-dismissed')).toBe('true');
		});
	});
});
