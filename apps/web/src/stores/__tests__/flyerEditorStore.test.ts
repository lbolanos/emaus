import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

const updateRetreat = vi.fn();
vi.mock('@/stores/retreatStore', () => ({
	useRetreatStore: () => ({ updateRetreat }),
}));

import { useFlyerEditorStore } from '../flyerEditorStore';
import { FLYER_DEFAULT_LAYOUT } from '@/components/flyer/blockRegistry';

function retreatWith(flyerOptions: Record<string, any> | undefined = undefined) {
	return { id: 'retreat-1', parish: 'San Judas', flyer_options: flyerOptions };
}

describe('flyerEditorStore', () => {
	beforeEach(() => {
		setActivePinia(createPinia());
		updateRetreat.mockReset();
		updateRetreat.mockResolvedValue(undefined);
	});

	describe('loadFromRetreat', () => {
		it('starts clean, with the default layout for a retreat that has no options', () => {
			const store = useFlyerEditorStore();
			store.loadFromRetreat(retreatWith());

			expect(store.blocks).toEqual(FLYER_DEFAULT_LAYOUT);
			expect(store.isDirty).toBe(false);
		});

		it('reads the existing text overrides and leaves the rest empty', () => {
			const store = useFlyerEditorStore();
			store.loadFromRetreat(retreatWith({ hopeOverride: 'Encuentro' }));

			expect(store.textOverrides.hopeOverride).toBe('Encuentro');
			expect(store.textOverrides.comeOverride).toBe('');
			expect(store.isDirty).toBe(false);
		});

		it('restores a saved v2 layout', () => {
			const store = useFlyerEditorStore();
			store.loadFromRetreat(
				retreatWith({
					layoutVersion: 2,
					blocks: [{ id: 'intro', slot: 'wide', order: 0, visible: false }],
				}),
			);

			const intro = store.blocks.find((b) => b.id === 'intro');
			expect(intro).toMatchObject({ slot: 'wide', visible: false });
		});
	});

	describe('editing', () => {
		it('marks itself dirty when a block moves, and undirty again after saving', async () => {
			const store = useFlyerEditorStore();
			store.loadFromRetreat(retreatWith());

			store.moveBlock('whatToBring', 'left', 0);
			expect(store.isDirty).toBe(true);
			expect(store.blocksBySlot.left[0].id).toBe('whatToBring');

			await store.save();
			expect(store.isDirty).toBe(false);
		});

		it('toggles visibility', () => {
			const store = useFlyerEditorStore();
			store.loadFromRetreat(retreatWith());

			store.toggleVisibility('payment');
			expect(store.blocks.find((b) => b.id === 'payment')?.visible).toBe(false);
			store.toggleVisibility('payment');
			expect(store.blocks.find((b) => b.id === 'payment')?.visible).toBe(true);
		});

		it('treats an empty image url as "use the preset"', () => {
			const store = useFlyerEditorStore();
			store.loadFromRetreat(retreatWith({ images: { logo: 'https://cdn/x.webp' } }));

			expect(store.images.logo).toBe('https://cdn/x.webp');
			store.setImage('logo', '');
			expect(store.images.logo).toBeUndefined();
		});

		it('restores the default layout on request without touching the texts', () => {
			const store = useFlyerEditorStore();
			store.loadFromRetreat(retreatWith({ hopeOverride: 'Encuentro' }));

			store.moveBlock('intro', 'wide', 0);
			store.resetToDefaultLayout();

			expect(store.blocks).toEqual(FLYER_DEFAULT_LAYOUT);
			expect(store.textOverrides.hopeOverride).toBe('Encuentro');
		});
	});

	describe('save', () => {
		it('sends the whole flyer_options, tagged as v2', async () => {
			const store = useFlyerEditorStore();
			store.loadFromRetreat(retreatWith());
			store.setTextOverride('comeOverride', 'Anímate');
			await store.save();

			expect(updateRetreat).toHaveBeenCalledTimes(1);
			const payload = updateRetreat.mock.calls[0][0];
			expect(payload.id).toBe('retreat-1');
			expect(payload.flyer_options.layoutVersion).toBe(2);
			expect(payload.flyer_options.blocks).toHaveLength(FLYER_DEFAULT_LAYOUT.length);
			expect(payload.flyer_options.comeOverride).toBe('Anímate');
		});

		// The API replaces the whole flyer_options column on every PUT, so anything the
		// editor doesn't manage has to be carried through or it is silently lost.
		it('preserves options owned by other screens', async () => {
			const store = useFlyerEditorStore();
			store.loadFromRetreat(
				retreatWith({
					showPickupInfo: false,
					showQrCodesLocation: false,
					someFutureFlag: 'keep me',
				}),
			);
			store.toggleVisibility('payment');
			await store.save();

			const options = updateRetreat.mock.calls[0][0].flyer_options;
			expect(options.showPickupInfo).toBe(false);
			expect(options.showQrCodesLocation).toBe(false);
			expect(options.someFutureFlag).toBe('keep me');
		});

		it('stays dirty when the request fails, so the changes are not lost', async () => {
			updateRetreat.mockRejectedValue(new Error('network'));
			const store = useFlyerEditorStore();
			store.loadFromRetreat(retreatWith());
			store.toggleVisibility('payment');

			await expect(store.save()).rejects.toThrow('network');
			expect(store.isDirty).toBe(true);
			expect(store.saving).toBe(false);
		});

		it('does nothing without a retreat loaded', async () => {
			const store = useFlyerEditorStore();
			await store.save();
			expect(updateRetreat).not.toHaveBeenCalled();
		});
	});

	describe('applyTemplate', () => {
		it('replaces layout, images and texts', () => {
			const store = useFlyerEditorStore();
			store.loadFromRetreat(retreatWith({ hopeOverride: 'Viejo' }));

			store.applyTemplate({
				layoutVersion: 2,
				blocks: [{ id: 'whatToBring', slot: 'left', order: 0, visible: true }],
				images: { bodyBackground: 'https://cdn/new.webp' },
				hopeOverride: 'Nuevo',
			});

			expect(store.blocksBySlot.left[0].id).toBe('whatToBring');
			expect(store.images.bodyBackground).toBe('https://cdn/new.webp');
			expect(store.textOverrides.hopeOverride).toBe('Nuevo');
			expect(store.isDirty).toBe(true);
		});

		it('clears overrides the template does not set', () => {
			const store = useFlyerEditorStore();
			store.loadFromRetreat(retreatWith({ comeOverride: 'Ven ya' }));

			store.applyTemplate({ layoutVersion: 2, blocks: [] });
			expect(store.textOverrides.comeOverride).toBe('');
		});
	});
});
