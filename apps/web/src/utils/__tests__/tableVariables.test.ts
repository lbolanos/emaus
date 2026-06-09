import { describe, it, expect } from 'vitest';
import { replaceTableVariables, replaceAllVariables, findEmptyVariables, type TableData } from '@/utils/message';

const baseTable = (): TableData => ({
	name: 'Mesa 03',
	liderName: 'Juan Pérez',
	colider1Name: 'María López',
	walkers: [
		{
			firstName: 'Pedro',
			lastName: 'Ramírez',
			cellPhone: '555-100-2000',
			homePhone: '555-100-2009',
			emergencyContact1Name: 'Ana Ramírez',
			emergencyContact1Relation: 'Esposa',
			emergencyContact1CellPhone: '555-100-2001',
			emergencyContact2Name: 'Luis Ramírez',
			emergencyContact2Relation: 'Hermano',
			emergencyContact2CellPhone: '555-100-2002',
		},
		{
			firstName: 'Carlos',
			lastName: 'Gómez',
			cellPhone: '555-300-4000',
			emergencyContact1Name: 'Rosa Gómez',
			emergencyContact1Relation: 'Madre',
			emergencyContact1CellPhone: '555-300-4001',
		},
	],
});

describe('replaceTableVariables', () => {
	it('resuelve name, walkersCount y walkersNames', () => {
		const out = replaceTableVariables(
			'{table.name} — {table.walkersCount} caminantes: {table.walkersNames}',
			baseTable(),
		);
		expect(out).toBe('Mesa 03 — 2 caminantes: Pedro Ramírez, Carlos Gómez');
	});

	it('el roster incluye nombre, teléfonos propios y ambos contactos de emergencia', () => {
		const out = replaceTableVariables('{table.walkersRoster}', baseTable());
		expect(out).toContain('Pedro Ramírez');
		expect(out).toContain('Cel: 555-100-2000');
		expect(out).toContain('Casa: 555-100-2009');
		expect(out).toContain('Emergencia 1: Ana Ramírez (Esposa)');
		expect(out).toContain('555-100-2001');
		expect(out).toContain('Emergencia 2: Luis Ramírez (Hermano)');
		expect(out).toContain('555-100-2002');
	});

	it('omite el contacto de emergencia 2 cuando no existe', () => {
		const out = replaceTableVariables('{table.walkersRoster}', baseTable());
		// Carlos solo tiene EC1 → no debe aparecer "Emergencia 2" para él.
		const carlosBlock = out.split('Carlos Gómez')[1] ?? '';
		expect(carlosBlock).toContain('Emergencia 1: Rosa Gómez (Madre)');
		expect(carlosBlock).not.toContain('Emergencia 2');
	});

	it('no imprime teléfonos vacíos o con guion', () => {
		const table: TableData = {
			name: 'Mesa 1',
			walkers: [
				{
					firstName: 'Sin',
					lastName: 'Telefonos',
					cellPhone: '555-1',
					homePhone: '-',
					workPhone: '',
					emergencyContact1Name: 'Contacto',
					emergencyContact1Relation: 'Amigo',
					emergencyContact1CellPhone: '555-2',
				},
			],
		};
		const out = replaceTableVariables('{table.walkersRoster}', table);
		expect(out).toContain('Cel: 555-1');
		expect(out).not.toContain('Casa: -');
		expect(out).not.toContain('Trabajo:');
	});

	it('usa datos mock cuando table es null (preview)', () => {
		const out = replaceTableVariables('{table.name}', null);
		expect(out).toBe('Mesa 01');
	});
});

describe('replaceAllVariables con scope table', () => {
	it('resuelve {table.*} cuando se pasa tableData y deja {participant.*} para su scope', () => {
		const out = replaceAllVariables(
			'Hola {participant.firstName}, tu mesa {table.name} tiene {table.walkersCount} caminantes.',
			{ firstName: 'Juan' } as any,
			null,
			undefined,
			undefined,
			baseTable(),
		);
		expect(out).toBe('Hola Juan, tu mesa Mesa 03 tiene 2 caminantes.');
	});

	it('deja {table.*} literal cuando no se pasa el argumento table', () => {
		const out = replaceAllVariables('{table.name}', null, null);
		expect(out).toBe('{table.name}');
	});
});

describe('findEmptyVariables con scope table', () => {
	const briefingMsg = 'Mesa {table.name} ({table.walkersCount}): {table.walkersRoster}';

	it('NO marca {table.*} como vacías cuando no hay contexto de mesa', () => {
		// Sin table → las variables de mesa no aplican; no deben advertirse con el
		// consejo de "revisa datos del caminante/retiro".
		const empty = findEmptyVariables(briefingMsg, { firstName: 'X' } as any, null);
		expect(empty).not.toContain('table.name');
		expect(empty).not.toContain('table.walkersRoster');
	});

	it('NO marca {table.*} como vacías cuando el TableData está poblado', () => {
		const empty = findEmptyVariables(
			briefingMsg,
			{ firstName: 'X' } as any,
			null,
			undefined,
			undefined,
			baseTable(),
		);
		expect(empty).not.toContain('table.name');
		expect(empty).not.toContain('table.walkersRoster');
	});
});
