import type {
	FlyerBlockStyle,
	FlyerFontFamily,
	FlyerFontSlot,
	FlyerSlotSpec,
	FlyerTextAlign,
	FlyerTheme,
} from '@repo/types';
import { FLYER_BLOCK_STYLE_DEFAULTS } from '@/components/flyer/blockRegistry';

/**
 * The CSS each font option maps to. The names are the webfonts the canvas already
 * imports (see RetreatFlyerCanvas.vue), so nothing new gets downloaded. 'inherit'
 * resolves to the CSS keyword: the slot takes the flyer's Roboto back.
 */
export const FLYER_FONT_STACKS: Record<FlyerFontFamily, string> = {
	inherit: 'inherit',
	oswald: `'Oswald', sans-serif`,
	playfair: `'Playfair Display', serif`,
	dancing: `'Dancing Script', cursive`,
	mono: `ui-monospace, SFMono-Regular, Menlo, monospace`,
};

/** The three slots, in the order the editor lists them. */
export const FLYER_FONT_SLOTS: FlyerFontSlot[] = ['title', 'emphasis', 'body'];

/** The fixed CSS custom properties the blocks read. */
interface FlyerBlockCssVarsBase {
	'--fb-bg': string;
	'--fb-text': string;
	'--fb-heading': string;
	'--fb-shadow': string;
	/** Blocks add their padding and radius only when they actually have a box. */
	'--fb-radius': string;
	'--fb-align': FlyerTextAlign;
	/** The same alignment for flex rows: icons and their text, list items, the QR plate. */
	'--fb-justify': string;
	/** And for capped boxes, which line up by margin rather than by justify-content. */
	'--fb-box-ml': string;
	'--fb-box-mr': string;
}

/** Per-slot typography: family stack and size multiplier ('1', '1.1'…). */
type FlyerBlockCssVarsFonts = {
	[K in `--fb-${FlyerFontSlot}-font`]: string;
} & {
	[K in `--fb-${FlyerFontSlot}-scale`]: string;
};

/** Per-slot typography, colour, alignment and shadow: family stack, size
 *  multiplier, text colour, text-align (+ its flex translation), text shadow. */
type FlyerBlockCssVarsSlots = {
	[K in `--fb-${FlyerFontSlot}-font`]: string;
} & {
	[K in `--fb-${FlyerFontSlot}-scale`]: string;
} & {
	[K in `--fb-${FlyerFontSlot}-color`]: string;
} & {
	[K in `--fb-${FlyerFontSlot}-align`]: FlyerTextAlign;
} & {
	[K in `--fb-${FlyerFontSlot}-justify`]: string;
} & {
	[K in `--fb-${FlyerFontSlot}-shadow`]: string;
} & {
	/** The slot's own veil, when it has one. */
	[K in `--fb-${FlyerFontSlot}-bg`]: string;
} & {
	[K in `--fb-${FlyerFontSlot}-pad`]: string;
} & {
	[K in `--fb-${FlyerFontSlot}-radius`]: string;
} & {
	/** Auto margins that line up a width-capped emphasis box (the domain plate). */
	'--fb-emph-ml': string;
	'--fb-emph-mr': string;
};

export type FlyerBlockCssVars = FlyerBlockCssVarsBase & FlyerBlockCssVarsSlots;

export interface ResolvedBlockStyle extends FlyerBlockCssVars {
	/** True when the block paints a box, which is what earns it a radius and shadow. */
	hasBox: boolean;
	/** Mirrored as an attribute: some of the reflow needs a selector, not a value. */
	align: FlyerTextAlign;
	/** The title and body slot alignments, mirrored the same way: the icon row
	 *  follows the title, list rows and capped boxes follow the body. */
	titleAlign: FlyerTextAlign;
	bodyAlign: FlyerTextAlign;
}

const JUSTIFY: Record<FlyerTextAlign, string> = {
	left: 'flex-start',
	center: 'center',
	right: 'flex-end',
};

/** A capped box lines up by which side its auto margin is on. */
const BOX_MARGINS: Record<FlyerTextAlign, [string, string]> = {
	left: ['0', 'auto'],
	center: ['auto', 'auto'],
	right: ['auto', '0'],
};

