/**
 * Tests de la ventana temporal del puente (specs/whatsapp-inbox D5).
 *
 * Toda la lógica es pura contra fechas civiles 'YYYY-MM-DD': el test fija
 * "hoy" explícitamente y cubre el borde nocturno CDMX vs UTC vía
 * civilTodayInTimezone contra una hora fija del reloj (mock de Date).
 */
import {
	acceptedJidDigitVariants,
	computeLinkWindow,
	civilTodayInTimezone,
	isLinkPurgeDue,
	shiftCivilDate,
} from '@/services/waBridge/waBridgeService';

describe('shiftCivilDate', () => {
	it('suma y resta días cruzando frontera de mes', () => {
		expect(shiftCivilDate('2026-11-01', -1)).toBe('2026-10-31');
		expect(shiftCivilDate('2026-10-31', 1)).toBe('2026-11-01');
		expect(shiftCivilDate('2026-02-28', 1)).toBe('2026-03-01'); // no bisiesto
		expect(shiftCivilDate('2028-02-28', 1)).toBe('2028-02-29'); // bisiesto
	});
});

describe('computeLinkWindow', () => {
	const retreat = { startDate: '2026-11-20', endDate: '2026-11-22', timezone: 'America/Mexico_City' };

	it('fuera de ventana: más de 7 días antes del inicio', () => {
		const w = computeLinkWindow(retreat, '2026-11-12');
		expect(w.canLink).toBe(false);
		expect(w.linkOpenOn).toBe('2026-11-13');
	});

	it('en ventana: desde startDate − 7 hasta endDate', () => {
		expect(computeLinkWindow(retreat, '2026-11-13').canLink).toBe(true);
		expect(computeLinkWindow(retreat, '2026-11-20').canLink).toBe(true);
		expect(computeLinkWindow(retreat, '2026-11-22').canLink).toBe(true);
	});

	it('fuera de ventana: después de endDate', () => {
		expect(computeLinkWindow(retreat, '2026-11-23').canLink).toBe(false);
	});

	it('sync sigue permitido en la gracia post-retiro, hasta endDate + retención', () => {
		const w = computeLinkWindow(retreat, '2026-11-30');
		expect(w.canLink).toBe(false);
		expect(w.syncAllowed).toBe(true);
		expect(w.syncCloseOn).toBe('2026-12-07');
		expect(computeLinkWindow(retreat, '2026-12-08').syncAllowed).toBe(false);
	});
});

describe('isLinkPurgeDue', () => {
	it('purga estrictamente DESPUÉS de endDate + retención', () => {
		expect(isLinkPurgeDue('2026-11-22', '2026-12-07')).toBe(false); // justo el límite
		expect(isLinkPurgeDue('2026-11-22', '2026-12-08')).toBe(true);
	});
});

describe('acceptedJidDigitVariants', () => {
	it('MX: con y sin el prefijo 1 intermedio (521 móvil / 52 fijo)', () => {
		expect(acceptedJidDigitVariants('5512345678', 'MX')).toEqual([
			'525512345678',
			'5215512345678',
		]);
	});

	it('US: solo lada + nacional (sin prefijo 1 intermedio)', () => {
		expect(acceptedJidDigitVariants('5551234567', 'US')).toEqual(['15551234567']);
	});

	it('país desconocido: solo el nacional pelado', () => {
		expect(acceptedJidDigitVariants('5512345678', 'ZZ')).toEqual(['5512345678']);
	});
});

describe('civilTodayInTimezone', () => {
	afterEach(() => {
		jest.useRealTimers();
	});

	it('CDMX vs UTC: la noche de CDMX es "mañana" en UTC — la civil manda', () => {
		// 2026-11-20 01:30 CDMX == 2026-11-20 07:30 UTC (mismo día civil)…
		jest.useFakeTimers();
		jest.setSystemTime(new Date('2026-11-20T07:30:00Z'));
		expect(civilTodayInTimezone('America/Mexico_City')).toBe('2026-11-20');
		expect(civilTodayInTimezone('Etc/UTC')).toBe('2026-11-20');

		// …pero 2026-11-20 23:30 CDMX == 2026-11-21 05:30 UTC: día distinto.
		jest.setSystemTime(new Date('2026-11-21T05:30:00Z'));
		expect(civilTodayInTimezone('America/Mexico_City')).toBe('2026-11-20');
		expect(civilTodayInTimezone('Etc/UTC')).toBe('2026-11-21');
	});

	it('timezone inválida: el servicio la resuelve con resolveSafeTimeZone antes de llamar', () => {
		// civilTodayInTimezone no valida; el contrato es recibir tz ya segura
		// (resolveSafeTimeZone). Documentado aquí para no perder el hilo.
		jest.useFakeTimers();
		jest.setSystemTime(new Date('2026-11-20T12:00:00Z'));
		expect(civilTodayInTimezone('Europe/Madrid')).toBe('2026-11-20');
	});
});
