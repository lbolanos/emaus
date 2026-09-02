import type { Component } from 'vue';
import type { FlyerBlockId, FlyerBlockLayout, FlyerBlockStyle, FlyerSlot } from '@repo/types';

import FlyerBlockIntro from './blocks/FlyerBlockIntro.vue';
import FlyerBlockStartTime from './blocks/FlyerBlockStartTime.vue';
import FlyerBlockEndTime from './blocks/FlyerBlockEndTime.vue';
import FlyerBlockLocation from './blocks/FlyerBlockLocation.vue';
import FlyerBlockContact from './blocks/FlyerBlockContact.vue';
import FlyerBlockPayment from './blocks/FlyerBlockPayment.vue';
import FlyerBlockWhatToBring from './blocks/FlyerBlockWhatToBring.vue';
import FlyerBlockRegistrationQr from './blocks/FlyerBlockRegistrationQr.vue';

export const FLYER_BLOCK_COMPONENTS: Record<FlyerBlockId, Component> = {
	intro: FlyerBlockIntro,
	startTime: FlyerBlockStartTime,
	endTime: FlyerBlockEndTime,
	location: FlyerBlockLocation,
	contact: FlyerBlockContact,
	payment: FlyerBlockPayment,
	whatToBring: FlyerBlockWhatToBring,
	registrationQr: FlyerBlockRegistrationQr,
};

export const FLYER_SLOTS: FlyerSlot[] = ['left', 'right', 'wide'];

/**
 * Default arrangement, mirroring where each card sat in the original
 * absolutely-positioned layout so existing retreats keep their look.
 */
export const FLYER_DEFAULT_LAYOUT: FlyerBlockLayout[] = [
	{ id: 'intro', slot: 'left', order: 0, visible: true },
	{ id: 'startTime', slot: 'left', order: 1, visible: true },
	{ id: 'location', slot: 'left', order: 2, visible: true },
	{ id: 'endTime', slot: 'left', order: 3, visible: true },
	{ id: 'registrationQr', slot: 'right', order: 0, visible: true },
	{ id: 'contact', slot: 'right', order: 1, visible: true },
	{ id: 'payment', slot: 'right', order: 2, visible: true },
	{ id: 'whatToBring', slot: 'wide', order: 0, visible: true },
];

/** Built-in images used when a retreat has no override. */
export const FLYER_PRESET_IMAGES = {
	bodyBackground: '/jesus2.png',
	headerBackground: '/header_bck.png',
	footerBackground: '/footer.png',
} as const;

/**
 * How each block looks before the theme or a per-block override touches it: the colours
 * of the original flyer, block by block — blue for times and cost, green for the venue,
 * light text where the artwork turns dark at the bottom.
 *
 * They assume each block's default position on the default artwork, which is where the
 * original design put them. Move a light-text block up onto the pale half, or swap the
 * background image, and it will need its own colour — that is what the theme and the
 * per-block overrides in the editor are for.
 */
export const FLYER_BLOCK_STYLE_DEFAULTS: Record<FlyerBlockId, FlyerBlockStyle> = {
	intro: { textColor: '#111827', headingColor: '#1e40af', textShadow: false },
	startTime: { textColor: '#111827', headingColor: '#1d4ed8', textShadow: false },
	location: { textColor: '#000000', headingColor: '#15803d', textShadow: false },
	// Sits over the dark lower half: white heading, amber date, as in the original
	endTime: { textColor: '#ffffff', headingColor: '#ffffff', textShadow: true },
	registrationQr: { textColor: '#4b5563', headingColor: '#1d4ed8', textShadow: false },
	contact: { textColor: '#111827', headingColor: '#374151', textShadow: false },
	// The only one with a box by default, as in the original: its small print falls on
	// the brightest part of the artwork and needs something behind it
	payment: {
		backgroundColor: '#ffffff',
		backgroundOpacity: 65,
		textColor: '#374151',
		headingColor: '#1d4ed8',
		textShadow: false,
	},
	whatToBring: { textColor: '#f3f4f6', headingColor: '#ffffff', textShadow: true },
};

/**
 * Parts that deliberately ignore the theme, because their colour carries meaning
 * rather than decoration. Documented here so nobody "fixes" them by mistake:
 *
 * 1. The white plates behind both QR codes — scannability.
 * 2. The price pill in `payment` — the single most important figure on the flyer keeps
 *    guaranteed contrast even when its block has no box.
 * 3. The amber notice in `endTime` ("importante que tu familia asista") — a warning,
 *    not decoration; blending it into the palette loses its job.
 * 4. The green/blue chips in `contact` — green means phone and blue means email, which
 *    is the only cue before actually reading the value.
 */
export const FLYER_FIXED_COLOUR_PARTS = [
	'qr-plate',
	'payment-price-pill',
	'endtime-notice',
	'contact-channel-chips',
] as const;
