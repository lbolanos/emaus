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
 * How every block looks before the theme or a per-block override touches it: white
 * text with a shadow, warm headings, and no box — a poster, not a set of cards.
 *
 * The same for all eight on purpose. The original design could give each card its own
 * colour because each sat at a fixed spot on the artwork (blue over the pale top, white
 * over the dark bottom). Now that blocks move — and the image is the coordinator's —
 * no per-block colour is right in every position. One legible palette plus the default
 * scrim (see resolveScrim) works wherever a block lands, on any photo.
 */
const POSTER_DEFAULT: FlyerBlockStyle = {
	textColor: '#ffffff',
	headingColor: '#fde68a',
	textShadow: true,
};

export const FLYER_BLOCK_STYLE_DEFAULTS: Record<FlyerBlockId, FlyerBlockStyle> = {
	intro: POSTER_DEFAULT,
	startTime: POSTER_DEFAULT,
	location: POSTER_DEFAULT,
	endTime: POSTER_DEFAULT,
	registrationQr: POSTER_DEFAULT,
	contact: POSTER_DEFAULT,
	payment: POSTER_DEFAULT,
	whatToBring: POSTER_DEFAULT,
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
