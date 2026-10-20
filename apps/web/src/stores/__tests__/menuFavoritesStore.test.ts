import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { FAVORITE_MENU_ITEMS_LIMIT } from '@repo/types';

const { mockGetUserProfile, mockUpdateUserProfile, mockToast } = vi.hoisted(() => ({
	mockGetUserProfile: vi.fn(),
	mockUpdateUserProfile: vi.fn(),
	mockToast: vi.fn(),
}));

vi.mock('@/services/api', () => ({
	getUserProfile: mockGetUserProfile,
	updateUserProfile: mockUpdateUserProfile,
}));

vi.mock('@repo/ui', () => ({
	useToast: () => ({ toast: mockToast }),
}));

import { useMenuFavoritesStore } from '../menuFavoritesStore';

describe('menuFavoritesStore', () => {
	beforeEach(() => {
		setActivePinia(createPinia());
		vi.clearAllMocks();
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

		it('populates suggestions from the profile (empty when absent)', async () => {
			mockGetUserProfile.mockResolvedValueOnce({
				favoriteMenuItems: ['walkers'],
				favoriteSuggestions: ['servers', 'tables'],
			});
			mockGetUserProfile.mockResolvedValueOnce({ favoriteMenuItems: ['walkers'] });

			const store = useMenuFavoritesStore();
			await store.loadFavorites();
			expect(store.suggestions).toEqual(['servers', 'tables']);

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
				favoriteSuggestions: ['servers', 'tables'],
			});
			const store = useMenuFavoritesStore();
			await store.loadFavorites();

			// Pinning graduates the suggestion out of the popover.
			await store.toggleFavorite('servers');
			expect(store.suggestions).toEqual(['tables']);

			// Unpinning offers it back at the top of the popover (undo path).
			await store.toggleFavorite('servers');
			expect(store.suggestions).toEqual(['servers', 'tables']);

			// A failed pin rolls favorites AND suggestions back together (the
			// catch runs before the awaited toggle resolves).
			mockUpdateUserProfile.mockRejectedValue(new Error('boom'));
			await store.toggleFavorite('tables');
			expect(store.favoriteMenuItems).not.toContain('tables');
			expect(store.suggestions).toEqual(['servers', 'tables']);
		});
	});
});
