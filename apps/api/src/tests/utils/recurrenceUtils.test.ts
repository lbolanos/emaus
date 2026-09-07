import { calculateNextOccurrence, nextWeekdayOccurrence } from '@/utils/recurrenceUtils';

const DAY_MS = 24 * 60 * 60 * 1000;
const daysBetween = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / DAY_MS);

/**
 * Todas las semillas se escriben como instante UTC absoluto y se calculan
 * contra una timezone explícita. Construirlas con `new Date('2026-06-10T09:00')`
 * (hora del runner) e interpretarlas en otra zona mezclaba dos calendarios: la
 * suite pasaba en una Mac en CDMX y fallaba en un runner en Tokio, sin que el
 * código tuviera nada malo. Ver skill `timezone-handling`.
 */
const CDMX = 'America/Mexico_City';

/** Lectura de reloj de pared en una zona: para no assertar sobre getHours(). */
const wallClock = (date: Date, timeZone = CDMX) => {
	const parts = new Intl.DateTimeFormat('en-US', {
		timeZone,
		hourCycle: 'h23',
		weekday: 'short',
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
	}).formatToParts(date);
	const at = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
	return {
		weekday: at('weekday'),
		date: `${at('year')}-${at('month')}-${at('day')}`,
		time: `${at('hour')}:${at('minute')}`,
	};
};

describe('calculateNextOccurrence', () => {
	describe('weekly without explicit dayOfWeek', () => {
		// Regresión: antes, un dayOfWeek null caía a domingo (getDayNumber(null)===0),
		// haciendo que la próxima ocurrencia aterrizara entre +1 y +7 días según el día
		// de la semana del startDate. Eso rompía los topes de recurrenceEndDate de forma
		// no determinista. Ahora "weekly" sin día = siempre +7 días, sea cual sea el día.
		it('avanza exactamente +7 días sin importar el día de la semana del inicio', () => {
			// Domingo 7 de junio de 2026, 09:00 CDMX.
			const sunday = new Date('2026-06-07T15:00:00.000Z');
			for (let offset = 0; offset < 7; offset++) {
				const start = new Date(sunday.getTime() + offset * DAY_MS);
				const next = calculateNextOccurrence(start, 'weekly', 1, null, null, CDMX);
				expect(next).not.toBeNull();
				expect(daysBetween(start, next!)).toBe(7);
				// Mantiene el mismo día de la semana.
				expect(wallClock(next!).weekday).toBe(wallClock(start).weekday);
			}
		});

		it('respeta el interval (cada 2 semanas = +14 días)', () => {
			const start = new Date('2026-06-10T15:00:00.000Z'); // miércoles
			const next = calculateNextOccurrence(start, 'weekly', 2, null, null, CDMX);
			expect(daysBetween(start, next!)).toBe(14);
		});

		it('preserva la hora del inicio', () => {
			const start = new Date('2026-06-10T20:30:00.000Z'); // miércoles 14:30 CDMX
			const next = calculateNextOccurrence(start, 'weekly', 1, null, null, CDMX);
			expect(wallClock(next!).time).toBe('14:30');
		});
	});

	describe('weekly with explicit dayOfWeek', () => {
		it('salta al próximo día objetivo (no a +7 fijos)', () => {
			const start = new Date('2026-06-10T15:00:00.000Z'); // miércoles 09:00 CDMX
			// friday (5): (5-3+7)%7 = 2 días después
			const next = calculateNextOccurrence(start, 'weekly', 1, 'friday', null, CDMX);
			expect(daysBetween(start, next!)).toBe(2);
			expect(wallClock(next!).weekday).toBe('Fri');
		});

		it('si el día objetivo es el mismo del inicio, avanza una semana completa', () => {
			const start = new Date('2026-06-10T15:00:00.000Z'); // miércoles
			const next = calculateNextOccurrence(start, 'weekly', 1, 'wednesday', null, CDMX);
			expect(daysBetween(start, next!)).toBe(7);
		});
	});

	describe('recurrenceEndDate ceiling (caso de regresión)', () => {
		it('la próxima ocurrencia de un weekly sin día queda en +14d desde hoy y excede un tope a +10d', () => {
			const today = new Date('2026-06-05T15:00:00.000Z');
			const start = new Date(today.getTime() + 7 * DAY_MS);
			const endDate = new Date(today.getTime() + 10 * DAY_MS);

			const next = calculateNextOccurrence(start, 'weekly', 1, null, null, CDMX)!;
			expect(daysBetween(today, next)).toBe(14);
			expect(next.getTime()).toBeGreaterThan(endDate.getTime());
		});
	});

	describe('daily and monthly', () => {
		it('daily avanza interval días', () => {
			const start = new Date('2026-06-10T15:00:00.000Z');
			expect(
				daysBetween(start, calculateNextOccurrence(start, 'daily', 3, null, null, CDMX)!),
			).toBe(3);
		});

		it('monthly avanza un mes', () => {
			const start = new Date('2026-06-15T15:00:00.000Z'); // 15 de junio, 09:00 CDMX
			const next = calculateNextOccurrence(start, 'monthly', 1, null, null, CDMX)!;
			expect(wallClock(next).date).toBe('2026-07-15');
		});
	});

	it('devuelve null si no hay frecuencia', () => {
		expect(calculateNextOccurrence(new Date(), null, 1, null, null)).toBeNull();
	});
});

