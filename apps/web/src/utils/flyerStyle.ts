import type { FlyerBlockId, FlyerBlockStyle, FlyerTheme } from '@repo/types';
import { FLYER_BLOCK_STYLE_DEFAULTS } from '@/components/flyer/blockRegistry';

/** CSS custom properties the blocks read. */
export interface FlyerBlockCssVars {
	'--fb-bg': string;
	'--fb-text': string;
	'--fb-heading': string;
	'--fb-shadow': string;
	/** Blocks add their padding and radius only when they actually have a box. */
	'--fb-radius': string;
}

export interface ResolvedBlockStyle extends FlyerBlockCssVars {
	/** True when the block paints a box, which is what earns it a radius and shadow. */
	hasBox: boolean;
}

const TEXT_SHADOW = '0 2px 6px rgba(0, 0, 0, 0.65), 0 1px 2px rgba(0, 0, 0, 0.5)';

/**
 * Composes a hex colour and a 0-100 opacity into a single rgba() string.
 *
 * Deliberately not CSS `opacity` on the block: that would fade the text and its shadow
 * along with the box, which is the opposite of "readable text over the image".
 */
export function toRgba(hex: string, opacity: number): string {
	const normalized = hex.replace('#', '');
	const r = parseInt(normalized.slice(0, 2), 16);
	const g = parseInt(normalized.slice(2, 4), 16);
	const b = parseInt(normalized.slice(4, 6), 16);
	const alpha = Math.min(100, Math.max(0, opacity)) / 100;
	return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Keeps only the keys that are actually set, so a partial layer doesn't blank the one below. */
function definedFields(style: FlyerBlockStyle | undefined): FlyerBlockStyle {
	if (!style) return {};
	const result: FlyerBlockStyle = {};
	for (const [key, value] of Object.entries(style)) {
		if (value !== undefined && value !== null && value !== '') {
			(result as Record<string, unknown>)[key] = value;
		}
	}
	return result;
}

/**
 * Cascade: the block's built-in default, then the flyer-wide theme, then the block's
 * own override. Each layer only replaces the fields it sets.
 */
export function resolveBlockStyle(
	blockId: FlyerBlockId,
	theme?: FlyerTheme | null,
	blockStyles?: Partial<Record<FlyerBlockId, FlyerBlockStyle>> | null,
): ResolvedBlockStyle {
	const { scrim: _scrim, scrimOpacity: _scrimOpacity, ...themeBlockFields } = theme ?? {};

	const merged: FlyerBlockStyle = {
		...FLYER_BLOCK_STYLE_DEFAULTS[blockId],
		...definedFields(themeBlockFields as FlyerBlockStyle),
		...definedFields(blockStyles?.[blockId]),
	};

	// Opacity 0 is how "no box" is spelled on top of a layer that does have one: an
	// absent field cannot clear an inherited value, only replace it.
	const opacity = merged.backgroundOpacity ?? 100;
	const hasBox = !!merged.backgroundColor && opacity > 0;

	return {
		hasBox,
		'--fb-bg': hasBox ? toRgba(merged.backgroundColor!, opacity) : 'transparent',
		'--fb-text': merged.textColor ?? '#111827',
		'--fb-heading': merged.headingColor ?? merged.textColor ?? '#111827',
		'--fb-shadow': merged.textShadow ? TEXT_SHADOW : 'none',
		'--fb-radius': hasBox ? '1rem' : '0',
	};
}

/**
 * The wash between the background image and the blocks.
 *
 * Off by default, like the original flyer: the block colours assume the artwork as it
 * is. It is the knob to reach for after changing the background image, or after moving
 * a light-text block onto the pale half.
 */
export function resolveScrim(theme?: FlyerTheme | null): string {
	const mode = theme?.scrim ?? 'none';
	if (mode === 'none') return 'transparent';
	const opacity = theme?.scrimOpacity ?? 35;
	return toRgba(mode === 'dark' ? '#000000' : '#ffffff', opacity);
}

/** One-click starting points offered in the editor. */
export const FLYER_THEME_PRESETS: { id: string; theme: FlyerTheme }[] = [
	{
		// Text straight on the photo, white with a strong shadow: the poster look.
		id: 'poster',
		theme: {
			textColor: '#ffffff',
			headingColor: '#fde68a',
			textShadow: true,
			scrim: 'dark',
			scrimOpacity: 40,
		},
	},
	{
		// Dark ink over a lightened photo, for pale or busy artwork.
		id: 'ink',
		theme: {
			textColor: '#1f2937',
			headingColor: '#1d4ed8',
			textShadow: false,
			scrim: 'light',
			scrimOpacity: 45,
		},
	},
	{
		// A veil behind each block instead of over the whole image.
		id: 'veils',
		theme: {
			backgroundColor: '#ffffff',
			backgroundOpacity: 82,
			textColor: '#1f2937',
			headingColor: '#1d4ed8',
			textShadow: false,
			scrim: 'none',
		},
	},
];
