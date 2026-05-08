/**
 * computeItemDateRange — pure-logic tests for the TZ-aware materialization
 * used by `materializeFromTemplate` and `addMissingTemplateItems`.
 *
 * Historia del bug:
 *   - Versión 1: usaba `setHours()` server-local → off-by-one de día en
 *     dev no-UTC (corregido leyendo componentes UTC de baseDate).
 *   - Versión 2: usaba `new Date(yyyy, mm, dd, h, m)` server-local → con
 *     server UTC y cliente America/Mexico_City, '16:00 local' se almacenaba
 *     como 16:00Z y el navegador lo mostraba como 10:00 AM. Reportado en
 *     el retiro de San Agustín (Santísimo).
 *
 * Fix actual:
 *   - `defaultStartTime` ('16:00') es la hora LOCAL DEL RETIRO.
 *   - `computeItemDateRange` recibe la timezone IANA del retiro
 *     (resuelta como retreat.timezone ?? house.timezone ?? default).
 *   - `makeDateInTimezone(...)` (en utils/date.transformer.ts) convierte
 *     componentes calendario en esa zona al instante UTC equivalente,
 *     manejando DST automáticamente vía Intl.DateTimeFormat.
 */

import { makeDateInTimezone } from '../../utils/date.transformer';

function computeItemDateRange(
	baseDate: Date,
	day: number,
	defaultStartTime: string | null | undefined,
	durationMinutes: number,
	timezone: string,
): { startTime: Date; endTime: Date } {
	let h = 9;
	let m = 0;
	if (defaultStartTime) {
		const parts = defaultStartTime.split(':');
		h = parseInt(parts[0] ?? '9', 10);
		m = parseInt(parts[1] ?? '0', 10);
	}
	const yyyy = baseDate.getUTCFullYear();
	const mm = baseDate.getUTCMonth();
	const dd = baseDate.getUTCDate();
	const dayOffset = h < 6 ? day : day - 1;
	const startTime = makeDateInTimezone(yyyy, mm, dd + dayOffset, h, m, timezone);
	const endTime = new Date(startTime.getTime() + durationMinutes * 60_000);
	return { startTime, endTime };
}

describe('makeDateInTimezone — direct helper', () => {
	it('America/Mexico_City: 2026-04-26 16:00 → 2026-04-26T22:00:00Z (CST, no DST since 2022)', () => {
		const d = makeDateInTimezone(2026, 3, 26, 16, 0, 'America/Mexico_City');
		expect(d.toISOString()).toBe('2026-04-26T22:00:00.000Z');
	});

	it('America/Mexico_City: julio 2026 (verano) sigue UTC-6 (México eliminó DST en 2022)', () => {
		const d = makeDateInTimezone(2026, 6, 26, 16, 0, 'America/Mexico_City');
		expect(d.toISOString()).toBe('2026-07-26T22:00:00.000Z');
	});

	it('America/Bogota: 2026-04-26 16:00 → 2026-04-26T21:00:00Z (Colombia siempre UTC-5)', () => {
		const d = makeDateInTimezone(2026, 3, 26, 16, 0, 'America/Bogota');
		expect(d.toISOString()).toBe('2026-04-26T21:00:00.000Z');
	});

	it('America/Bogota: julio sigue UTC-5 (no DST)', () => {
		const d = makeDateInTimezone(2026, 6, 26, 16, 0, 'America/Bogota');
		expect(d.toISOString()).toBe('2026-07-26T21:00:00.000Z');
	});

	it('Europe/Madrid invierno (CET, UTC+1): 2026-01-15 16:00 → 15:00:00Z', () => {
		const d = makeDateInTimezone(2026, 0, 15, 16, 0, 'Europe/Madrid');
		expect(d.toISOString()).toBe('2026-01-15T15:00:00.000Z');
	});

	it('Europe/Madrid verano (CEST, UTC+2): 2026-07-15 16:00 → 14:00:00Z', () => {
		const d = makeDateInTimezone(2026, 6, 15, 16, 0, 'Europe/Madrid');
		expect(d.toISOString()).toBe('2026-07-15T14:00:00.000Z');
	});

	it('UTC: identidad — 2026-04-26 16:00 → 16:00:00Z', () => {
		const d = makeDateInTimezone(2026, 3, 26, 16, 0, 'UTC');
		expect(d.toISOString()).toBe('2026-04-26T16:00:00.000Z');
	});
});

