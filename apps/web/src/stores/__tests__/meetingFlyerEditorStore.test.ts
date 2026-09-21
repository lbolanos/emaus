import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

const setFlyerOptions = vi.fn();
vi.mock('@/stores/communityStore', () => ({
	useCommunityStore: () => ({ setFlyerOptions }),
}));

import { useMeetingFlyerEditorStore } from '../meetingFlyerEditorStore';
import { MEETING_FLYER_DEFAULT_LAYOUT } from '@/components/flyers/meetingBlockRegistry';

function communityWith(
	flyerOptions: Record<string, any> | null = null,
	extra: Record<string, any> = {},
) {
	return { id: 'community-1', name: 'buen despacho', flyerOptions, ...extra };
}

describe('meetingFlyerEditorStore', () => {
	beforeEach(() => {
		setActivePinia(createPinia());
		setFlyerOptions.mockReset();
		setFlyerOptions.mockResolvedValue(undefined);
	});

	describe('loadFromCommunity', () => {
		it('starts clean, with the default layout for a community without a design', () => {
			const store = useMeetingFlyerEditorStore();
			store.loadFromCommunity(communityWith());

			expect(store.blocks).toEqual(MEETING_FLYER_DEFAULT_LAYOUT);
			expect(store.communityId).toBe('community-1');
			expect(store.isDirty).toBe(false);
		});

		// The community's saved background is part of its identity, not a choice this
		// editor makes — so it seeds the canvas without ever reading as "unsaved work".
		it("seeds the community's background when there is no saved design", () => {
			const store = useMeetingFlyerEditorStore();
			store.loadFromCommunity(communityWith(null, { flyerBackgroundUrl: '/jesus_bg.png' }));

			expect(store.images.bodyBackground).toBe('/jesus_bg.png');
			expect(store.isDirty).toBe(false);
		});

		it('does not reseed once the community has a saved design', () => {
			const store = useMeetingFlyerEditorStore();
			store.loadFromCommunity(
				communityWith(
					{
						layoutVersion: 2,
						blocks: MEETING_FLYER_DEFAULT_LAYOUT,
						images: { bodyBackground: '/poster.png' },
					},
					{ flyerBackgroundUrl: '/jesus_bg.png' },
				),
			);

			expect(store.images.bodyBackground).toBe('/poster.png');
			expect(store.isDirty).toBe(false);
		});

		it('reads the saved text overrides and leaves the rest empty', () => {
			const store = useMeetingFlyerEditorStore();
			store.loadFromCommunity(communityWith({ titleOverride: 'Convivencia' }));

			expect(store.textOverrides.titleOverride).toBe('Convivencia');
			expect(store.textOverrides.kickerOverride).toBe('');
			expect(store.isDirty).toBe(false);
		});
	});

	describe('editing', () => {
		it('marks itself dirty when a block moves, and undirty again after saving', async () => {
			const store = useMeetingFlyerEditorStore();
			store.loadFromCommunity(communityWith());

			store.moveBlock('community', 'right', 0);
			expect(store.isDirty).toBe(true);
			expect(store.blocksBySlot.right[0].id).toBe('community');

			await store.save();
			expect(store.isDirty).toBe(false);
		});

		it('toggles visibility and undoes it', () => {
			const store = useMeetingFlyerEditorStore();
			store.loadFromCommunity(communityWith());

			store.toggleVisibility('locationQr');
			expect(store.blocks.find((b) => b.id === 'locationQr')?.visible).toBe(false);
			expect(store.isDirty).toBe(true);

			store.undo();
			expect(store.blocks.find((b) => b.id === 'locationQr')?.visible).toBe(true);
			expect(store.isDirty).toBe(false);
		});

		it('hides a text and keeps its custom wording', () => {
			const store = useMeetingFlyerEditorStore();
			store.loadFromCommunity(communityWith({ footerTextOverride: '¡Nos vemos!' }));

			store.toggleTextVisibility('footerTextOverride');
			expect(store.hiddenTexts).toEqual(['footerTextOverride']);
			expect(store.textOverrides.footerTextOverride).toBe('¡Nos vemos!');
		});
	});

	describe('theme and per-block style', () => {
		it('applies a preset together with its block-styles package', () => {
			// Regression guard for the shadowing bug: a parameter named `blockStyles`
			// used to swallow the assignment, leaving the ref (what the canvas reads)
			// untouched — silently, for vue-tsc and for every mount-based test.
			const store = useMeetingFlyerEditorStore();
			store.loadFromCommunity(communityWith());

			store.applyThemePreset(
				{ textColor: '#ffffff' },
				{ dateTime: { backgroundColor: '#ffffff', backgroundOpacity: 0 } },
			);

			expect(store.theme).toEqual({ textColor: '#ffffff' });
			expect(store.blockStyles).toEqual({
				dateTime: { backgroundColor: '#ffffff', backgroundOpacity: 0 },
			});
			expect(store.isDirty).toBe(true);
		});

		it('applies a preset without a package as theme-only', () => {
			const store = useMeetingFlyerEditorStore();
			store.loadFromCommunity(
				communityWith({ theme: {}, blockStyles: { description: { textColor: '#000000' } } }),
			);

			store.applyThemePreset({ textColor: '#ffffff' }, null);

			expect(store.theme).toEqual({ textColor: '#ffffff' });
			// No package means "leave my block overrides alone"
			expect(store.blockStyles.description).toEqual({ textColor: '#000000' });
		});

		it('clears theme and block styles together for "Original"', () => {
			const store = useMeetingFlyerEditorStore();
			store.loadFromCommunity(
				communityWith({
					theme: { textColor: '#ffffff' },
					blockStyles: { dateTime: { backgroundOpacity: 0 } },
				}),
			);

			store.clearTheme(true);
			expect(store.theme).toEqual({});
			expect(store.blockStyles).toEqual({});
		});

		it('drops a block override entirely once its last field is cleared', () => {
			const store = useMeetingFlyerEditorStore();
			store.loadFromCommunity(communityWith());

			store.setBlockStyleField('dateTime', 'textColor', '#ffffff');
			expect(store.blockStyles.dateTime).toEqual({ textColor: '#ffffff' });

			store.setBlockStyleField('dateTime', 'textColor', undefined);
			expect(store.blockStyles.dateTime).toBeUndefined();
		});

		it('sends theme and block styles when saving', async () => {
			const store = useMeetingFlyerEditorStore();
			store.loadFromCommunity(communityWith());
			store.setThemeField('textShadow', true);
			store.setBlockStyleField('location', 'backgroundColor', '#000000');
			await store.save();

			const options = setFlyerOptions.mock.calls[0][1];
			expect(options.theme).toEqual({ textShadow: true });
			expect(options.blockStyles).toEqual({ location: { backgroundColor: '#000000' } });
		});
	});

	describe('save', () => {
		it('sends the whole flyerOptions, tagged as v2, to the community', async () => {
			const store = useMeetingFlyerEditorStore();
			store.loadFromCommunity(communityWith());
			store.setTextOverride('titleOverride', 'Adviento');
			await store.save();

			expect(setFlyerOptions).toHaveBeenCalledTimes(1);
			const [communityId, options] = setFlyerOptions.mock.calls[0];
			expect(communityId).toBe('community-1');
			expect(options.layoutVersion).toBe(2);
			expect(options.blocks).toHaveLength(MEETING_FLYER_DEFAULT_LAYOUT.length);
			expect(options.titleOverride).toBe('Adviento');
		});

		// The PUT replaces the whole flyerOptions column, so anything this editor
		// doesn't manage has to be carried through or it is silently lost.
		it('preserves options owned by other screens', async () => {
			const store = useMeetingFlyerEditorStore();
			store.loadFromCommunity(communityWith({ someFutureFlag: 'keep me' }));
			store.toggleVisibility('locationQr');
			await store.save();

			expect(setFlyerOptions.mock.calls[0][1].someFutureFlag).toBe('keep me');
		});

		it('stays dirty when the request fails, so the changes are not lost', async () => {
			setFlyerOptions.mockRejectedValue(new Error('network'));
			const store = useMeetingFlyerEditorStore();
			store.loadFromCommunity(communityWith());
			store.toggleVisibility('locationQr');

			await expect(store.save()).rejects.toThrow('network');
			expect(store.isDirty).toBe(true);
			expect(store.saving).toBe(false);
		});

		it('does nothing without a community loaded', async () => {
			const store = useMeetingFlyerEditorStore();
			await store.save();
			expect(setFlyerOptions).not.toHaveBeenCalled();
		});
	});

	describe('undo', () => {
		it('has nothing to undo on a freshly loaded community', () => {
			const store = useMeetingFlyerEditorStore();
			store.loadFromCommunity(communityWith());

			expect(store.canUndo).toBe(false);
			store.undo(); // must not throw or corrupt anything
			expect(store.blocks).toEqual(MEETING_FLYER_DEFAULT_LAYOUT);
		});

		it('steps back one change at a time', () => {
			const store = useMeetingFlyerEditorStore();
			store.loadFromCommunity(communityWith());

			store.toggleVisibility('description');
			store.setThemeField('textColor', '#ffffff');

			store.undo();
			expect(store.theme.textColor).toBeUndefined();
			expect(store.blocks.find((b) => b.id === 'description')?.visible).toBe(false);

			store.undo();
			expect(store.blocks.find((b) => b.id === 'description')?.visible).toBe(true);
			expect(store.canUndo).toBe(false);
		});

		it('leaves nothing to undo once saved', async () => {
			const store = useMeetingFlyerEditorStore();
			store.loadFromCommunity(communityWith());
			store.toggleVisibility('description');
			expect(store.canUndo).toBe(true);

			await store.save();
			expect(store.canUndo).toBe(false);
		});
	});
});
