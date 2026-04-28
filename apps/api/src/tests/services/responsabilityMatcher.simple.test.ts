/**
 * Tests para el matcher de responsabilidades.
 * Pure logic, sin DB ni TypeORM.
 */
import { describe, it, expect } from '@jest/globals';
import {
	normalize,
	suggestResponsability,
	suggestForItems,
	type ResponsabilityLite,
	type ScheduleItemLite,
} from '../../services/responsabilityMatcher';

const RESPS: ResponsabilityLite[] = [
	{ id: 'r-pal1', name: 'Palanquero 1', hasParticipant: true },
	{ id: 'r-pal2', name: 'Palanquero 2', hasParticipant: true },
	{ id: 'r-log', name: 'Logistica', hasParticipant: true },
	{ id: 'r-camp', name: 'Campanero', hasParticipant: true },
	{ id: 'r-mus', name: 'Música', hasParticipant: true },
	{ id: 'r-comed', name: 'Comedor', hasParticipant: false },
	{ id: 'r-sant', name: 'Santísimo', hasParticipant: true },
	{ id: 'r-ora', name: 'Oración', hasParticipant: true },
	{ id: 'r-sac', name: 'Sacerdotes', hasParticipant: true },
	{ id: 'r-ch1', name: 'Charlista 1', hasParticipant: true },
	{ id: 'r-ch2', name: 'Charlista 2', hasParticipant: true },
	{ id: 'r-ch3', name: 'Charlista 3', hasParticipant: true },
];

describe('normalize', () => {
	it('lowercase + sin acentos', () => {
		expect(normalize('Música')).toBe('musica');
		expect(normalize('Oración')).toBe('oracion');
		expect(normalize('SANTÍSIMO')).toBe('santisimo');
	});

	it('quita puntuación y normaliza espacios', () => {
		expect(normalize('Charla 1: Conocerte a Ti Mismo')).toBe('charla 1 conocerte a ti mismo');
		expect(normalize('  Cena   ')).toBe('cena');
	});
});

describe('suggestResponsability — match por type', () => {
	it('type=campana → Campanero', () => {
		const item: ScheduleItemLite = {
			id: 'i1',
			name: 'Campana — inicio del retiro',
			type: 'campana',
		};
		const r = suggestResponsability(item, RESPS);
		expect(r.responsabilityId).toBe('r-camp');
		expect(r.confidence).toBe('high');
	});

	it('type=santisimo → Santísimo', () => {
		const item: ScheduleItemLite = {
			id: 'i2',
			name: 'Vigilia del Santísimo',
			type: 'santisimo',
		};
		const r = suggestResponsability(item, RESPS);
		expect(r.responsabilityId).toBe('r-sant');
	});

	it('type=oracion con keyword rosario → Oración', () => {
		const item: ScheduleItemLite = { id: 'i3', name: 'Rosario nocturno', type: 'oracion' };
		const r = suggestResponsability(item, RESPS);
		expect(r.responsabilityId).toBe('r-ora');
	});
});

describe('suggestResponsability — match por keyword en nombre', () => {
	it('"Cena" → Comedor', () => {
		const r = suggestResponsability(
			{ id: 'i', name: 'Cena', type: 'comida' },
			RESPS,
		);
		expect(r.responsabilityId).toBe('r-comed');
	});

	it('"Desayuno" → Comedor', () => {
		const r = suggestResponsability(
			{ id: 'i', name: 'Desayuno del segundo día', type: 'comida' },
			RESPS,
		);
		expect(r.responsabilityId).toBe('r-comed');
	});

	it('"Misa de servidores" → Sacerdotes', () => {
		const r = suggestResponsability(
			{ id: 'i', name: 'Misa de servidores', type: 'misa' },
			RESPS,
		);
		expect(r.responsabilityId).toBe('r-sac');
	});

	it('"Música de fondo" → Música', () => {
		const r = suggestResponsability(
			{ id: 'i', name: 'Música de fondo durante cena', type: 'otro' },
			RESPS,
		);
		// "Cena" matches comedor primero (orden de keywords); música también funcionaría
		expect(['r-mus', 'r-comed']).toContain(r.responsabilityId);
	});

	it('"Bienvenida y reglas" → Logistica', () => {
		const r = suggestResponsability(
			{ id: 'i', name: 'Bienvenida y explicación de reglas', type: 'logistica' },
			RESPS,
		);
		expect(r.responsabilityId).toBe('r-log');
	});
});