const TEXT_SHADOW = '0 2px 6px rgba(0, 0, 0, 0.65), 0 1px 2px rgba(0, 0, 0, 0.5)';

/** Which flat field each slot's colour falls back to — the pre-slots look, kept
 *  so every saved flyer renders exactly as it did. */
const SLOT_COLOR_FALLBACK: Record<FlyerFontSlot, 'headingColor' | 'textColor'> = {
	title: 'headingColor',
	emphasis: 'headingColor',
	body: 'textColor',
};

/**
 * One slot's resolved spec. Layers, later winning: the block's default slot, the
 * flat fields the pre-slot editor wrote (colour, alignment, shadow), the theme's
 * slot, the block's own slot. Each layer only replaces the fields it sets.
 */
function resolveSlot(
	slot: FlyerFontSlot,
	blockId: string,
	theme?: FlyerTheme | null,
	blockStyles?: Partial<Record<string, FlyerBlockStyle>> | null,
	defaults: Record<string, FlyerBlockStyle> = FLYER_BLOCK_STYLE_DEFAULTS,
): Required<
	Pick<FlyerSlotSpec, 'family' | 'scale' | 'color' | 'align' | 'shadow' | 'backgroundColor' | 'backgroundOpacity'>
> {
	const flat: FlyerBlockStyle = {
		...defaults[blockId],
		...definedFields(theme as FlyerBlockStyle | undefined),
		...definedFields(blockStyles?.[blockId]),
	};
	// The pre-slots resolution the flat fields produced — identical look, by slot
	const flatHeading = flat.headingColor ?? flat.textColor ?? '#111827';
	const flatBody = flat.textColor ?? '#111827';
	// Layer order, later winning: the flat fields the pre-slot editor wrote are
	// the BASE — a block's designed slot default (the price's near-black, the
	// house name's black) is MORE specific than the generic heading colour and
	// must beat it, or every saved flyer repaints. Then the theme's slot, then
	// the block's own slot override.
	const layers = [
		{
			color: SLOT_COLOR_FALLBACK[slot] === 'headingColor' ? flatHeading : flatBody,
			align: flat.textAlign,
			shadow: flat.textShadow,
		},
		defaults[blockId]?.fonts?.[slot],
		theme?.fonts?.[slot],
		blockStyles?.[blockId]?.fonts?.[slot],
	];
	const spec: FlyerSlotSpec = {};
	for (const layer of layers) {
		if (!layer) continue;
		if (layer.family !== undefined) spec.family = layer.family;
		if (layer.scale !== undefined) spec.scale = layer.scale;
		if (layer.color !== undefined) spec.color = layer.color;
		if (layer.align !== undefined) spec.align = layer.align;
		if (layer.shadow !== undefined) spec.shadow = layer.shadow;
		if (layer.backgroundColor !== undefined) spec.backgroundColor = layer.backgroundColor;
		if (layer.backgroundOpacity !== undefined) spec.backgroundOpacity = layer.backgroundOpacity;
	}
	return {
		family: spec.family ?? 'inherit',
		scale: spec.scale ?? 100,
		color: spec.color ?? flatBody,
		align: spec.align ?? 'left',
		shadow: spec.shadow ?? false,
		// No veil colour means no veil; the opacity default only matters with one
		backgroundColor: spec.backgroundColor ?? 'transparent',
		backgroundOpacity: spec.backgroundOpacity ?? 85,
	};
}

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
 *
 * `defaults` is which flavour's block registry to read the built-in styles from
 * (retreat, meeting); callers that don't pass one keep the retreat behaviour.
 */
