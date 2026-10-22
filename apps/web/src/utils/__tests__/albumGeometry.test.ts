import { describe, it, expect } from 'vitest';
import { boxToPercent, normalizeSearch, searchTagIndexes, clampZoom, labelPlacement } from '../albumGeometry';

describe('albumGeometry', () => {
	it('converts a normalized box to percentages', () => {
		expect(boxToPercent([100, 200, 300, 400])).toEqual({
			left: 20,
			top: 10,
			width: 20,
			height: 20,
		});
	});

	it('clamps out-of-range and inverted boxes', () => {
		const rect = boxToPercent([-50, 900, 1200, 800]);
		expect(rect.top).toBe(0);
		expect(rect.height).toBe(100);
		expect(rect.width).toBe(0);
	});

	it('normalizes accents and case', () => {
		expect(normalizeSearch('  JOSÉ Pérez ')).toBe('jose perez');
	});

	it('searches names ignoring accents; empty query returns all', () => {
		const tags = [
			{ name: 'José Pérez', box: [0, 0, 1, 1] as [number, number, number, number] },
			{ name: 'Ana López', box: [0, 0, 1, 1] as [number, number, number, number] },
		];
		expect(searchTagIndexes(tags, 'jose')).toEqual([0]);
		expect(searchTagIndexes(tags, 'LOP')).toEqual([1]);
		expect(searchTagIndexes(tags, '')).toEqual([0, 1]);
		expect(searchTagIndexes(tags, 'zzz')).toEqual([]);
	});

	it('clamps zoom between 1 and 4', () => {
		expect(clampZoom(0.2)).toBe(1);
		expect(clampZoom(9)).toBe(4);
		expect(clampZoom(1.5)).toBe(1.5);
	});

	it('places labels below near the top and aligned to the nearest side edge', () => {
		expect(labelPlacement([113, 909, 239, 959])).toEqual({ vertical: 'below', horizontal: 'right' });
		expect(labelPlacement([500, 20, 600, 80])).toEqual({ vertical: 'above', horizontal: 'left' });
		expect(labelPlacement([500, 450, 600, 550])).toEqual({ vertical: 'above', horizontal: 'center' });
	});
});
