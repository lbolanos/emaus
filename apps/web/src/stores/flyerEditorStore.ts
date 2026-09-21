import { defineStore } from 'pinia';
import type { FlyerBlockLayout } from '@repo/types';
import { resolveFlyerLayout } from '@/utils/flyerLayout';
import { useRetreatStore } from '@/stores/retreatStore';
import { createFlyerEditorStoreSetup } from '@/stores/createFlyerEditorStore';

/** Text overrides the editor exposes, in the order they appear on the flyer. */
export const FLYER_TEXT_OVERRIDE_KEYS = [
	'catholicRetreatOverride',
	'emausForOverride',
	'weekendOfHopeOverride',
	'hopeOverride',
	'hopeQuoteOverride',
	'encounterDescriptionOverride',
	'dareToLiveItOverride',
	'arrivalTimeNoteOverride',
	'whatToBringOverride',
	'registerOverride',
	'scanToRegisterOverride',
	'comeOverride',
	'limitedCapacityOverride',
	'dontMissItOverride',
	'reservationNoteOverride',
] as const;

export type FlyerTextOverrideKey = (typeof FLYER_TEXT_OVERRIDE_KEYS)[number];

/**
 * The retreat flavour of the flyer editor. All machinery lives in
 * createFlyerEditorStore; this wrapper binds the retreat's layout resolver and
 * persistence and keeps the original public surface (retreatId, loadFromRetreat).
 */
const setup = createFlyerEditorStoreSetup<FlyerBlockLayout>({
	resolveLayout: resolveFlyerLayout,
	textOverrideKeys: FLYER_TEXT_OVERRIDE_KEYS,
	persist: (retreatId, options) => {
		const retreatStore = useRetreatStore();
		return retreatStore.updateRetreat({
			id: retreatId,
			flyer_options: options,
		} as any);
	},
});

export const useFlyerEditorStore = defineStore('flyerEditor', () => {
	const editor = setup();

	function loadFromRetreat(retreat: any) {
		editor.loadFrom(retreat?.id ?? null, retreat?.flyer_options);
	}

	const { entityId, ...rest } = editor;
	return { ...rest, retreatId: entityId, loadFromRetreat };
});
