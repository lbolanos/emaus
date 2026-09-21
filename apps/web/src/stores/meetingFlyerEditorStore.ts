import { defineStore } from 'pinia';
import { FLYER_LAYOUT_VERSION, type MeetingFlyerBlockLayout } from '@repo/types';
import { resolveMeetingFlyerLayout } from '@/utils/meetingFlyerLayout';
import { useCommunityStore } from '@/stores/communityStore';
import { createFlyerEditorStoreSetup } from '@/stores/createFlyerEditorStore';

/** Text overrides the meeting editor exposes, in the order they appear on the flyer. */
export const MEETING_FLYER_TEXT_OVERRIDE_KEYS = [
	'kickerOverride',
	'titleOverride',
	'dateLabelOverride',
	'durationLabelOverride',
	'descriptionLabelOverride',
	'locationLabelOverride',
	'qrCaptionOverride',
	'footerTextOverride',
] as const;

export type MeetingFlyerTextOverrideKey = (typeof MEETING_FLYER_TEXT_OVERRIDE_KEYS)[number];

/**
 * The community flavour of the flyer editor: the design is saved once per
 * community (all of its meetings inherit it), so the load entry point takes the
 * community, not the meeting.
 */
const setup = createFlyerEditorStoreSetup<MeetingFlyerBlockLayout>({
	resolveLayout: resolveMeetingFlyerLayout,
	textOverrideKeys: MEETING_FLYER_TEXT_OVERRIDE_KEYS,
	persist: (communityId, options) => {
		const communityStore = useCommunityStore();
		return communityStore.setFlyerOptions(communityId, options);
	},
});

export const useMeetingFlyerEditorStore = defineStore('meetingFlyerEditor', () => {
	const editor = setup();

	function loadFromCommunity(community: any) {
		const raw = community?.flyerOptions;
		// Seed the community's saved background when no design exists yet: it is part
		// of the community's identity, not a choice this editor makes. `images` is one
		// of the editor's own fields, so the seed never leaks into untouchedOptions —
		// and since it happens before the dirty snapshot, opening the editor is clean.
		const hasSavedDesign = raw?.layoutVersion === FLYER_LAYOUT_VERSION && Array.isArray(raw?.blocks);
		const options =
			!hasSavedDesign && community?.flyerBackgroundUrl
				? {
						...(raw ?? {}),
						images: { ...(raw?.images ?? {}), bodyBackground: community.flyerBackgroundUrl },
					}
				: raw;
		editor.loadFrom(community?.id ?? null, options);
	}

	const { entityId, ...rest } = editor;
	return { ...rest, communityId: entityId, loadFromCommunity };
});
