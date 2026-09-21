import type { Component } from 'vue';
import {
	FLYER_BACKGROUND_PRESETS,
	type FlyerBlockStyle,
	type FlyerTheme,
	type MeetingFlyerBlockId,
	type MeetingFlyerBlockLayout,
} from '@repo/types';
import { FLYER_THEME_PRESETS, type FlyerThemePreset } from '@/utils/flyerStyle';

import MeetingFlyerBlockDateTime from './blocks/MeetingFlyerBlockDateTime.vue';
import MeetingFlyerBlockDescription from './blocks/MeetingFlyerBlockDescription.vue';
import MeetingFlyerBlockLocation from './blocks/MeetingFlyerBlockLocation.vue';
import MeetingFlyerBlockLocationQr from './blocks/MeetingFlyerBlockLocationQr.vue';
import MeetingFlyerBlockCommunity from './blocks/MeetingFlyerBlockCommunity.vue';
import { FLYER_PRESET_ASSETS, type FlyerPresetAsset } from '../flyer/flyerPresetAssets';

/** The meeting flavour's counterpart of the retreat's blockRegistry. */
export const MEETING_FLYER_BLOCK_COMPONENTS: Record<MeetingFlyerBlockId, Component> = {
	dateTime: MeetingFlyerBlockDateTime,
	description: MeetingFlyerBlockDescription,
	location: MeetingFlyerBlockLocation,
	locationQr: MeetingFlyerBlockLocationQr,
	community: MeetingFlyerBlockCommunity,
};

/**
 * Default arrangement, mirroring where each card sat in the original DefaultFlyer:
 * date and description reading down the left, the venue and its QR down the right,
 * the community branding across the bottom.
 */
export const MEETING_FLYER_DEFAULT_LAYOUT: MeetingFlyerBlockLayout[] = [
	{ id: 'dateTime', slot: 'left', order: 0, visible: true },
	{ id: 'description', slot: 'left', order: 1, visible: true },
	{ id: 'location', slot: 'right', order: 0, visible: true },
	{ id: 'locationQr', slot: 'right', order: 1, visible: true },
	{ id: 'community', slot: 'wide', order: 0, visible: true },
];

/** Built-in images used when a community has no override. */
export const MEETING_FLYER_PRESET_IMAGES = {
	bodyBackground: '/poster.png',
	headerBackground: '/header_bck.png',
	footerBackground: '/footer.png',
	logo: '/man_logo.png',
} as const;

/**
 * How each block looks before the theme or a per-block override touches it:
 * clear text straight over the artwork, like the legacy Cartel style — the
 * preset backgrounds are dark art meant for light type. The white card is
 * still spelled in at opacity 0 (see resolveBlockStyle): raising the opacity
 * in the panel brings the old translucent card back in one move. The QR
 * block keeps dark text — its white plate is its own contrast.
 */
export const MEETING_FLYER_BLOCK_STYLE_DEFAULTS: Record<MeetingFlyerBlockId, FlyerBlockStyle> = {
	dateTime: {
		backgroundColor: '#ffffff',
		backgroundOpacity: 0,
		textColor: '#ffffff',
		headingColor: '#fde68a',
		textShadow: true,
		textAlign: 'left',
	},
	description: {
		backgroundColor: '#ffffff',
		backgroundOpacity: 0,
		textColor: '#ffffff',
		headingColor: '#fde68a',
		textShadow: true,
		textAlign: 'left',
	},
	location: {
		backgroundColor: '#ffffff',
		backgroundOpacity: 0,
		textColor: '#ffffff',
		headingColor: '#fde68a',
		textShadow: true,
		textAlign: 'left',
	},
	locationQr: { textColor: '#111827', headingColor: '#111827', textShadow: false, textAlign: 'center' },
	community: {
		backgroundColor: '#ffffff',
		backgroundOpacity: 0,
		textColor: '#ffffff',
		headingColor: '#fde68a',
		textShadow: true,
		textAlign: 'center',
	},
};

/** The blocks a look may have to clear; the QR's plate is its own contrast. */
const BOXED_BLOCK_IDS = ['dateTime', 'description', 'location', 'community'] as const;

/** "No box" spelled the way resolveBlockStyle documents: opacity 0 over a layer that has one. */
const BOXLESS: FlyerBlockStyle = { backgroundColor: '#ffffff', backgroundOpacity: 0 };

/**
 * A meeting look is a whole recipe, not just a palette. The flavour's defaults
 * are boxless, but a community may have SAVED a card on a block — a recipe
 * that reads its text straight off the artwork must also clear those saved
 * cards, or "Cartel" (white text) leaves a white card under the date. A
 * recipe that paints its own veil in the theme covers the whole canvas, so
 * it just drops per-block overrides.
 */
export function meetingPresetBlockStyles(theme: FlyerTheme): Partial<Record<string, FlyerBlockStyle>> {
	if (theme.backgroundColor) return {};
	return Object.fromEntries(BOXED_BLOCK_IDS.map((id) => [id, { ...BOXLESS }]));
}

/** The quick looks, retitled for this flavour: each ships the box reset it needs. */
export const MEETING_FLYER_THEME_PRESETS: FlyerThemePreset[] = FLYER_THEME_PRESETS.map((preset) => ({
	...preset,
	blockStyles: meetingPresetBlockStyles(preset.theme),
}));

/**
 * Gallery offered in the editor's Images tab. Backgrounds come from the community
 * background presets (the images coordinators already know); the rest reuse the
 * retreat's bundled artwork.
 */
export const MEETING_FLYER_PRESET_ASSETS: Record<keyof typeof MEETING_FLYER_PRESET_IMAGES, FlyerPresetAsset[]> = {
	bodyBackground: FLYER_BACKGROUND_PRESETS.map((file) => ({ url: `/${file}`, label: file })),
	headerBackground: FLYER_PRESET_ASSETS.headerBackground,
	footerBackground: FLYER_PRESET_ASSETS.footerBackground,
	logo: FLYER_PRESET_ASSETS.logo,
};
