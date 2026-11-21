import { describe, it, expect } from 'vitest';
import { dominantColours } from '../imagePalette';

/** [r, g, b] triples packed as RGBA pixels. */
function pixels(...rgb: [number, number, number][]): Uint8ClampedArray {
	const data = new Uint8ClampedArray(rgb.length * 4);
	rgb.forEach(([r, g, b], i) => {
		data[i * 4] = r;
		data[i * 4 + 1] = g;
		data[i * 4 + 2] = b;
		data[i * 4 + 3] = 255;
	});
	return data;
}

describe('dominantColours', () => {
	it('ranks the buckets by coverage', () => {
		const teal: [number, number, number] = [15, 90, 85];
		const gold: [number, number, number] = [215, 170, 60];
		const cream: [number, number, number] = [245, 240, 225];
		const data = pixels(...Array(10).fill(gold), ...Array(6).fill(cream), ...Array(3).fill(teal));

		const palette = dominantColours(data);
		expect(palette.length).toBe(3);
		expect(palette[0].hex).toMatch(/^#d[0-9a-f]/i); // gold leads
		expect(palette[0].weight).toBeGreaterThan(palette[1].weight);
	});

	it('collapses near-duplicate buckets into one', () => {
		const data = pixels(
			...Array(8).fill([120, 120, 118] as [number, number, number]),
			...Array(8).fill([122, 121, 120] as [number, number, number]),
			[20, 30, 200],
		);

		const palette = dominantColours(data);
		// The two greys are the same colour to the eye: one bucket, plus the blue
		expect(palette.length).toBe(2);
	});

	it('ignores transparent pixels', () => {
		const data = pixels([10, 10, 10]);
		data[3] = 0; // fully transparent
		expect(dominantColours(data)).toEqual([]);
	});
});
