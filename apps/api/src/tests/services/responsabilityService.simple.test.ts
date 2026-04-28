// Tests for getDefaultCharlas() pure function in responsabilityService
// No database dependencies — imports the function directly

import { getDefaultCharlas } from '../../services/responsabilityService';
import { defaultCharlas } from '../../data/serviceTeamData';

describe('getDefaultCharlas()', () => {
	const charlas = getDefaultCharlas();

	test('should return exactly 21 items', () => {
		expect(charlas).toHaveLength(21);
	});

	test('all names should start with "Charla:" or "Texto:"', () => {
		for (const charla of charlas) {
			const startsCorrectly =
				charla.name.startsWith('Charla:') || charla.name.startsWith('Texto:');
			expect(startsCorrectly).toBe(true);
		}
	});

	test('should have 11 "Charla:" entries and 10 "Texto:" entries', () => {
		const charlaCount = charlas.filter((c) => c.name.startsWith('Charla:')).length;
		const textoCount = charlas.filter((c) => c.name.startsWith('Texto:')).length;
		expect(charlaCount).toBe(11);
		expect(textoCount).toBe(10);
	});

	test('all anexos should be unique and follow A-2-N format', () => {
		const anexos = charlas.map((c) => c.anexo);
		expect(new Set(anexos).size).toBe(anexos.length);
		for (const a of anexos) {
			expect(a).toMatch(/^A-2-\d+$/);
		}
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
