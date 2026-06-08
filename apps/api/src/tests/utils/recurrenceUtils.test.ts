import { calculateNextOccurrence } from '@/utils/recurrenceUtils';

const DAY_MS = 24 * 60 * 60 * 1000;
const daysBetween = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / DAY_MS);

describe('calculateNextOccurrence', () => {
	describe('weekly without explicit dayOfWeek', () => {
		// Regresión: antes, un dayOfWeek null caía a domingo (getDayNumber(null)===0),
		// haciendo que la próxima ocurrencia aterrizara entre +1 y +7 días según el día
		// de la semana del startDate. Eso rompía los topes de recurrenceEndDate de forma
		// no determinista. Ahora "weekly" sin día = siempre +7 días, sea cual sea el día.
		it('avanza exactamente +7 días sin importar el día de la semana del inicio', () => {
			for (let offset = 0; offset < 7; offset++) {
				const start = new Date('2026-06-07T09:00:00'); // domingo
				start.setDate(start.getDate() + offset); // recorre los 7 días
				const next = calculateNextOccurrence(start, 'weekly', 1, null, null);
				expect(next).not.toBeNull();
				expect(daysBetween(start, next!)).toBe(7);
				// Mantiene el mismo día de la semana.
				expect(next!.getDay()).toBe(start.getDay());
			}
		});

		it('respeta el interval (cada 2 semanas = +14 días)', () => {
			const start = new Date('2026-06-10T09:00:00'); // miércoles
			const next = calculateNextOccurrence(start, 'weekly', 2, null, null);
			expect(daysBetween(start, next!)).toBe(14);
		});

		it('preserva la hora del inicio', () => {
			const start = new Date('2026-06-10T14:30:00');
			const next = calculateNextOccurrence(start, 'weekly', 1, null, null);
			expect(next!.getHours()).toBe(14);
			expect(next!.getMinutes()).toBe(30);
		});
	});

	describe('weekly with explicit dayOfWeek', () => {
		it('salta al próximo día objetivo (no a +7 fijos)', () => {
			const start = new Date('2026-06-10T09:00:00'); // miércoles (getDay()===3)
			// friday (5): (5-3+7)%7 = 2 días después
			const next = calculateNextOccurrence(start, 'weekly', 1, 'friday', null);
			expect(daysBetween(start, next!)).toBe(2);
			expect(next!.getDay()).toBe(5);
		});

		it('si el día objetivo es el mismo del inicio, avanza una semana completa', () => {
			const start = new Date('2026-06-10T09:00:00'); // miércoles
			const next = calculateNextOccurrence(start, 'weekly', 1, 'wednesday', null);
			expect(daysBetween(start, next!)).toBe(7);
		});
	});

	describe('recurrenceEndDate ceiling (caso de regresión)', () => {
		it('la próxima ocurrencia de un weekly sin día queda en +14d desde hoy y excede un tope a +10d', () => {
			const today = new Date('2026-06-05T09:00:00');
			const start = new Date(today);
			start.setDate(start.getDate() + 7); // +7d
			const endDate = new Date(today);
			endDate.setDate(endDate.getDate() + 10); // +10d

			const next = calculateNextOccurrence(start, 'weekly', 1, null, null)!;
			expect(daysBetween(today, next)).toBe(14);
			expect(next.getTime()).toBeGreaterThan(endDate.getTime());
		});
	});

	describe('daily and monthly', () => {
		it('daily avanza interval días', () => {
			const start = new Date('2026-06-10T09:00:00');
			expect(daysBetween(start, calculateNextOccurrence(start, 'daily', 3, null, null)!)).toBe(3);
		});

		it('monthly avanza un mes', () => {
			const start = new Date('2026-06-15T09:00:00');
			const next = calculateNextOccurrence(start, 'monthly', 1, null, null)!;
			expect(next.getMonth()).toBe(6); // julio (0-indexed)
			expect(next.getDate()).toBe(15);
		});
	});

	it('devuelve null si no hay frecuencia', () => {
		expect(calculateNextOccurrence(new Date(), null, 1, null, null)).toBeNull();
	});
});
