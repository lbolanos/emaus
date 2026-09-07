import type { FlyerImages } from '@repo/types';

export interface FlyerPresetAsset {
	url: string;
	/** i18n-free label: these are file-level names, shown as a caption in the gallery. */
	label: string;
}

/**
 * Artwork bundled with the app, in `apps/web/public/`. Being same-origin, these never
 * hit the CORS problem that html-to-image has with cross-origin images.
 */
export const FLYER_PRESET_ASSETS: Record<keyof FlyerImages, FlyerPresetAsset[]> = {
	bodyBackground: [
		{ url: '/jesus2.png', label: 'Jesús' },
		{ url: '/jesus_bg.png', label: 'Jesús (claro)' },
		{ url: '/poster.png', label: 'Amanecer' },
		{ url: '/footer.png', label: 'Camino' },
	],
	headerBackground: [
		{ url: '/header_bck.png', label: 'Azul' },
		{ url: '/poster.png', label: 'Amanecer' },
		{ url: '/footer.png', label: 'Camino' },
	],
	footerBackground: [
		{ url: '/footer.png', label: 'Camino' },
		{ url: '/header_bck.png', label: 'Azul' },
		{ url: '/poster.png', label: 'Amanecer' },
	],
	logo: [
		{ url: '/oficial_mejorado.png', label: 'Oficial' },
		{ url: '/man_logo.png', label: 'Hombres' },
		{ url: '/woman_logo.png', label: 'Mujeres' },
		{ url: '/crossRoseButtT.png', label: 'Cruz y rosa' },
		{ url: '/logo_oficial.png', label: 'Emaús' },
	],
};

export const FLYER_IMAGE_KEYS = [
	'bodyBackground',
	'headerBackground',
	'footerBackground',
	'logo',
] as const satisfies readonly (keyof FlyerImages)[];
