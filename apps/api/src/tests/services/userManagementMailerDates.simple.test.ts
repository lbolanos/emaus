import { formatDateOnly } from '@/services/userManagementMailer';

/**
 * `retreat.startDate` / `endDate` son `@Column('date')`: fechas sin hora, que
 * TypeORM devuelve como medianoche UTC. Formatearlas sin `timeZone: 'UTC'` las
 * corre al día anterior en cualquier offset negativo — CDMX incluida —, así que
 * la invitación por correo anunciaba el retiro un día antes.
 *
 * El test compara contra la fecha nominal, no contra lo que el reloj del runner
 * opine de ese instante. Detecta la regresión desde cualquier runner con offset
 * distinto de cero; bajo `TZ=UTC` pasa igual con y sin el fix, porque ahí no hay
 * corrimiento que observar — el fallo es latente en producción (server UTC) y
 * visible en desarrollo (CDMX).
 */
describe('formatDateOnly (fechas de retiro en correos de gestión de usuarios)', () => {
	it('no corre la fecha al día anterior', () => {
		expect(formatDateOnly(new Date('2026-08-28T00:00:00.000Z'))).toBe('28/8/2026');
	});

	it('acepta la string cruda de SQLite', () => {
		expect(formatDateOnly('2026-08-28')).toBe('28/8/2026');
	});

	it('respeta el cruce de mes', () => {
		expect(formatDateOnly(new Date('2026-09-01T00:00:00.000Z'))).toBe('1/9/2026');
	});

	it('respeta el cruce de año', () => {
		expect(formatDateOnly(new Date('2027-01-01T00:00:00.000Z'))).toBe('1/1/2027');
	});

	it('devuelve cadena vacía cuando no hay fecha', () => {
		expect(formatDateOnly(null)).toBe('');
		expect(formatDateOnly(undefined)).toBe('');
	});
});
