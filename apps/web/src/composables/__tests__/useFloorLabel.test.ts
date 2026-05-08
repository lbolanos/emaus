import { describe, it, expect } from 'vitest';
import { floorDisplay, floorDisplayShort } from '../useFloorLabel';

describe('floorDisplay', () => {
	it('returns custom label when defined for the floor', () => {
		expect(floorDisplay(1, { '1': 'Planta Baja', '2': 'Planta Alta' })).toBe('Planta Baja');
		expect(floorDisplay(2, { '1': 'Planta Baja', '2': 'Planta Alta' })).toBe('Planta Alta');
	});

	it('falls back to "Piso N" when label not defined for that floor', () => {
		expect(floorDisplay(3, { '1': 'Planta Baja', '2': 'Planta Alta' })).toBe('Piso 3');
		expect(floorDisplay(5, {})).toBe('Piso 5');
	});

	it('falls back when labels is undefined or null', () => {
		expect(floorDisplay(1, undefined)).toBe('Piso 1');
		expect(floorDisplay(2, null)).toBe('Piso 2');
	});

	it('treats null/undefined floor as 1', () => {
		expect(floorDisplay(null, { '1': 'Planta Baja' })).toBe('Planta Baja');
		expect(floorDisplay(undefined, { '1': 'Planta Baja' })).toBe('Planta Baja');
	});

	it('accepts string keys', () => {
		expect(floorDisplay('2', { '2': 'Planta Alta' })).toBe('Planta Alta');
	});

	it('ignores empty/whitespace-only labels and falls back', () => {
		expect(floorDisplay(1, { '1': '' })).toBe('Piso 1');
		expect(floorDisplay(1, { '1': '   ' })).toBe('Piso 1');
	});
});

describe('floorDisplayShort', () => {
	it('returns custom label when defined', () => {
		expect(floorDisplayShort(1, { '1': 'PB' })).toBe('PB');
	});

	it('returns just the number as fallback (no "Piso" prefix)', () => {
		expect(floorDisplayShort(2, undefined)).toBe('2');
		expect(floorDisplayShort(3, {})).toBe('3');
	});

	it('treats null/undefined floor as 1', () => {
		expect(floorDisplayShort(null, undefined)).toBe('1');
	});
});
