import { describe, it, expect } from 'vitest';
import { matchNames } from '../nameMatcher';

const people = [
	{ id: '1', name: 'Alberto Ruiz Soto' },
	{ id: '2', name: 'Alberto Gómez Peña' },
	{ id: '3', name: 'Alberta Nuñez' },
	{ id: '4', name: 'Marco Antonio Martínez Solís' },
	{ id: '5', name: 'Marcos Pérez Lara' },
	{ id: '6', name: 'María de la Luz Hernández' },
	{ id: '7', name: 'Enrique Olague Torres' },
	{ id: '8', name: 'Laura Guízar Mena' },
	{ id: '9', name: 'Sofía Ramírez Díaz' },
];

describe('matchNames', () => {
	it('ignores accents and case', () => {
		const r = matchNames('guizar', people);
		expect(r[0]?.id).toBe('8');
	});

	it('first name only returns the homonyms', () => {
		const ids = matchNames('alberto', people).map((m) => m.id);
		expect(ids).toContain('1');
		expect(ids).toContain('2');
		expect(ids).not.toContain('4');
	});

	it('first name plus first surname finds a full name with two surnames', () => {
		const r = matchNames('marco martinez', people);
		expect(r[0]?.id).toBe('4');
	});

	it('drops Spanish particles on both sides', () => {
		expect(matchNames('maria de la luz', people)[0]?.id).toBe('6');
		expect(matchNames('maria luz', people)[0]?.id).toBe('6');
	});

	it('is not sensitive to word order', () => {
		expect(matchNames('martinez marco', people)[0]?.id).toBe('4');
	});

	it('tolerates a near miss from speech and trailing punctuation', () => {
		expect(matchNames('enrique olage', people)[0]?.id).toBe('7');
		expect(matchNames('Enrique Olague.', people)[0]?.id).toBe('7');
	});

	it('returns an empty list for unrelated words', () => {
		expect(matchNames('xyzzy qwerty', people)).toEqual([]);
	});

	it('honors the limit and sorts by score desc', () => {
		const many = Array.from({ length: 6 }, (_, i) => ({ id: String(i), name: `Alberto Surname${i}` }));
		const r = matchNames('alberto', many, { limit: 2 });
		expect(r).toHaveLength(2);
		expect(r[0].score).toBeGreaterThanOrEqual(r[1].score);
	});

	it('returns [] for empty or particle-only input', () => {
		expect(matchNames('', people)).toEqual([]);
		expect(matchNames('   ', people)).toEqual([]);
		expect(matchNames('de la', people)).toEqual([]);
		expect(matchNames('alberto', [])).toEqual([]);
	});
});
