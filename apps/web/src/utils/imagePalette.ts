/**
 * Dominant colours of the flyer's background artwork, offered as swatches so a
 * coordinator paints the text with the Virgin's teal instead of guessing hexes.
 *
 * The DOM/network/canvas part lives here; the counting itself is a pure
 * function of the pixels so it can be tested without a browser.
 */

const SAMPLE_SIZE = 48;
/** Buckets of 24 levels per channel: coarse enough to merge noise, fine enough
 *  to keep teal and gold apart. */
const BUCKET = 24;

export interface PaletteColour {
	hex: string;
	/** 0–1, how much of the sample fell in this bucket. */
	weight: number;
}

/**
 * Buckets RGBA pixels and ranks the buckets by coverage, keeping the few that
 * together say what the image looks like. Near-duplicate buckets (the same
 * colour after a slightly different draw) collapse into their nearest kept
 * neighbour so the palette isn't four shades of the same grey.
 */
export function dominantColours(data: Uint8ClampedArray, keep = 5): PaletteColour[] {
	const buckets = new Map<string, { count: number; r: number; g: number; b: number }>();

	for (let i = 0; i < data.length; i += 4) {
		if (data[i + 3] < 128) continue;
		const r = data[i];
		const g = data[i + 1];
		const b = data[i + 2];
		const key = `${Math.floor(r / BUCKET)}-${Math.floor(g / BUCKET)}-${Math.floor(b / BUCKET)}`;
		const bucket = buckets.get(key);
		if (bucket) {
			bucket.count += 1;
			bucket.r += r;
			bucket.g += g;
			bucket.b += b;
		} else {
			buckets.set(key, { count: 1, r, g, b });
		}
	}

	const total = [...buckets.values()].reduce((sum, b) => sum + b.count, 0) || 1;
	const ranked = [...buckets.values()]
		.map((b) => ({
			r: Math.round(b.r / b.count),
			g: Math.round(b.g / b.count),
			b: Math.round(b.b / b.count),
			weight: b.count / total,
		}))
		.sort((a, b) => b.weight - a.weight);

	const kept: typeof ranked = [];
	for (const colour of ranked) {
		const duplicate = kept.some((k) => Math.abs(k.r - colour.r) + Math.abs(k.g - colour.g) + Math.abs(k.b - colour.b) < 45);
		if (!duplicate) kept.push(colour);
		if (kept.length >= keep) break;
	}

	const toHex = (v: number) => v.toString(16).padStart(2, '0');
	return kept.map((c) => ({ hex: `#${toHex(c.r)}${toHex(c.g)}${toHex(c.b)}`, weight: c.weight }));
}

/** Reads the artwork and returns its dominant colours, darkest first. */
export async function imagePalette(url: string, keep = 5): Promise<string[]> {
	const image = new Image();
	// Needed for the canvas to stay readable with an S3-hosted background
	image.crossOrigin = 'anonymous';
	image.src = url;

	await new Promise<void>((resolve, reject) => {
		image.onload = () => resolve();
		image.onerror = () => reject(new Error('No se pudo leer la imagen de fondo'));
	});

	const canvas = document.createElement('canvas');
	canvas.width = SAMPLE_SIZE;
	canvas.height = SAMPLE_SIZE;
	const context = canvas.getContext('2d');
	if (!context) throw new Error('Canvas 2D no disponible');

	context.drawImage(image, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
	const { data } = context.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE);

	const palette = dominantColours(data, keep);
	// Darkest first: the first swatch is then a sane text colour over the art
	return palette
		.map((c) => c.hex)
		.sort(
			(a, b) =>
				parseInt(a.slice(1, 3), 16) + parseInt(a.slice(3, 5), 16) + parseInt(a.slice(5, 7), 16) -
				(parseInt(b.slice(1, 3), 16) + parseInt(b.slice(3, 5), 16) + parseInt(b.slice(5, 7), 16)),
		);
}