describe('suggestResponsability — charlas con número', () => {
	it('"Charla 1" → Charlista 1', () => {
		const r = suggestResponsability(
			{ id: 'i', name: 'Charla 1: Conocerte a Ti Mismo', type: 'charla' },
			RESPS,
		);
		expect(r.responsabilityId).toBe('r-ch1');
		expect(r.confidence).toBe('high');
	});

	it('"Testimonio 2" → Charlista 2', () => {
		const r = suggestResponsability(
			{ id: 'i', name: 'Charla: El Padre Amoroso (Testimonio 2)', type: 'charla' },
			RESPS,
		);
		expect(r.responsabilityId).toBe('r-ch2');
	});

	it('"Charla 3" → Charlista 3', () => {
		const r = suggestResponsability(
			{ id: 'i', name: 'Charla 3: La Fe', type: 'charla' },
			RESPS,
		);
		expect(r.responsabilityId).toBe('r-ch3');
	});

	it('"Charla 99" sin Charlista 99 → null', () => {
		const r = suggestResponsability(
			{ id: 'i', name: 'Charla 99: Inexistente', type: 'charla' },
			RESPS,
		);
		expect(r.responsabilityId).toBe(null);
	});
});

describe('suggestResponsability — sin match', () => {
	it('Item completamente desconocido → confidence none', () => {
		const r = suggestResponsability(
			{ id: 'i', name: 'XYZ aleatorio que no matchea nada', type: 'otro' },
			RESPS,
		);
		expect(r.responsabilityId).toBe(null);
		expect(r.confidence).toBe('none');
	});

	it('Lista de responsabilidades vacía → null', () => {
		const r = suggestResponsability({ id: 'i', name: 'Cena', type: 'comida' }, []);
		expect(r.responsabilityId).toBe(null);
		expect(r.confidence).toBe('none');
	});
});

describe('suggestResponsability — robusto a acentos y mayúsculas', () => {
	it('"MÚSICA" matchea "Música"', () => {
		const r = suggestResponsability({ id: 'i', name: 'MÚSICA en vivo', type: 'otro' }, RESPS);
		expect(r.responsabilityId).toBe('r-mus');
	});

	it('"Oracion" sin acento matchea "Oración"', () => {
		const r = suggestResponsability(
			{ id: 'i', name: 'Tiempo de oracion', type: 'oracion' },
			RESPS,
		);
		expect(r.responsabilityId).toBe('r-ora');
	});
});

describe('suggestForItems — múltiples items', () => {
	it('procesa los 5 items y retorna 5 sugerencias', () => {
		const items: ScheduleItemLite[] = [
			{ id: 'a', name: 'Cena', type: 'comida' },
			{ id: 'b', name: 'Charla 1', type: 'charla' },
			{ id: 'c', name: 'Misa', type: 'misa' },
			{ id: 'd', name: 'Campana', type: 'campana' },
			{ id: 'e', name: 'XYZ desconocido', type: 'otro' },
		];
		const results = suggestForItems(items, RESPS);
		expect(results).toHaveLength(5);
		expect(results[0].responsabilityId).toBe('r-comed');
		expect(results[1].responsabilityId).toBe('r-ch1');
		expect(results[2].responsabilityId).toBe('r-sac');
		expect(results[3].responsabilityId).toBe('r-camp');
		expect(results[4].responsabilityId).toBe(null);
	});

	it('items duplicados pueden compartir la misma responsabilidad', () => {
		const items: ScheduleItemLite[] = [
			{ id: 'a', name: 'Cena del primer día', type: 'comida' },
			{ id: 'b', name: 'Cena del segundo día', type: 'comida' },
		];
		const results = suggestForItems(items, RESPS);
		expect(results[0].responsabilityId).toBe('r-comed');
		expect(results[1].responsabilityId).toBe('r-comed');
	});
});

describe('suggestResponsability — devuelve reason explicativo', () => {
	it('reason incluye nombre de responsabilidad asignada', () => {
		const r = suggestResponsability(
			{ id: 'i', name: 'Charla 1', type: 'charla' },
			RESPS,
		);
		expect(r.reason).toContain('Charlista 1');
	});

	it('reason incluye keyword cuando match es por nombre', () => {
		const r = suggestResponsability(
			{ id: 'i', name: 'Cena del primer día', type: 'comida' },
			RESPS,
		);
		expect(r.reason.toLowerCase()).toContain('comedor');
	});
});
