// Tests for service team seeding data, charla data, and responsibility descriptions
// No database dependencies — imports data arrays directly

import { defaultServiceTeams } from '../../data/dynamicsTemplates';
import { defaultCharlas, moderadorDescription, diarioDescription } from '../../data/serviceTeamData';
import { charlaDocumentation, responsibilityDocumentation } from '../../data/charlaDocumentation';

describe('Service Team Data Integrity', () => {
	describe('Default Service Teams (dynamicsTemplates)', () => {
		test('should have exactly 24 service teams', () => {
			expect(defaultServiceTeams).toHaveLength(24);
		});

		test('should have unique names', () => {
			const names = defaultServiceTeams.map((t) => t.name);
			expect(new Set(names).size).toBe(names.length);
		});

		test('should have unique priorities from 1 to 24', () => {
			const priorities = defaultServiceTeams.map((t) => t.priority).sort((a, b) => a - b);
			expect(priorities).toEqual(Array.from({ length: 24 }, (_, i) => i + 1));
		});

		test('should all have non-empty instructions', () => {
			for (const team of defaultServiceTeams) {
				expect(team.instructions).toBeTruthy();
				expect(team.instructions!.length).toBeGreaterThan(50);
			}
		});

		test('should all have non-empty descriptions', () => {
			for (const team of defaultServiceTeams) {
				expect(team.description).toBeTruthy();
				expect(team.description.length).toBeGreaterThan(10);
			}
		});

		test('should use valid teamType values', () => {
			const validTypes = [
				'cocina',
				'musica',
				'palancas',
				'logistica',
				'limpieza',
				'oracion',
				'liturgia',
				'bienvenida',
				'salon',
				'cuartos',
				'transporte',
				'snacks',
				'dinamica',
				'otro',
			];
			for (const team of defaultServiceTeams) {
				expect(validTypes).toContain(team.teamType);
			}
		});

		test('should have expected team names', () => {
			const names = defaultServiceTeams.map((t) => t.name);
			expect(names).toContain('Cocina / Comedor');
			expect(names).toContain('Música y Alabanza');
			expect(names).toContain('Palancas');
			expect(names).toContain('Logística');
			expect(names).toContain('Limpieza y Orden');
			expect(names).toContain('Intercesión / Oración');
			expect(names).toContain('Liturgia');
			expect(names).toContain('Bienvenida / Registro');
			expect(names).toContain('Salón');
			expect(names).toContain('Cuartos');
			expect(names).toContain('Transporte');
			expect(names).toContain('Snacks');
			expect(names).toContain('Líder de Mesa (Primero de Mesa)');
			expect(names).toContain('Colíder de Mesa (Segundo de Mesa)');
		});
	});

	describe('Default Charlas (19 total)', () => {
		test('should have exactly 19 charlas', () => {
			expect(defaultCharlas).toHaveLength(19);
		});

		test('should have unique names', () => {
			const names = defaultCharlas.map((c) => c.name);
			expect(new Set(names).size).toBe(names.length);
		});

		test('should have correct anexo references A-2-1 through A-2-19', () => {
			const anexos = defaultCharlas.map((c) => c.anexo).sort();
			const expected = Array.from({ length: 19 }, (_, i) => `A-2-${i + 1}`).sort();
			expect(anexos).toEqual(expected);
		});

		test('should all start with "Charla:" or "Texto:"', () => {
			for (const charla of defaultCharlas) {
				const startsCorrectly =
					charla.name.startsWith('Charla:') || charla.name.startsWith('Texto:');
				expect(startsCorrectly).toBe(true);
			}
		});

		test('should have 10 Charla entries and 9 Texto entries', () => {
			const charlas = defaultCharlas.filter((c) => c.name.startsWith('Charla:'));
			const textos = defaultCharlas.filter((c) => c.name.startsWith('Texto:'));
			expect(charlas).toHaveLength(10);
			expect(textos).toHaveLength(9);
		});
	});

	describe('Charla Documentation', () => {
		test('should have 19 documented charlas', () => {
			const keys = Object.keys(charlaDocumentation);
			expect(keys).toHaveLength(19);
		});

		test('each charla doc should reference its anexo number', () => {
			for (const [name, content] of Object.entries(charlaDocumentation)) {
				expect(content).toContain('Anexo A-2-');
				expect(content.length).toBeGreaterThan(100);
			}
		});

		test('charla documentation keys should start with "Charla:" or "Texto:"', () => {
			for (const key of Object.keys(charlaDocumentation)) {
				const startsCorrectly = key.startsWith('Charla:') || key.startsWith('Texto:');
				expect(startsCorrectly).toBe(true);
			}
		});
	});

	describe('Responsibility Documentation', () => {
		test('should have at least one documented responsibility', () => {
			const keys = Object.keys(responsibilityDocumentation);
			expect(keys.length).toBeGreaterThan(0);
		});

		test('each responsibility doc should have substantial content', () => {
			for (const [, content] of Object.entries(responsibilityDocumentation)) {
				expect(content.length).toBeGreaterThan(50);
			}
		});
	});

	describe('Moderador Description', () => {
		test('should contain Anexo A-4-4 reference', () => {
			expect(moderadorDescription).toContain('A-4-4');
		});

		test('should contain "Guía para Moderadores"', () => {
			expect(moderadorDescription).toContain('Guía para Moderadores');
		});

		test('should reference Viernes', () => {
			expect(moderadorDescription).toContain('Viernes');
		});

		test('should reference Sábado', () => {
			expect(moderadorDescription).toContain('Sábado');
		});

		test('should reference Domingo', () => {
			expect(moderadorDescription).toContain('Domingo');
		});
	});

	describe('Diario Description', () => {
		test('should contain "Diario del Caminante"', () => {
			expect(diarioDescription).toContain('Diario del Caminante');
		});

		test('should contain "cancionero"', () => {
			expect(diarioDescription).toContain('cancionero');
		});

		test('should have substantial content', () => {
			expect(diarioDescription.length).toBeGreaterThan(200);
		});
	});
});
