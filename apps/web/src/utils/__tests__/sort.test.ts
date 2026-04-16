import { describe, it, expect } from 'vitest';
import { createLocaleComparator, getNestedProperty } from '../sort';

describe('createLocaleComparator', () => {
	describe('null / undefined / empty handling', () => {
		it('pushes null to the end in ascending order', () => {
			const arr = ['Zeta', null, 'Alfa'];
			arr.sort(createLocaleComparator('es', 'asc'));
			expect(arr).toEqual(['Alfa', 'Zeta', null]);
		});

		it('pushes null to the end in descending order too', () => {
			const arr = ['Zeta', null, 'Alfa'];
			arr.sort(createLocaleComparator('es', 'desc'));
			expect(arr).toEqual(['Zeta', 'Alfa', null]);
		});

		it('pushes undefined to the end', () => {
			const arr = ['Zeta', undefined, 'Alfa'];
			arr.sort(createLocaleComparator('es', 'asc'));
			expect(arr).toEqual(['Alfa', 'Zeta', undefined]);
		});

		it('pushes empty strings to the end', () => {
			const arr = ['Zeta', '', 'Alfa'];
			arr.sort(createLocaleComparator('es', 'asc'));
			expect(arr).toEqual(['Alfa', 'Zeta', '']);
		});

		it('treats null and empty equally (stays grouped at the end)', () => {
			const arr = ['Zeta', null, '', undefined, 'Alfa'];
			arr.sort(createLocaleComparator('es', 'asc'));
			expect(arr[0]).toBe('Alfa');
			expect(arr[1]).toBe('Zeta');
			// Remaining three are empties — order among them doesn't matter
			expect(arr.slice(2).every(v => v === null || v === undefined || v === '')).toBe(true);
		});
	});

	describe('Spanish strings (accent and case insensitive)', () => {
		it('sorts accented names as if unaccented', () => {
			// Álvarez (Á = U+00C1) should sort near Alvarez, not at the very end
			const arr = ['Zamora', 'Álvarez', 'Brenes'];
			arr.sort(createLocaleComparator('es', 'asc'));
			expect(arr).toEqual(['Álvarez', 'Brenes', 'Zamora']);
		});

		it('treats "Álvarez" and "Alvarez" as equivalent (sensitivity: base)', () => {
			const cmp = createLocaleComparator('es', 'asc');
			expect(cmp('Álvarez', 'Alvarez')).toBe(0);
		});

		it('sorts regardless of case', () => {
			// Raw < would put "ESTEBAN" before "acevedo" because 'E'(69) < 'a'(97)
			const arr = ['ESTEBAN', 'acevedo', 'Bolaños'];
			arr.sort(createLocaleComparator('es', 'asc'));
			expect(arr).toEqual(['acevedo', 'Bolaños', 'ESTEBAN']);
		});

		it('handles ñ between n and o', () => {
			const arr = ['nuez', 'ñandú', 'oveja'];
			arr.sort(createLocaleComparator('es', 'asc'));
			expect(arr[0]).toBe('nuez');
			expect(arr[2]).toBe('oveja');
			// ñandú goes between nuez and oveja in Spanish
			expect(arr[1]).toBe('ñandú');
		});

		it('sorts uppercase and lowercase accented characters consistently', () => {
			const cmp = createLocaleComparator('es', 'asc');
			expect(cmp('ávila', 'ÁVILA')).toBe(0);
			expect(cmp('ávila', 'Avila')).toBe(0);
		});

		it('descending reverses the order', () => {
			const arr = ['Alfa', 'Brenes', 'Zamora'];
			arr.sort(createLocaleComparator('es', 'desc'));
			expect(arr).toEqual(['Zamora', 'Brenes', 'Alfa']);
		});
	});

	describe('numeric-aware string sorting', () => {
		it('sorts "Mesa 2" before "Mesa 10" (not lexicographic)', () => {
			const arr = ['Mesa 10', 'Mesa 2', 'Mesa 1'];
			arr.sort(createLocaleComparator('es', 'asc'));
			expect(arr).toEqual(['Mesa 1', 'Mesa 2', 'Mesa 10']);
		});

		it('sorts pure numeric strings correctly', () => {
			const arr = ['10', '2', '100', '1'];
			arr.sort(createLocaleComparator('es', 'asc'));
			expect(arr).toEqual(['1', '2', '10', '100']);
		});
	});

	describe('numbers', () => {
		it('sorts numbers numerically', () => {
			const arr = [10, 2, 100, 1];
			arr.sort(createLocaleComparator('es', 'asc'));
			expect(arr).toEqual([1, 2, 10, 100]);
		});

		it('sorts numbers descending', () => {
			const arr = [10, 2, 100, 1];
			arr.sort(createLocaleComparator('es', 'desc'));
			expect(arr).toEqual([100, 10, 2, 1]);
		});

		it('pushes null among numbers to the end', () => {
			const arr = [10, null, 2, 100, 1];
			arr.sort(createLocaleComparator('es', 'asc'));
			expect(arr).toEqual([1, 2, 10, 100, null]);
		});
	});

	describe('booleans', () => {
		it('sorts false before true ascending', () => {
			const arr = [true, false, true, false];
			arr.sort(createLocaleComparator('es', 'asc'));
			expect(arr).toEqual([false, false, true, true]);
		});

		it('sorts true before false descending', () => {
			const arr = [true, false, true, false];
			arr.sort(createLocaleComparator('es', 'desc'));
			expect(arr).toEqual([true, true, false, false]);
		});

		it('pushes null among booleans to the end', () => {
			const arr = [true, null, false];
			arr.sort(createLocaleComparator('es', 'asc'));
			expect(arr).toEqual([false, true, null]);
		});
	});

	describe('dates as ISO strings', () => {
		it('sorts ISO date strings chronologically', () => {
			const arr = ['2026-04-12', '2026-01-05', '2025-12-31', '2026-04-15'];
			arr.sort(createLocaleComparator('es', 'asc'));
			expect(arr).toEqual(['2025-12-31', '2026-01-05', '2026-04-12', '2026-04-15']);
		});

		it('sorts ISO date strings with nulls at the end', () => {
			const arr = ['2026-04-12', null, '2026-01-05'];
			arr.sort(createLocaleComparator('es', 'asc'));
			expect(arr).toEqual(['2026-01-05', '2026-04-12', null]);
		});
	});

	describe('real participant-like scenarios', () => {
		it('sorts Spanish full names by first name, ignoring case and accents', () => {
			// Drawn from the actual participants table — mixed case (all caps, title
			// case, accented). The raw `<`/`>` comparator used to interleave caps and
			// title-case badly; this test pins the human-expected alphabetical order.
			const arr = [
				'ESTEBAN ALFARO',
				'JORGE EDUARDO AVALOS',
				'José Alfonso Acevedo Avendaño',
				'Ruben Santiago Alvarado',
				'Saúl Bollo Sánchez',
				'Álvaro Núñez',
			];
			arr.sort(createLocaleComparator('es', 'asc'));
			expect(arr).toEqual([
				'Álvaro Núñez',
				'ESTEBAN ALFARO',
				'JORGE EDUARDO AVALOS',
				'José Alfonso Acevedo Avendaño',
				'Ruben Santiago Alvarado',
				'Saúl Bollo Sánchez',
			]);
		});

		it('sorts palancasReceived-like mixed values (text + numbers + empty)', () => {
			const arr = ['1 Carpeta', '', '4', null, '2', '10 Libros'];
			arr.sort(createLocaleComparator('es', 'asc'));
			// Empties at the end; rest sorted with numeric awareness
			expect(arr.slice(-2)).toEqual(['', null]);
			expect(arr.slice(0, 4)).toEqual(['1 Carpeta', '2', '4', '10 Libros']);
		});
	});
});

describe('getNestedProperty', () => {
	it('returns top-level property', () => {
		expect(getNestedProperty({ a: 1 }, 'a')).toBe(1);
	});

	it('resolves dot path', () => {
		expect(getNestedProperty({ tableMesa: { name: 'Mesa 1' } }, 'tableMesa.name')).toBe('Mesa 1');
	});

	it('returns undefined when any segment is missing', () => {
		expect(getNestedProperty({ tableMesa: null }, 'tableMesa.name')).toBeUndefined();
		expect(getNestedProperty({}, 'tableMesa.name')).toBeUndefined();
		expect(getNestedProperty(null, 'a.b')).toBeUndefined();
	});

	it('preserves falsy leaf values (0, "", false)', () => {
		// A known bug in the old `acc && acc[part]` implementation — this one
		// only shortcuts on null/undefined, so { count: 0 } resolves to 0 not undefined.
		expect(getNestedProperty({ count: 0 }, 'count')).toBe(0);
		expect(getNestedProperty({ label: '' }, 'label')).toBe('');
		expect(getNestedProperty({ active: false }, 'active')).toBe(false);
	});
});
