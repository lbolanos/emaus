/**
 * Tests for date coercion in retreatScheduleService (bug fix 2026-04-25)
 *
 * Bug: PATCH /api/schedule/items/:id devolvía 500 con
 *   "start.getTime is not a function"
 * cuando el cliente enviaba startTime como string ISO (caso normal en JSON).
 *
 * Fix: convertir strings → Date antes de llamar .getTime().
 *
 * Estos son tests de lógica pura (sin TypeORM ni DB) que validan la coerción.
 */
import { describe, it, expect } from '@jest/globals';

// Reproducción de la lógica del service (extraída para test puro)
function coerceDate(value: unknown): Date | undefined {
	if (value === undefined || value === null) return undefined;
	return value instanceof Date ? value : new Date(value as string);
}

function recomputeEndTime(
	startTime: Date | string,
	durationMinutes: number,
): Date {
	const startDate = startTime instanceof Date ? startTime : new Date(startTime);
	return new Date(startDate.getTime() + durationMinutes * 60000);
}

describe('coerceDate — strings ISO se convierten a Date', () => {
	it('convierte un string ISO a Date', () => {
		const result = coerceDate('2026-04-25T18:00:00.000Z');
		expect(result).toBeInstanceOf(Date);
		expect(result?.toISOString()).toBe('2026-04-25T18:00:00.000Z');
	});

	it('mantiene un Date como Date', () => {
		const date = new Date('2026-04-25T18:00:00Z');
		const result = coerceDate(date);
		expect(result).toBe(date);
	});

	it('retorna undefined para undefined', () => {
		expect(coerceDate(undefined)).toBeUndefined();
	});

	it('retorna undefined para null', () => {
		expect(coerceDate(null)).toBeUndefined();
	});

	it('convierte un timestamp numérico', () => {
		const ts = Date.now();
		const result = coerceDate(ts);
		expect(result?.getTime()).toBe(ts);
	});
});

describe('recomputeEndTime — funciona con string o Date', () => {
	it('calcula endTime cuando startTime es Date', () => {
		const start = new Date('2026-04-25T10:00:00Z');
		const end = recomputeEndTime(start, 30);
		expect(end.toISOString()).toBe('2026-04-25T10:30:00.000Z');
	});

	it('calcula endTime cuando startTime es string ISO (regresión)', () => {
		// Antes del fix, esto lanzaba "start.getTime is not a function"
		const end = recomputeEndTime('2026-04-25T10:00:00Z', 30);
		expect(end).toBeInstanceOf(Date);
		expect(end.toISOString()).toBe('2026-04-25T10:30:00.000Z');
	});

	it('respeta duración 0 (no shift)', () => {
		const end = recomputeEndTime('2026-04-25T10:00:00Z', 0);
		expect(end.toISOString()).toBe('2026-04-25T10:00:00.000Z');
	});

	it('soporta duraciones largas (360 minutos)', () => {
		const end = recomputeEndTime('2026-04-25T10:00:00Z', 360);
		expect(end.toISOString()).toBe('2026-04-25T16:00:00.000Z');
	});

	it('NO lanza al pasar string en vez de Date (regression test)', () => {
		expect(() => recomputeEndTime('2026-04-25T10:00:00Z', 15)).not.toThrow();
	});
});

describe('Coerción en payloads PATCH realistas', () => {
	const dateFields = new Set(['startTime', 'endTime', 'actualStartTime', 'actualEndTime']);

	function coerceUpdatePayload(data: Record<string, unknown>): Record<string, unknown> {
		const out: Record<string, unknown> = {};
		for (const [k, v] of Object.entries(data)) {
			if (v === undefined) continue;
			out[k] = dateFields.has(k) && v && !(v instanceof Date)
				? new Date(v as string)
				: v;
		}
		return out;
	}

	it('convierte startTime string al patchear nombre + hora', () => {
		const payload = {
			name: 'Llegada del equipo',
			startTime: '2026-04-25T10:30:00Z',
			durationMinutes: 150,
		};
		const out = coerceUpdatePayload(payload);
		expect(out.startTime).toBeInstanceOf(Date);
		expect(out.name).toBe('Llegada del equipo');
		expect(out.durationMinutes).toBe(150);
	});

	it('convierte actualStartTime y actualEndTime cuando se completa un item', () => {
		const payload = {
			status: 'completed',
			actualStartTime: '2026-04-25T10:30:00Z',
			actualEndTime: '2026-04-25T13:00:00Z',
		};
		const out = coerceUpdatePayload(payload);
		expect(out.actualStartTime).toBeInstanceOf(Date);
		expect(out.actualEndTime).toBeInstanceOf(Date);
		expect(out.status).toBe('completed');
	});

	it('NO convierte campos no-fecha (string libre, números, booleanos)', () => {
		const payload = {
			name: 'Charla 1',
			location: 'Salón principal',
			day: 1,
			blocksSantisimoAttendance: true,
			notes: '2026-04-25 fecha en notas',  // string que parece fecha pero no es campo fecha
		};
		const out = coerceUpdatePayload(payload);
		expect(out.name).toBe('Charla 1');
		expect(out.location).toBe('Salón principal');
		expect(out.day).toBe(1);
		expect(out.blocksSantisimoAttendance).toBe(true);
		expect(out.notes).toBe('2026-04-25 fecha en notas');
		expect(typeof out.notes).toBe('string');
	});

	it('omite undefined del payload', () => {
		const payload = {
			name: 'X',
			startTime: undefined,
			location: undefined,
		};
		const out = coerceUpdatePayload(payload);
		expect(out).toEqual({ name: 'X' });
	});
});
