// Tests for getDefaultCharlas() pure function in responsabilityService
// No database dependencies — imports the function directly

import { getDefaultCharlas } from '../../services/responsabilityService';
import { defaultCharlas } from '../../data/serviceTeamData';

describe('getDefaultCharlas()', () => {
	const charlas = getDefaultCharlas();

	test('should return exactly 19 items', () => {
		expect(charlas).toHaveLength(19);
	});

	test('all names should start with "Charla:" or "Texto:"', () => {
		for (const charla of charlas) {
			const startsCorrectly =
				charla.name.startsWith('Charla:') || charla.name.startsWith('Texto:');
			expect(startsCorrectly).toBe(true);
		}
	});

	test('should have 10 "Charla:" entries and 9 "Texto:" entries', () => {
		const charlaCount = charlas.filter((c) => c.name.startsWith('Charla:')).length;
		const textoCount = charlas.filter((c) => c.name.startsWith('Texto:')).length;
		expect(charlaCount).toBe(10);
		expect(textoCount).toBe(9);
	});

	test('anexos should cover A-2-1 through A-2-19', () => {
		const anexos = charlas.map((c) => c.anexo).sort();
		const expected = Array.from({ length: 19 }, (_, i) => `A-2-${i + 1}`).sort();
		expect(anexos).toEqual(expected);
	});

	test('all names should be unique', () => {
		const names = charlas.map((c) => c.name);
		expect(new Set(names).size).toBe(names.length);
	});

	test('should match defaultCharlas from serviceTeamData (same names, anexos, and order)', () => {
		expect(charlas).toHaveLength(defaultCharlas.length);
		for (let i = 0; i < charlas.length; i++) {
			expect(charlas[i].name).toBe(defaultCharlas[i].name);
			expect(charlas[i].anexo).toBe(defaultCharlas[i].anexo);
		}
	});
});
