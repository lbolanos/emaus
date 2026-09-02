import type { Component } from 'vue';
import type { FlyerBlockId, FlyerBlockLayout, FlyerSlot } from '@repo/types';

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
