import { z } from 'zod';

// Flyer schemas shared by every flyer flavour (retreat, community meeting).
//
// This file exists to break an import cycle: index.ts re-exports './community'
// (`export * from './community'`), so community.ts cannot import from './index'.
// Anything the meeting flyer schemas need had to live somewhere both can reach
// without a cycle. Retreat-only schemas (block/text ids, flyerOptionsSchema,
// templates) stay in index.ts; meeting ones live in community.ts.
//
// `flyerBlockLayoutSchema` used to live here as a closed object with the retreat
// block id enum. Each flavour now extends `flyerBlockLayoutBaseSchema` with its
// own id enum, so a stored layout can never mix ids from another flyer.

export const flyerSlotSchema = z.enum(['left', 'right', 'wide']);
export type FlyerSlot = z.infer<typeof flyerSlotSchema>;

/** Position, visibility and cell of a block — everything except which block it is. */
export const flyerBlockLayoutBaseSchema = z.object({
	slot: flyerSlotSchema,
	/** Position within its own slot. */
	order: z.number().int().min(0),
	visible: z.boolean().default(true),
});
export type FlyerBlockLayoutBase = z.infer<typeof flyerBlockLayoutBaseSchema>;

/**
 * A flyer image: an app-bundled preset (`/jesus2.png`), an https URL (S3), or an
 * inline data URI (the fallback when S3 is not configured).
 *
 * SECURITY: these end up in `background-image: url(...)` and `<img :src>`, and the
 * field can be written straight through the flyer options endpoints, skipping the
 * upload endpoint's checks. Restricting the scheme keeps `javascript:` and friends
 * out; the length cap bounds the inline case (512KB binary ≈ 700KB of base64).
 */
const flyerImageUrlSchema = z.preprocess(
	// The client clears an image by sending '', which a formatted .optional() would
	// reject with a 400 — a bug this repo has already paid for more than once.
	(value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
	z
		.string()
		.max(1_000_000, { message: 'La imagen es demasiado grande' })
		.refine(
			(value) =>
				// `(?!\/)` tras la primera barra: sin él, la rama de ruta de la app acepta
				// `//attacker.example/x.png`, porque `/` está dentro de `[\w./-]`. Eso es una
				// URL protocol-relative, y el volante es público y sin autenticación: cada
				// visitante cargaría el recurso desde un origen ajeno, que se queda con su IP
				// y su user-agent. Justo lo que el bloque SECURITY de arriba quiere impedir.
				/^(\/(?!\/)[\w./-]*|https:\/\/[^\s"']+|data:image\/[\w+.-]+;base64,[\w+/=]+)$/.test(
					value,
				),
			{ message: 'La imagen debe ser una ruta de la app, una URL https o una imagen en base64' },
		)
		.optional(),
);

/** Image URLs. Empty/absent means "use the built-in preset". */
export const flyerImagesSchema = z.object({
	bodyBackground: flyerImageUrlSchema,
	headerBackground: flyerImageUrlSchema,
	footerBackground: flyerImageUrlSchema,
	logo: flyerImageUrlSchema,
});
export type FlyerImages = z.infer<typeof flyerImagesSchema>;

const hexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Debe ser un color en formato #rrggbb');

/**
 * How a block is painted. Every field is optional and falls back to the theme, and
 * then to the block's built-in default.
 *
 * An absent `backgroundColor` means no box at all — the text sits straight on the
 * flyer's image, which is the poster look the flyer defaults to. The "light veil" and
 * "dark veil" shortcuts in the editor are just presets writing white/black here, so
 * there is no separate mode to keep in sync.
 */
export const flyerBlockStyleSchema = z.object({
	backgroundColor: hexColorSchema.optional(),
	backgroundOpacity: z.number().int().min(0).max(100).optional(),
	textColor: hexColorSchema.optional(),
	headingColor: hexColorSchema.optional(),
	textShadow: z.boolean().optional(),
	/** Which way the block's own contents line up: its icons, lists and text. */
	textAlign: z.enum(['left', 'center', 'right']).optional(),
});
export type FlyerBlockStyle = z.infer<typeof flyerBlockStyleSchema>;
export type FlyerTextAlign = NonNullable<FlyerBlockStyle['textAlign']>;

/** The same knobs applied to every block, plus the wash over the background image. */
export const flyerThemeSchema = flyerBlockStyleSchema.extend({
	scrim: z.enum(['none', 'dark', 'light']).optional(),
	scrimOpacity: z.number().int().min(0).max(100).optional(),
});
export type FlyerTheme = z.infer<typeof flyerThemeSchema>;

/** Latest block-layout version. Retreat rows may still store v1 (no `blocks`). */
export const FLYER_LAYOUT_VERSION = 2;

/** Upper bound for the flyer's free-text overrides; they are headings and short lines. */
export const FLYER_TEXT_MAX = 2000;