describe('computeItemDateRange — TZ-aware materialization', () => {
	const baseDate = new Date('2026-04-26T00:00:00.000Z');
	const MX = 'America/Mexico_City';
	const CO = 'America/Bogota';

	it('Día 1 a 16:00 en CDMX → 22:00 UTC, calendario 26-abr', () => {
		const { startTime } = computeItemDateRange(baseDate, 1, '16:00', 60, MX);
		expect(startTime.toISOString()).toBe('2026-04-26T22:00:00.000Z');
	});

	it('Día 1 a 16:00 en Bogotá → 21:00 UTC, calendario 26-abr', () => {
		const { startTime } = computeItemDateRange(baseDate, 1, '16:00', 60, CO);
		expect(startTime.toISOString()).toBe('2026-04-26T21:00:00.000Z');
	});

	it('Día 2 a 07:30 CDMX → 27-abr 13:30Z', () => {
		const { startTime } = computeItemDateRange(baseDate, 2, '07:30', 60, MX);
		expect(startTime.toISOString()).toBe('2026-04-27T13:30:00.000Z');
	});

	it('Día 3 a 20:15 CDMX → 28-abr 02:15Z (siguiente día UTC)', () => {
		const { startTime } = computeItemDateRange(baseDate, 3, '20:15', 45, MX);
		expect(startTime.toISOString()).toBe('2026-04-29T02:15:00.000Z');
	});

	it('cross-month: baseDate 30-abr, Día 3 a 08:00 CDMX → 02-may 14:00Z', () => {
		const lateApril = new Date('2026-04-30T00:00:00.000Z');
		const { startTime } = computeItemDateRange(lateApril, 3, '08:00', 30, MX);
		expect(startTime.toISOString()).toBe('2026-05-02T14:00:00.000Z');
	});

	it('cross-year: baseDate 30-dic-2025, Día 4 a 09:00 CDMX → 02-ene-2026 15:00Z', () => {
		const dec30 = new Date('2025-12-30T00:00:00.000Z');
		const { startTime } = computeItemDateRange(dec30, 4, '09:00', 30, MX);
		expect(startTime.toISOString()).toBe('2026-01-02T15:00:00.000Z');
	});

	it('endTime = startTime + durationMinutes', () => {
		const { startTime, endTime } = computeItemDateRange(baseDate, 1, '09:00', 75, MX);
		expect(endTime.getTime() - startTime.getTime()).toBe(75 * 60_000);
	});

	it('default 09:00 cuando defaultStartTime es null', () => {
		const { startTime } = computeItemDateRange(baseDate, 1, null, 30, MX);
		expect(startTime.toISOString()).toBe('2026-04-26T15:00:00.000Z');
	});

	it('default 09:00 cuando defaultStartTime es undefined', () => {
		const { startTime } = computeItemDateRange(baseDate, 1, undefined, 30, MX);
		expect(startTime.toISOString()).toBe('2026-04-26T15:00:00.000Z');
	});

	it('parsea "07:05" preservando el cero a la izquierda en minutos', () => {
		const { startTime } = computeItemDateRange(baseDate, 1, '07:05', 15, MX);
		expect(startTime.toISOString()).toBe('2026-04-26T13:05:00.000Z');
	});

	it('baseDate parsed from "YYYY-MM-DD" string lands on the same calendar day', () => {
		const fromString = new Date('2026-04-26');
		const { startTime } = computeItemDateRange(fromString, 1, '09:00', 30, MX);
		expect(startTime.toISOString()).toBe('2026-04-26T15:00:00.000Z');
	});

	it('dos días consecutivos a las mismas HH:MM están exactamente a 24h en CDMX (sin DST)', () => {
		const d1 = computeItemDateRange(baseDate, 1, '09:00', 30, MX).startTime;
		const d2 = computeItemDateRange(baseDate, 2, '09:00', 30, MX).startTime;
		expect(d2.getTime() - d1.getTime()).toBe(24 * 60 * 60 * 1000);
	});

	// Bug K — after-midnight (h<6) shifts day forward
	describe('Bug K — items madrugada saltan al siguiente día calendario', () => {
		it('Día 1 a 00:10 CDMX → 27-abr 06:10Z', () => {
			const { startTime } = computeItemDateRange(baseDate, 1, '00:10', 360, MX);
			expect(startTime.toISOString()).toBe('2026-04-27T06:10:00.000Z');
		});

		it('Día 1 a 23:50 CDMX → 27-abr 05:50Z (sigue siendo noche del 26 local)', () => {
			const { startTime } = computeItemDateRange(baseDate, 1, '23:50', 10, MX);
			expect(startTime.toISOString()).toBe('2026-04-27T05:50:00.000Z');
		});

		it('Día 1 a 05:59 sigue tratado como next-morning (boundary)', () => {
			const { startTime } = computeItemDateRange(baseDate, 1, '05:59', 1, MX);
			expect(startTime.toISOString()).toBe('2026-04-27T11:59:00.000Z');
		});

		it('Día 1 a 06:00 se queda en el mismo día calendario (boundary normal)', () => {
			const { startTime } = computeItemDateRange(baseDate, 1, '06:00', 30, MX);
			expect(startTime.toISOString()).toBe('2026-04-26T12:00:00.000Z');
		});

		it('orden cronológico respetado: 22:00 → 23:50 → 00:00 → 00:10 (Día 1)', () => {
			const evening1 = computeItemDateRange(baseDate, 1, '22:00', 30, MX).startTime;
			const evening2 = computeItemDateRange(baseDate, 1, '23:50', 10, MX).startTime;
			const night1 = computeItemDateRange(baseDate, 1, '00:00', 10, MX).startTime;
			const night2 = computeItemDateRange(baseDate, 1, '00:10', 360, MX).startTime;
			expect(evening1.getTime()).toBeLessThan(evening2.getTime());
			expect(evening2.getTime()).toBeLessThan(night1.getTime());
			expect(night1.getTime()).toBeLessThan(night2.getTime());
		});

		it('Día 2 a 06:00 → 27-abr 12:00Z', () => {
			const { startTime } = computeItemDateRange(baseDate, 2, '06:00', 30, MX);
			expect(startTime.toISOString()).toBe('2026-04-27T12:00:00.000Z');
		});

		it('Día 2 a 00:30 → 28-abr 06:30Z (madrugada del Día 2 → calendario 28)', () => {
			const { startTime } = computeItemDateRange(baseDate, 2, '00:30', 60, MX);
			expect(startTime.toISOString()).toBe('2026-04-28T06:30:00.000Z');
		});
	});
});