/**
 * Cobertura de zona horaria.
 *
 * `startDate` se guarda como instante UTC, así que el día de la semana que un
 * `Date` reporta con `getDay()` es el del proceso Node, no el que ven los
 * miembros de la community. En el server de producción (Etc/UTC) eso hacía que
 * una serie de los miércoles a las 19:45 CDMX (= 01:45Z del jueves) avanzara
 * 6 días en vez de 7 y se materializara todos los martes.
 *
 * Estos tests son deliberadamente **agnósticos a la TZ del runner** y a la vez
 * capaces de detectar una regresión desde cualquier runner: los casos de CDMX
 * (UTC-6) y de Tokio (UTC+9) tienen offsets de signo opuesto, así que no existe
 * ninguna zona de proceso en la que ambos pasen si el cálculo vuelve a leer los
 * getters locales de `Date`. Las aserciones son sobre el instante UTC absoluto
 * (`toISOString()`), nunca sobre `getDay()`/`getHours()` — que sí dependen del
 * runner (ver skill `timezone-handling`).
 */
describe('calculateNextOccurrence — timezone-aware', () => {
	const CDMX = 'America/Mexico_City';
	const TOKYO = 'Asia/Tokyo';
	const MADRID = 'Europe/Madrid';

	describe('regresión: la serie de los miércoles se corría al martes', () => {
		// Miércoles 2 de septiembre de 2026, 19:45 CDMX.
		const SEED = new Date('2026-09-03T01:45:00.000Z');

		it('avanza 7 días y no 6 cuando el instante UTC ya cayó en el día siguiente', () => {
			const next = calculateNextOccurrence(SEED, 'weekly', 1, 'wednesday', null, CDMX)!;
			// Miércoles 9 de septiembre, 19:45 CDMX.
			expect(next.toISOString()).toBe('2026-09-10T01:45:00.000Z');
		});

		it('mantiene el miércoles a lo largo de toda la cadena', () => {
			let cursor = SEED;
			const chain: string[] = [];
			for (let i = 0; i < 4; i++) {
				cursor = calculateNextOccurrence(cursor, 'weekly', 1, 'wednesday', null, CDMX)!;
				chain.push(cursor.toISOString());
			}
			expect(chain).toEqual([
				'2026-09-10T01:45:00.000Z', // mié 9
				'2026-09-17T01:45:00.000Z', // mié 16
				'2026-09-24T01:45:00.000Z', // mié 23
				'2026-10-01T01:45:00.000Z', // mié 30
			]);
		});

		it('la hora de la reunión no se mueve en la zona de la community', () => {
			const next = calculateNextOccurrence(SEED, 'weekly', 1, 'wednesday', null, CDMX)!;
			// Por partes, no por string: el separador que mete ICU entre el día y la
			// hora cambia entre versiones de Node y volvería frágil la aserción.
			const parts = new Intl.DateTimeFormat('en-US', {
				timeZone: CDMX,
				weekday: 'short',
				hour: '2-digit',
				minute: '2-digit',
				hourCycle: 'h23',
			}).formatToParts(next);
			const field = (t: string) => parts.find((p) => p.type === t)?.value;
			expect(field('weekday')).toBe('Wed');
			expect(`${field('hour')}:${field('minute')}`).toBe('19:45');
		});
	});

	describe('offset de signo opuesto (ninguna TZ de runner enmascara el bug)', () => {
		// Miércoles 2 de septiembre de 2026, 08:00 en Tokio = martes 23:00Z.
		const SEED = new Date('2026-09-01T23:00:00.000Z');

		it('resuelve el miércoles contra el calendario de Tokio, no el del proceso', () => {
			const next = calculateNextOccurrence(SEED, 'weekly', 1, 'wednesday', null, TOKYO)!;
			expect(next.toISOString()).toBe('2026-09-08T23:00:00.000Z');
		});
	});

	describe('DST', () => {
		it('weekly preserva la hora de pared al cruzar el cambio de horario de Madrid', () => {
			// Miércoles 25 de marzo, 20:00 CET (UTC+1). El domingo 29 empieza el
			// horario de verano, así que el miércoles siguiente son 20:00 CEST (UTC+2)
			// — el mismo reloj, una hora menos de UTC.
			const seed = new Date('2026-03-25T19:00:00.000Z');
			const next = calculateNextOccurrence(seed, 'weekly', 1, 'wednesday', null, MADRID)!;
			expect(next.toISOString()).toBe('2026-04-01T18:00:00.000Z');
		});

		it('daily preserva la hora de pared al cruzar el cambio de horario', () => {
			const seed = new Date('2026-03-28T19:00:00.000Z'); // sáb 28, 20:00 CET
			const next = calculateNextOccurrence(seed, 'daily', 1, null, null, MADRID)!;
			expect(next.toISOString()).toBe('2026-03-29T18:00:00.000Z'); // dom 29, 20:00 CEST
		});
	});

	describe('monthly', () => {
		it('respeta el día del mes en la zona de la community', () => {
			// Día 2 a las 19:45 CDMX; en UTC ese instante es el día 3.
			const seed = new Date('2026-09-03T01:45:00.000Z');
			const next = calculateNextOccurrence(seed, 'monthly', 1, null, 2, CDMX)!;
			expect(next.toISOString()).toBe('2026-10-03T01:45:00.000Z'); // 2 de octubre, 19:45
		});

		it('recorta al último día del mes en vez de desbordarse al mes siguiente', () => {
			// 31 de enero + 1 mes: `setMonth` aterrizaba en el 3 de marzo y el clamp
			// posterior medía marzo (31 días), dejando la serie en marzo.
			const seed = new Date('2026-01-31T16:00:00.000Z'); // 31 ene, 10:00 CDMX
			const next = calculateNextOccurrence(seed, 'monthly', 1, null, null, CDMX)!;
			expect(next.toISOString()).toBe('2026-02-28T16:00:00.000Z'); // 28 feb, 10:00
		});

		it('cruza el fin de año sin perder el mes', () => {
			const seed = new Date('2026-12-03T01:45:00.000Z'); // 2 dic, 19:45 CDMX
			const next = calculateNextOccurrence(seed, 'monthly', 1, null, 2, CDMX)!;
			expect(next.toISOString()).toBe('2027-01-03T01:45:00.000Z'); // 2 ene, 19:45
		});
	});

	it('sin timeZone explícita cae a CDMX', () => {
		const seed = new Date('2026-09-03T01:45:00.000Z');
		expect(calculateNextOccurrence(seed, 'weekly', 1, 'wednesday', null)!.toISOString()).toBe(
			calculateNextOccurrence(seed, 'weekly', 1, 'wednesday', null, CDMX)!.toISOString(),
		);
	});
});

