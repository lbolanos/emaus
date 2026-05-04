/**
 * Tests para formatDate de @repo/utils
 *
 * Bug corregido: el formato 'datetime' descartaba la hora porque construía
 * un Date con solo getUTCFullYear/Month/Date, mostrando siempre 00:00.
 * Ahora 'datetime' usa el instante completo convertido a la zona local.
 */
import { describe, it, expect } from 'vitest';
import { formatDate } from '@repo/utils';

describe('formatDate – datetime preserva la hora local', () => {
	it('incluye hora y minutos para un ISO con tiempo', () => {
		// 2026-04-23T15:30:00Z: resultado depende de la TZ del runner,
		// pero el formato debe contener HH:MM.
		const result = formatDate('2026-04-23T15:30:00.000Z', { format: 'datetime' });
		expect(result).toMatch(/\d{2}:\d{2}/);
	});

	it('la hora no es siempre 00:00 (el bug producía 00:00 siempre)', () => {
		const noon = formatDate('2026-04-23T12:00:00.000Z', { format: 'datetime' });
		const sixPm = formatDate('2026-04-23T18:00:00.000Z', { format: 'datetime' });
		// Al menos una de las dos debe diferir de "00:00"
		const bothAreMidnight = /00:00/.test(noon) && /00:00/.test(sixPm);
		expect(bothAreMidnight).toBe(false);
	});

	it('horas distintas (misma fecha) producen resultados distintos', () => {
		const a = formatDate('2026-04-23T08:15:00.000Z', { format: 'datetime' });
		const b = formatDate('2026-04-23T20:45:00.000Z', { format: 'datetime' });
		expect(a).not.toBe(b);
	});

	it('acepta un objeto Date y muestra hora', () => {
		const d = new Date('2026-04-23T10:30:00.000Z');
		const result = formatDate(d, { format: 'datetime' });
		expect(result).toMatch(/\d{2}:\d{2}/);
	});
});

describe('formatDate – formatos solo-fecha evitan corrimiento de timezone', () => {
	it('short: 2026-05-15 no se corre a May 14 en UTC-6', () => {
		// El bug original (new Date('2026-05-15')) en UTC-6 mostraba "14/5/2026".
		const result = formatDate('2026-05-15', { format: 'short' });
		expect(result).toContain('15');
		expect(result).not.toContain('14');
	});

	it('long: muestra el día correcto para ISO UTC midnight', () => {
		const result = formatDate('2026-12-26T00:00:00.000Z', { format: 'long' });
		expect(result).toContain('26');
		expect(result.toLowerCase()).toContain('diciembre');
	});

	it('full: incluye día de la semana', () => {
		const result = formatDate('2026-05-15', { format: 'full', locale: 'es-ES' });
		// viernes 15 de mayo de 2026
		expect(result.toLowerCase()).toContain('viernes');
		expect(result).toContain('15');
	});

	it('short por defecto cuando no se pasa format', () => {
		const result = formatDate('2026-05-15');
		expect(result).toContain('15');
	});
});

describe('formatDate – locale', () => {
	it('respeta el locale solicitado', () => {
		const es = formatDate('2026-05-15', { format: 'long', locale: 'es-ES' });
		const en = formatDate('2026-05-15', { format: 'long', locale: 'en-US' });
		expect(es.toLowerCase()).toContain('mayo');
		expect(en.toLowerCase()).toContain('may');
	});
});
