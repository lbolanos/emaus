// Helpers puros de tiempo de Tareas Pre-Retiro (packages/types/src/preRetreatTaskTime.ts).
// Sin DB ni mocks: garantizan el round-trip offset ↔ (valor, unidad), el cálculo
// de dueDate sin salto de día (aritmética UTC sobre YYYY-MM-DD) y el semáforo V1.

import { describe, it, expect } from '@jest/globals';
import {
	partsToOffsetDays,
	offsetDaysToParts,
	formatDueOffset,
	computeDueDate,
	diffDays,
	taskSemaphore,
	computeTaskProgress,
} from '@repo/types';

// Todos los offsets que usa el Excel "Que-Cuando" (fuente del seed).
const EXCEL_OFFSETS: Array<[number, string]> = [
	[120, '4 meses'],
	[90, '3 meses'],
	[60, '2 meses'],
	[84, '12 semanas'],
	[70, '10 semanas'],
	[56, '8 semanas'],
	[35, '5 semanas'],
	[28, '4 semanas'],
	[21, '3 semanas'],
	[14, '2 semanas'],
	[7, '1 semana'],
	[2, '2 días'],
];

describe('offset round-trip (parts ↔ days)', () => {
	it.each(EXCEL_OFFSETS)('offset %i días es estable en round-trip', (days) => {
		const parts = offsetDaysToParts(days);
		expect(partsToOffsetDays(parts.value, parts.unit)).toBe(days);
	});

	it('convierte unidades a días (mes=30, semana=7)', () => {
		expect(partsToOffsetDays(4, 'months')).toBe(120);
		expect(partsToOffsetDays(12, 'weeks')).toBe(84);
		expect(partsToOffsetDays(2, 'days')).toBe(2);
	});

	it('prefiere meses solo en múltiplos de 30 ≥ 60; semanas en múltiplos de 7', () => {
		expect(offsetDaysToParts(120)).toEqual({ value: 4, unit: 'months' });
		expect(offsetDaysToParts(84)).toEqual({ value: 12, unit: 'weeks' });
		expect(offsetDaysToParts(30)).toEqual({ value: 30, unit: 'days' }); // < 60 no es "1 mes"... pero 30 no es múltiplo de 7 → días
		expect(offsetDaysToParts(10)).toEqual({ value: 10, unit: 'days' });
		expect(offsetDaysToParts(0)).toEqual({ value: 0, unit: 'days' });
	});
});

describe('formatDueOffset', () => {
	it.each(EXCEL_OFFSETS)('formatea %i días como "%s"', (days, label) => {
		expect(formatDueOffset(days)).toBe(label);
	});

	it('singulariza', () => {
		expect(formatDueOffset(7)).toBe('1 semana');
		expect(formatDueOffset(1)).toBe('1 día');
	});
});

describe('computeDueDate (aritmética UTC, sin salto de día)', () => {
	it('resta offsets simples', () => {
		expect(computeDueDate('2026-09-18', 14)).toBe('2026-09-04');
		expect(computeDueDate('2026-09-18', 2)).toBe('2026-09-16');
	});

	it('cruza meses y años correctamente', () => {
		expect(computeDueDate('2026-01-10', 30)).toBe('2025-12-11');
		expect(computeDueDate('2026-03-05', 120)).toBe('2025-11-05');
	});

	it('acepta startDate ISO con hora (usa solo la fecha)', () => {
		expect(computeDueDate('2026-09-18T00:00:00.000Z', 7)).toBe('2026-09-11');
	});

	it('devuelve null con entradas inválidas', () => {
		expect(computeDueDate(null, 7)).toBeNull();
		expect(computeDueDate('no-fecha', 7)).toBeNull();
	});

	it('offset 0 = mismo día', () => {
		expect(computeDueDate('2026-09-18', 0)).toBe('2026-09-18');
	});
});

describe('diffDays', () => {
	it('calcula b − a en días de calendario', () => {
		expect(diffDays('2026-07-01', '2026-07-08')).toBe(7);
		expect(diffDays('2026-07-08', '2026-07-01')).toBe(-7);
		expect(diffDays('2026-07-01', '2026-07-01')).toBe(0);
	});

	it('null con fechas inválidas', () => {
		expect(diffDays(null, '2026-07-01')).toBeNull();
		expect(diffDays('2026-07-01', undefined)).toBeNull();
	});
});

describe('taskSemaphore', () => {
	const today = '2026-07-02';

	it('done y not_applicable dominan sobre la fecha', () => {
		expect(taskSemaphore('2026-01-01', today, 'done')).toBe('done');
		expect(taskSemaphore('2026-01-01', today, 'not_applicable')).toBe('none');
	});

	it('vencida → overdue; ≤7 días → soon; después → ok', () => {
		expect(taskSemaphore('2026-07-01', today, 'pending')).toBe('overdue');
		expect(taskSemaphore('2026-07-02', today, 'pending')).toBe('soon'); // vence hoy
		expect(taskSemaphore('2026-07-09', today, 'in_progress')).toBe('soon');
		expect(taskSemaphore('2026-07-10', today, 'pending')).toBe('ok');
	});

	it('sin dueDate → none', () => {
		expect(taskSemaphore(null, today, 'pending')).toBe('none');
	});
});

describe('computeTaskProgress', () => {
	it('cuenta done y excluye not_applicable del total', () => {
		expect(
			computeTaskProgress([
				{ status: 'done' },
				{ status: 'pending' },
				{ status: 'in_progress' },
				{ status: 'not_applicable' },
			]),
		).toEqual({ done: 1, total: 3 });
	});

	it('sin hijos → 0/0', () => {
		expect(computeTaskProgress([])).toEqual({ done: 0, total: 0 });
	});

	it('todo N/A → 0/0', () => {
		expect(computeTaskProgress([{ status: 'not_applicable' }])).toEqual({ done: 0, total: 0 });
	});
});
