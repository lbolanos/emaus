import { describe, it, expect } from 'vitest';

/**
 * Extracted formatCell logic from ParticipantList.vue for unit testing.
 *
 * BUG (before fix): `return value || 'N/A'`
 *   - 0 is falsy → displayed "N/A" instead of 0
 *   - false is falsy → displayed "N/A" instead of "No"
 *
 * FIX: `return value != null && value !== '' ? value : 'N/A'`
 *   - Only null, undefined, and empty string map to "N/A"
 *   - 0 and false are valid values and pass through
 */
function formatCellValue(value: any): any {
	return value != null && value !== '' ? value : 'N/A';
}

/**
 * The old (buggy) version for comparison in tests
 */
function formatCellValueOld(value: any): any {
	return value || 'N/A';
}

describe('formatCell falsy value handling (ParticipantList fix)', () => {
	describe('values that should display as N/A', () => {
		it('null returns N/A', () => {
			expect(formatCellValue(null)).toBe('N/A');
		});

		it('undefined returns N/A', () => {
			expect(formatCellValue(undefined)).toBe('N/A');
		});

		it('empty string returns N/A', () => {
			expect(formatCellValue('')).toBe('N/A');
		});
	});

	describe('values that should NOT be N/A (the fix)', () => {
		it('0 (number zero) returns 0, not N/A', () => {
			expect(formatCellValue(0)).toBe(0);
		});

		it('false returns false, not N/A', () => {
			expect(formatCellValue(false)).toBe(false);
		});
	});

	describe('the old bug: falsy values incorrectly returned N/A', () => {
		it('OLD: 0 was incorrectly treated as N/A', () => {
			expect(formatCellValueOld(0)).toBe('N/A'); // BUG behavior
		});

		it('OLD: false was incorrectly treated as N/A', () => {
			expect(formatCellValueOld(false)).toBe('N/A'); // BUG behavior
		});

		it('FIX: 0 now correctly passes through', () => {
			expect(formatCellValue(0)).not.toBe('N/A');
		});

		it('FIX: false now correctly passes through', () => {
			expect(formatCellValue(false)).not.toBe('N/A');
		});
	});

	describe('valid values pass through unchanged', () => {
		it('positive number passes through', () => {
			expect(formatCellValue(42)).toBe(42);
		});

		it('string passes through', () => {
			expect(formatCellValue('Juan')).toBe('Juan');
		});

		it('negative number passes through', () => {
			expect(formatCellValue(-1)).toBe(-1);
		});

		it('true passes through', () => {
			expect(formatCellValue(true)).toBe(true);
		});

		it('object passes through', () => {
			const obj = { name: 'test' };
			expect(formatCellValue(obj)).toBe(obj);
		});

		it('array passes through', () => {
			const arr = [1, 2, 3];
			expect(formatCellValue(arr)).toBe(arr);
		});
	});

	describe('id_on_retreat specific scenarios', () => {
		it('id_on_retreat=1 displays as 1', () => {
			expect(formatCellValue(1)).toBe(1);
		});

		it('id_on_retreat=null displays as N/A', () => {
			expect(formatCellValue(null)).toBe('N/A');
		});

		it('id_on_retreat=undefined displays as N/A', () => {
			expect(formatCellValue(undefined)).toBe('N/A');
		});

		it('id_on_retreat=100 displays as 100', () => {
			expect(formatCellValue(100)).toBe(100);
		});
	});
});
