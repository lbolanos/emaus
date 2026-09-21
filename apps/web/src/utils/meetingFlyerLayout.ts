import type { FlyerImages, MeetingFlyerBlockLayout } from '@repo/types';
import { reconcileStoredBlocks } from '@/utils/flyerLayout';
import { MEETING_FLYER_DEFAULT_LAYOUT } from '@/components/flyers/meetingBlockRegistry';

export interface ResolvedMeetingFlyerLayout {
	blocks: MeetingFlyerBlockLayout[];
	images: FlyerImages;
}

/**
 * Turns whatever is stored in `community.flyerOptions` into a usable block layout.
 *
 * Unlike the retreat resolver there is no v1 branch: this column is new, so the
 * first save is already the current layout version. Stored rows are reconciled
 * against the default arrangement so a block added in a later release shows up
 * instead of silently disappearing, and unknown ids are dropped.
 */
export function resolveMeetingFlyerLayout(
	raw: Record<string, any> | null | undefined,
): ResolvedMeetingFlyerLayout {
	return {
		blocks: reconcileStoredBlocks<MeetingFlyerBlockLayout>(raw?.blocks, MEETING_FLYER_DEFAULT_LAYOUT),
		images: {
			bodyBackground: raw?.images?.bodyBackground || undefined,
			headerBackground: raw?.images?.headerBackground || undefined,
			footerBackground: raw?.images?.footerBackground || undefined,
			logo: raw?.images?.logo || undefined,
		},
	};
}
