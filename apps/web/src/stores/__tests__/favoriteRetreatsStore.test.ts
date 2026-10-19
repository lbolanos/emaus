import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

// Referenced inside the vi.mock factories below → must be hoisted.
const { getUserProfile, updateUserProfile, toast } = vi.hoisted(() => ({
	getUserProfile: vi.fn(),
	updateUserProfile: vi.fn(),
	toast: vi.fn(),
}));

vi.mock('@/services/api', () => ({
	getUserProfile,
	updateUserProfile,
}));

vi.mock('@repo/ui', () => ({
	useToast: () => ({ toast }),
}));

import { useFavoriteRetreatsStore } from '../favoriteRetreatsStore';

describe('useFavoriteRetreatsStore', () => {
	beforeEach(() => {
		setActivePinia(createPinia());
		vi.clearAllMocks();
	});

	it('load() maps the profile ids', async () => {
		getUserProfile.mockResolvedValue({ favoriteRetreatIds: ['a', 'b'] });

		const store = useFavoriteRetreatsStore();
		await store.load();

		expect(store.favoriteIds).toEqual(['a', 'b']);
		expect(store.loaded).toBe(true);
	});

	it('load() tolerates a profile without the field', async () => {
		getUserProfile.mockResolvedValue({ bio: 'x' });

		const store = useFavoriteRetreatsStore();
		await store.load();

		expect(store.favoriteIds).toEqual([]);
		expect(store.loaded).toBe(true);
	});

	it('load() swallows a failed request and still marks loaded', async () => {
		getUserProfile.mockRejectedValue(new Error('network down'));

		const store = useFavoriteRetreatsStore();
		await expect(store.load()).resolves.toBeUndefined();

		expect(store.favoriteIds).toEqual([]);
		expect(store.loaded).toBe(true);
	});

	it('toggleFavorite() optimistically adds the id and persists the array', async () => {
		getUserProfile.mockResolvedValue({ favoriteRetreatIds: ['a'] });
		updateUserProfile.mockResolvedValue({});

		const store = useFavoriteRetreatsStore();
		await store.load();
		await store.toggleFavorite('b');

		expect(store.favoriteIds).toEqual(['a', 'b']);
		expect(updateUserProfile).toHaveBeenCalledWith({ favoriteRetreatIds: ['a', 'b'] });
	});

	it('toggleFavorite() removes an existing id', async () => {
		getUserProfile.mockResolvedValue({ favoriteRetreatIds: ['a', 'b'] });
		updateUserProfile.mockResolvedValue({});

		const store = useFavoriteRetreatsStore();
		await store.load();
		await store.toggleFavorite('a');

		expect(store.favoriteIds).toEqual(['b']);
		expect(updateUserProfile).toHaveBeenCalledWith({ favoriteRetreatIds: ['b'] });
	});

	it('toggleFavorite() rolls back and toasts when the PUT fails', async () => {
		getUserProfile.mockResolvedValue({ favoriteRetreatIds: ['a'] });
		updateUserProfile.mockRejectedValue(new Error('boom'));

		const store = useFavoriteRetreatsStore();
		await store.load();
		await store.toggleFavorite('b');

		expect(store.favoriteIds).toEqual(['a']);
		expect(toast).toHaveBeenCalledTimes(1);
		expect(toast.mock.calls[0][0]).toMatchObject({ variant: 'destructive' });
	});

	it('isFavorite() reflects membership', async () => {
		getUserProfile.mockResolvedValue({ favoriteRetreatIds: ['a'] });

		const store = useFavoriteRetreatsStore();
		await store.load();

		expect(store.isFavorite('a')).toBe(true);
		expect(store.isFavorite('b')).toBe(false);
	});
});
