import { dayBoundsInTimezone } from '@/utils/date.transformer';

/**
 * Límites del día natural en la zona de un retiro.
 *
 * Regresión: `dashboardStats` los calculaba con `new Date().setHours(0,0,0,0)`,
 * o sea la medianoche del proceso. En el server de producción (Etc/UTC) el día
 * arrancaba a las 18:00 CDMX de la víspera, así que los items de tarde-noche
 * caían en el día equivocado del contador de progreso.
 *
 * Aserciones sobre el instante UTC absoluto: `getHours()` depende del runner.
 */
describe('dayBoundsInTimezone', () => {
	it('delimita el día en la zona del retiro, no en la del proceso', () => {
		// 2 de septiembre de 2026, 20:00 CDMX (= 03-sep 02:00Z: en UTC ya es otro día).
		const instant = new Date('2026-09-03T02:00:00.000Z');
		const { start, end } = dayBoundsInTimezone(instant, 'America/Mexico_City');

		expect(start.toISOString()).toBe('2026-09-02T06:00:00.000Z'); // 2-sep 00:00 CDMX
		expect(end.toISOString()).toBe('2026-09-03T06:00:00.000Z'); // 3-sep 00:00 CDMX
	});

	it('el instante siempre cae dentro de su propio día', () => {
		const instant = new Date('2026-09-03T02:00:00.000Z');
		const { start, end } = dayBoundsInTimezone(instant, 'America/Mexico_City');
		expect(instant.getTime()).toBeGreaterThanOrEqual(start.getTime());
		expect(instant.getTime()).toBeLessThan(end.getTime());
	});

	it('funciona igual con offset positivo', () => {
		// 2 de septiembre, 08:00 en Tokio = 1-sep 23:00Z (en UTC es el día anterior).
		const instant = new Date('2026-09-01T23:00:00.000Z');
		const { start, end } = dayBoundsInTimezone(instant, 'Asia/Tokyo');
		expect(start.toISOString()).toBe('2026-09-01T15:00:00.000Z'); // 2-sep 00:00 JST
		expect(end.toISOString()).toBe('2026-09-02T15:00:00.000Z'); // 3-sep 00:00 JST
	});

	it('el día del cambio de horario dura 23 horas, no 24', () => {
		// 29 de marzo de 2026 en Madrid: a las 02:00 se salta a las 03:00.
		const instant = new Date('2026-03-29T10:00:00.000Z');
		const { start, end } = dayBoundsInTimezone(instant, 'Europe/Madrid');
		expect(start.toISOString()).toBe('2026-03-28T23:00:00.000Z'); // 29-mar 00:00 CET
		expect(end.toISOString()).toBe('2026-03-29T22:00:00.000Z'); // 30-mar 00:00 CEST
		expect(end.getTime() - start.getTime()).toBe(23 * 60 * 60 * 1000);
	});

	it('cruza el fin de mes sin desbordarse', () => {
		const instant = new Date('2026-10-01T04:00:00.000Z'); // 30-sep 22:00 CDMX
		const { start, end } = dayBoundsInTimezone(instant, 'America/Mexico_City');
		expect(start.toISOString()).toBe('2026-09-30T06:00:00.000Z');
		expect(end.toISOString()).toBe('2026-10-01T06:00:00.000Z');
	});
});