/**
 * Semilla de la reunión por defecto de una community recién aprobada. Antes
 * construía la hora con `setHours()` sobre el reloj del proceso: en el server
 * UTC, "miércoles 19:45" quedaba guardado como 19:45Z, o sea 13:45 en CDMX.
 */
describe('nextWeekdayOccurrence', () => {
	const CDMX = 'America/Mexico_City';

	it('interpreta la hora en la zona de la community, no en la del proceso', () => {
		const from = new Date('2026-09-01T12:00:00.000Z'); // mar 1 sep, 06:00 CDMX
		const next = nextWeekdayOccurrence('wednesday', 19, 45, CDMX, from)!;
		expect(next.toISOString()).toBe('2026-09-03T01:45:00.000Z'); // mié 2, 19:45 CDMX
	});

	it('devuelve hoy mismo si el día coincide y la hora todavía no pasó', () => {
		const from = new Date('2026-09-03T00:00:00.000Z'); // mié 2 sep, 18:00 CDMX
		const next = nextWeekdayOccurrence('wednesday', 19, 45, CDMX, from)!;
		expect(next.toISOString()).toBe('2026-09-03T01:45:00.000Z');
	});

	it('salta a la semana siguiente si el día coincide pero la hora ya pasó', () => {
		const from = new Date('2026-09-03T02:00:00.000Z'); // mié 2 sep, 20:00 CDMX
		const next = nextWeekdayOccurrence('wednesday', 19, 45, CDMX, from)!;
		expect(next.toISOString()).toBe('2026-09-10T01:45:00.000Z');
	});

	it('respeta la zona aun cuando la fecha UTC ya avanzó de día', () => {
		// 01:00Z del jueves 3 = miércoles 19:00 en CDMX: la próxima reunión de los
		// miércoles a las 19:45 es la de hoy, dentro de 45 minutos.
		const from = new Date('2026-09-03T01:00:00.000Z');
		const next = nextWeekdayOccurrence('wednesday', 19, 45, CDMX, from)!;
		expect(next.toISOString()).toBe('2026-09-03T01:45:00.000Z');
	});

	it('devuelve null con un nombre de día inválido', () => {
		expect(nextWeekdayOccurrence('miercoles', 19, 45, CDMX)).toBeNull();
	});
});
