import { describe, it, expect } from 'vitest';
import { buildTableData } from '@/utils/tableBriefing';

describe('buildTableData', () => {
	const enriched: any = {
		id: 'w1',
		firstName: 'Pedro',
		lastName: 'Ramírez',
		cellPhone: '555-1',
		emergencyContact1Name: 'Ana',
		emergencyContact1CellPhone: '555-2',
		emergencyContact2Name: 'Luis',
		emergencyContact2CellPhone: '555-3',
	};

	const table: any = {
		id: 't1',
		name: 'Mesa 3',
		lider: { id: 'l1', firstName: 'Juan', lastName: 'Pérez' },
		colider1: { id: 'c1', firstName: 'María', lastName: 'López' },
		colider2: null,
		// El walker del payload de mesas NO trae los contactos de emergencia.
		walkers: [{ id: 'w1', firstName: 'Pedro', lastName: 'Ramírez', cellPhone: '555-1' }],
	};

	it('arma name + líderes + roster enriquecido desde participantStore', () => {
		const td = buildTableData(table, [enriched]);
		expect(td.name).toBe('Mesa 3');
		expect(td.liderName).toBe('Juan Pérez');
		expect(td.colider1Name).toBe('María López');
		expect(td.colider2Name).toBe('');
		expect(td.walkers).toHaveLength(1);
		// Enriquecido → trae EC1 y EC2 aunque el payload de mesas no.
		expect(td.walkers![0].emergencyContact1Name).toBe('Ana');
		expect(td.walkers![0].emergencyContact2CellPhone).toBe('555-3');
	});

	it('cae al objeto base cuando el walker no está en el store', () => {
		const td = buildTableData(table, []); // sin enriquecimiento
		expect(td.walkers![0].firstName).toBe('Pedro');
		expect(td.walkers![0].emergencyContact1Name).toBeUndefined();
	});

	it('maneja mesa sin walkers', () => {
		const td = buildTableData({ ...table, walkers: [] }, []);
		expect(td.walkers).toEqual([]);
	});
});