export function resolveBlockStyle(
	blockId: string,
	theme?: FlyerTheme | null,
	blockStyles?: Partial<Record<string, FlyerBlockStyle>> | null,
	defaults: Record<string, FlyerBlockStyle> = FLYER_BLOCK_STYLE_DEFAULTS,
): ResolvedBlockStyle {
	const { scrim: _scrim, scrimOpacity: _scrimOpacity, ...themeBlockFields } = theme ?? {};

	const merged: FlyerBlockStyle = {
		...defaults[blockId],
		...definedFields(themeBlockFields as FlyerBlockStyle),
		...definedFields(blockStyles?.[blockId]),
	};

	// Opacity 0 is how "no box" is spelled on top of a layer that does have one: an
	// absent field cannot clear an inherited value, only replace it.
	const opacity = merged.backgroundOpacity ?? 100;
	const hasBox = !!merged.backgroundColor && opacity > 0;
	const align = merged.textAlign ?? 'left';
	const [boxMarginLeft, boxMarginRight] = BOX_MARGINS[align];

	const slotVars = {} as FlyerBlockCssVarsSlots;
	const slotAligns = {} as Pick<ResolvedBlockStyle, 'titleAlign' | 'bodyAlign'>;
	for (const slot of FLYER_FONT_SLOTS) {
		const spec = resolveSlot(slot, blockId, theme, blockStyles, defaults);
		slotVars[`--fb-${slot}-font`] = FLYER_FONT_STACKS[spec.family];
		slotVars[`--fb-${slot}-scale`] = String(spec.scale / 100);
		slotVars[`--fb-${slot}-color`] = spec.color;
		slotVars[`--fb-${slot}-align`] = spec.align;
		slotVars[`--fb-${slot}-justify`] = JUSTIFY[spec.align];
		slotVars[`--fb-${slot}-shadow`] = spec.shadow ? TEXT_SHADOW : 'none';
		// The slot veil: behind this role's lines only. Padding and radius ride
		// along so a bare veil doesn't hug the letters.
		const veilColor = spec.backgroundColor;
		const hasVeil = veilColor !== undefined && veilColor !== 'transparent' && spec.backgroundOpacity > 0;
		slotVars[`--fb-${slot}-bg`] = hasVeil ? toRgba(veilColor, spec.backgroundOpacity) : 'transparent';
		slotVars[`--fb-${slot}-pad`] = hasVeil ? '0.2rem 0.55rem' : '0';
		slotVars[`--fb-${slot}-radius`] = hasVeil ? '0.5rem' : '0';
		if (slot === 'title') slotAligns.titleAlign = spec.align;
		if (slot === 'body') slotAligns.bodyAlign = spec.align;
		if (slot === 'emphasis') {
			[slotVars['--fb-emph-ml'], slotVars['--fb-emph-mr']] = BOX_MARGINS[spec.align];
		}
	}

	return {
		hasBox,
		align,
		...slotAligns,
		'--fb-bg': hasBox ? toRgba(merged.backgroundColor!, opacity) : 'transparent',
		'--fb-text': merged.textColor ?? '#111827',
		'--fb-heading': merged.headingColor ?? merged.textColor ?? '#111827',
		'--fb-shadow': merged.textShadow ? TEXT_SHADOW : 'none',
		'--fb-radius': hasBox ? '1rem' : '0',
		'--fb-align': align,
		'--fb-justify': JUSTIFY[align],
		'--fb-box-ml': boxMarginLeft,
		'--fb-box-mr': boxMarginRight,
		...slotVars,
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

function channelLuminance(channel: number): number {
	const c = channel / 255;
	return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** Relative luminance per WCAG: 0 is black, 1 is white. */
export function luminance(hex: string): number {
	const normalized = hex.replace('#', '');
	const r = parseInt(normalized.slice(0, 2), 16);
	const g = parseInt(normalized.slice(2, 4), 16);
	const b = parseInt(normalized.slice(4, 6), 16);
	return (
		0.2126 * channelLuminance(r) + 0.7152 * channelLuminance(g) + 0.0722 * channelLuminance(b)
	);
}

/** WCAG contrast ratio, from 1 (identical) to 21 (black on white). */
export function contrastRatio(foreground: string, background: string): number {
	const a = luminance(foreground);
	const b = luminance(background);
	const [light, dark] = a > b ? [a, b] : [b, a];
	return (light + 0.05) / (dark + 0.05);
}

export interface ContrastCheck {
	ratio: number;
	/** Below this the text is genuinely hard to read on a printed flyer. */
	isPoor: boolean;
}

/**
 * How the block's text fares against what is actually behind it.
 *
 * With no box we cannot know the artwork's colour under that spot, so we compare
 * against the scrim over a mid-grey: it catches white-on-white and black-on-black,
 * which is what people hit, without pretending to sample the image.
 *
 * Deliberately the body slot only: the designed heading colours (blue on grey in
 * the heuristic's fake background) would flag every stock block the moment the
 * editor opens, crying wolf until nobody reads the warning anymore.
 */
export function checkBlockContrast(
	blockId: string,
	theme?: FlyerTheme | null,
	blockStyles?: Partial<Record<string, FlyerBlockStyle>> | null,
	defaults: Record<string, FlyerBlockStyle> = FLYER_BLOCK_STYLE_DEFAULTS,
): ContrastCheck {
	const resolved = resolveBlockStyle(blockId, theme, blockStyles, defaults);
	const text = resolved['--fb-body-color'];

	// The stock design was drawn over its artwork and reads fine there; the grey
	// baseline below is only meaningful for colours someone actually chose. A
	// stock colour that fails it (the QR's grey-blue) is a false positive that
	// trains people to ignore the warning.
	const stock = resolveBlockStyle(blockId, null, null, defaults);
	if (text.toLowerCase() === stock['--fb-body-color'].toLowerCase()) {
		return { ratio: contrastRatio(text, '#808080'), isPoor: false };
	}

	let background = '#808080';
	if (resolved.hasBox) {
		const merged = { ...defaults[blockId], ...(theme ?? {}), ...(blockStyles?.[blockId] ?? {}) };
		const opacity = (merged.backgroundOpacity ?? 100) / 100;
		// A translucent box still lets the artwork through, so blend towards mid-grey
		background = blendHex(merged.backgroundColor ?? '#ffffff', '#808080', opacity);
	} else if (theme?.scrim === 'dark') {
		background = blendHex('#000000', '#808080', (theme.scrimOpacity ?? 35) / 100);
	} else if (theme?.scrim === 'light') {
		background = blendHex('#ffffff', '#808080', (theme.scrimOpacity ?? 35) / 100);
	}

	const ratio = contrastRatio(text, background);
	return { ratio, isPoor: ratio < 2.5 };
}

/** Mixes two hex colours; `amount` is how much of the first one shows. */
function blendHex(a: string, b: string, amount: number): string {
	const parse = (hex: string) => {
		const n = hex.replace('#', '');
		return [
			parseInt(n.slice(0, 2), 16),
			parseInt(n.slice(2, 4), 16),
			parseInt(n.slice(4, 6), 16),
		];
	};
	const [r1, g1, b1] = parse(a);
	const [r2, g2, b2] = parse(b);
	const mix = (x: number, y: number) => Math.round(x * amount + y * (1 - amount));
	const toHex = (v: number) => v.toString(16).padStart(2, '0');
	return `#${toHex(mix(r1, r2))}${toHex(mix(g1, g2))}${toHex(mix(b1, b2))}`;
}

/**
 * A palette that suits the given artwork: light text over a dark picture, dark text
 * over a pale one, plus the matching scrim. Saves fixing eight blocks by hand after
 * swapping the background image.
 */
export function themeForBackground(averageLuminance: number): FlyerTheme {
	const isDarkImage = averageLuminance < 0.5;
	return isDarkImage
		? {
				textColor: '#ffffff',
				headingColor: '#fde68a',
				textShadow: true,
				scrim: 'dark',
				scrimOpacity: 25,
			}
		: {
				textColor: '#1f2937',
				headingColor: '#1d4ed8',
				textShadow: false,
				scrim: 'light',
				scrimOpacity: 30,
			};
}

/** A one-click look offered in the editor: a palette, plus optional block resets. */
export interface FlyerThemePreset {
	id: string;
	theme: FlyerTheme;
	/**
	 * Flavours whose block defaults paint boxes (the meeting's white cards) can bundle
	 * the box reset the look needs — without it, "text straight on the photo" presets
	 * land their light text on a white card. Absent means the preset is theme-only.
	 */
	blockStyles?: Partial<Record<string, FlyerBlockStyle>>;
}

/** One-click starting points offered in the editor. */
export const FLYER_THEME_PRESETS: FlyerThemePreset[] = [
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
