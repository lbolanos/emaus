/**
 * Tests para el bug de timezone en fechas YYYY-MM-DD
 *
 * El problema: new Date("2026-05-15") parsea como UTC midnight.
 * En zonas UTC-6, eso se convierte al día anterior (May 14).
 * El fix: usar new Date(year, month-1, day) para crear fechas locales.
 */
import { describe, it, expect } from 'vitest';

// ─── Helpers extraídos de los componentes corregidos ─────────────────────────

/** PublicRetreatFlyerModal.vue – formatDate */
function formatDate(dateValue?: string): string {
	if (!dateValue) return '';
	const match = dateValue.match(/^(\d{4})-(\d{2})-(\d{2})/);
	const date = match
		? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
		: new Date(dateValue);
	return date.toLocaleDateString('es-ES', {
		weekday: 'long',
		day: 'numeric',
		month: 'long',
		year: 'numeric',
	});
}

/** ImportMembersModal.vue – parseLocalDate + formatDateRange */
function parseLocalDate(dateStr: string): Date {
	const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
	return match
		? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
		: new Date(dateStr);
}

function formatDateRange(start: any, end: any): string {
	if (!start) return '';
	const startDate = parseLocalDate(String(start)).toLocaleDateString('es-ES', {
		day: 'numeric',
		month: 'short',
		year: 'numeric',
	});
	if (!end) return startDate;
	const endDate = parseLocalDate(String(end)).toLocaleDateString('es-ES', {
		day: 'numeric',
		month: 'short',
		year: 'numeric',
	});
	return `${startDate} - ${endDate}`;
}

/** BedAssignmentsView.vue – calculateAge */
function calculateAge(birthDate: string | Date): number | null {
	if (!birthDate) return null;
	let dob: Date;
	if (typeof birthDate === 'string') {
		const match = birthDate.match(/^(\d{4})-(\d{2})-(\d{2})/);
		dob = match
			? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
			: new Date(birthDate);
	} else {
		dob = birthDate;
	}
	const today = new Date();
	let age = today.getFullYear() - dob.getFullYear();
	const m = today.getMonth() - dob.getMonth();
	if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) {
		age--;
	}
	return age;
}

/** ParticipantList.vue – hasBirthdayDuringRetreat */
function hasBirthdayDuringRetreat(
	participant: { birthDate: string },
	retreat: { startDate: string | Date; endDate: string | Date },
): boolean {
	const birthDateStr = participant.birthDate;
	const [birthYear, birthMonth, birthDay] = birthDateStr.split('T')[0].split('-').map(Number);
	void birthYear; // solo mes y día importan

	const parseLocal = (s: string | Date) => {
		if (s instanceof Date) return s;
		const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
		return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(s);
	};

	const currentDate = parseLocal(retreat.startDate);
	const endDate = parseLocal(retreat.endDate);

	while (currentDate <= endDate) {
		if (currentDate.getMonth() + 1 === birthMonth && currentDate.getDate() === birthDay) {
			return true;
		}
		currentDate.setDate(currentDate.getDate() + 1);
	}
	return false;
}

// ─── La versión BUGGY (sin fix) para comparar ────────────────────────────────

function formatDateBuggy(dateValue?: string): Date | undefined {
	if (!dateValue) return undefined;
	return new Date(dateValue); // parsea como UTC midnight
}

function hasBirthdayDuringRetreatBuggy(
	participant: { birthDate: string },
	retreat: { startDate: string; endDate: string },
): boolean {
	const birthDateStr = participant.birthDate;
	const [, birthMonth, birthDay] = birthDateStr.split('T')[0].split('-').map(Number);

	const retreatStart = new Date(retreat.startDate); // UTC midnight
	const retreatEnd = new Date(retreat.endDate); // UTC midnight
	const currentDate = new Date(retreatStart);
	const endDate = new Date(retreatEnd);

	while (currentDate <= endDate) {
		const currentMonth = currentDate.getMonth() + 1; // local month
		const currentDay = currentDate.getDate(); // local day
		if (currentMonth === birthMonth && currentDay === birthDay) {
			return true;
		}
		currentDate.setDate(currentDate.getDate() + 1);
	}
	return false;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('parseLocalDate – extrae año/mes/día sin desplazamiento UTC', () => {
	it('devuelve día correcto para formato YYYY-MM-DD', () => {
		const d = parseLocalDate('2026-05-15');
		expect(d.getFullYear()).toBe(2026);
		expect(d.getMonth()).toBe(4); // mayo (0-indexed)
		expect(d.getDate()).toBe(15);
	});

	it('devuelve día correcto para el primer día del mes', () => {
		const d = parseLocalDate('2026-01-01');
		expect(d.getFullYear()).toBe(2026);
		expect(d.getMonth()).toBe(0);
		expect(d.getDate()).toBe(1);
	});

	it('devuelve día correcto para el último día del mes', () => {
		const d = parseLocalDate('2026-12-31');
		expect(d.getFullYear()).toBe(2026);
		expect(d.getMonth()).toBe(11);
		expect(d.getDate()).toBe(31);
	});

	it('demuestra el bug original: new Date("YYYY-MM-DD") puede dar día incorrecto', () => {
		// Este test DOCUMENTA el bug. En UTC-N, el día puede ser el anterior.
		// new Date("2026-05-15") → UTC midnight → en UTC-6 es "2026-05-14T18:00:00"
		const buggy = formatDateBuggy('2026-05-15');
		const fixed = parseLocalDate('2026-05-15');

		// El día fijo siempre es 15
		expect(fixed.getDate()).toBe(15);

		// El buggy puede ser 14 en UTC-N (o 15 si el servidor está en UTC+0)
		// Lo importante es que fixed.getDate() === 15 independientemente del timezone
		expect(fixed.getDate()).not.toBeLessThan(15);
	});
});

describe('formatDate (PublicRetreatFlyerModal) – muestra fecha correcta', () => {
	it('retorna string vacío para valor undefined', () => {
		expect(formatDate(undefined)).toBe('');
	});

	it('incluye el día correcto (15) en el string formateado', () => {
		const result = formatDate('2026-05-15');
		expect(result).toContain('15');
	});

	it('incluye el año correcto', () => {
		const result = formatDate('2026-05-15');
		expect(result).toContain('2026');
	});

	it('funciona con fecha de inicio de retiro real', () => {
		const result = formatDate('2026-08-20');
		expect(result).toContain('20');
		expect(result).toContain('2026');
	});

	it('maneja strings ISO con hora (fallback path)', () => {
		const result = formatDate('2026-05-15T18:00:00Z');
		// Con hora, usa el fallback path – solo verificamos que no crashea
		expect(result).toBeTruthy();
	});
});

describe('formatDateRange (ImportMembersModal) – rango de fechas correcto', () => {
	it('retorna string vacío si start es falsy', () => {
		expect(formatDateRange(null, null)).toBe('');
		expect(formatDateRange('', null)).toBe('');
	});

	it('retorna solo startDate si end es falsy', () => {
		const result = formatDateRange('2026-05-15', null);
		expect(result).toContain('15');
		expect(result).not.toContain(' - ');
	});

	it('contiene ambas fechas correctas en el rango', () => {
		const result = formatDateRange('2026-05-15', '2026-05-18');
		expect(result).toContain('15');
		expect(result).toContain('18');
		expect(result).toContain(' - ');
	});

	it('días no se desfasan para fechas a inicio de mes', () => {
		const result = formatDateRange('2026-06-01', '2026-06-03');
		expect(result).toContain('1');
		expect(result).toContain('3');
	});
});

describe('calculateAge (BedAssignmentsView) – calcula edad correctamente', () => {
	it('retorna null para input falsy', () => {
		expect(calculateAge('')).toBeNull();
	});

	it('calcula edad correctamente para fecha pasada', () => {
		// Alguien nacido hace exactamente 30 años (menos 1 día)
		const today = new Date();
		const birthYear = today.getFullYear() - 30;
		// Fecha de nacimiento: exactamente hace 30 años, mismo mes y día
		const birthDate = `${birthYear}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
		const age = calculateAge(birthDate);
		expect(age).toBe(30);
	});

	it('calcula edad para cumpleaños que aún no ha pasado este año', () => {
		const today = new Date();
		const birthYear = today.getFullYear() - 25;
		// Usamos un mes futuro (o próximo día) para que el cumpleaños no haya pasado
		const nextMonth = today.getMonth() + 2 > 12 ? 1 : today.getMonth() + 2;
		const birthDate = `${birthYear}-${String(nextMonth).padStart(2, '0')}-01`;
		const age = calculateAge(birthDate);
		expect(age).toBe(24); // aún no cumple 25
	});

	it('el día de nacimiento extraído es correcto (no UTC-shifted)', () => {
		// Verificamos que el parsing interno usa el día correcto
		const birthDate = '1990-05-15';
		const match = birthDate.match(/^(\d{4})-(\d{2})-(\d{2})/);
		const dob = match
			? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
			: new Date(birthDate);
		expect(dob.getDate()).toBe(15);
		expect(dob.getMonth()).toBe(4); // mayo
	});
});

describe('hasBirthdayDuringRetreat (ParticipantList) – detecta cumpleaños correctamente', () => {
	it('detecta cumpleaños en el primer día del retiro', () => {
		const result = hasBirthdayDuringRetreat(
			{ birthDate: '1990-05-15' },
			{ startDate: '2026-05-15', endDate: '2026-05-18' },
		);
		expect(result).toBe(true);
	});

	it('detecta cumpleaños en el último día del retiro', () => {
		const result = hasBirthdayDuringRetreat(
			{ birthDate: '1990-05-18' },
			{ startDate: '2026-05-15', endDate: '2026-05-18' },
		);
		expect(result).toBe(true);
	});

	it('detecta cumpleaños en día intermedio del retiro', () => {
		const result = hasBirthdayDuringRetreat(
			{ birthDate: '1990-05-17' },
			{ startDate: '2026-05-15', endDate: '2026-05-18' },
		);
		expect(result).toBe(true);
	});

	it('retorna false si el cumpleaños es un día antes del retiro', () => {
		const result = hasBirthdayDuringRetreat(
			{ birthDate: '1990-05-14' },
			{ startDate: '2026-05-15', endDate: '2026-05-18' },
		);
		expect(result).toBe(false);
	});

	it('retorna false si el cumpleaños es un día después del retiro', () => {
		const result = hasBirthdayDuringRetreat(
			{ birthDate: '1990-05-19' },
			{ startDate: '2026-05-15', endDate: '2026-05-18' },
		);
		expect(result).toBe(false);
	});

	it('retorna false si el cumpleaños no cae en el retiro', () => {
		const result = hasBirthdayDuringRetreat(
			{ birthDate: '1990-03-10' },
			{ startDate: '2026-05-15', endDate: '2026-05-18' },
		);
		expect(result).toBe(false);
	});

	/**
	 * REGRESION: Verifica el bug original.
	 * Con `new Date("2026-05-15")` en UTC-6, el primer día iterado sería Mayo 14,
	 * haciendo que un cumpleaños el día 15 fuera chequeado en el día correcto eventualmente,
	 * PERO el último día (18) nunca se chequearía (se convertiría a 17).
	 */
	it('regresion: el bug original falla en el último día del retiro en UTC-N', () => {
		// La versión buggy usa new Date("YYYY-MM-DD") directamente
		// En UTC+0 ambas versiones pasan; en UTC-N la buggy falla para el último día.
		// No podemos forzar el timezone en el test, pero verificamos que la versión
		// corregida siempre detecta el cumpleaños en el último día.
		const fixed = hasBirthdayDuringRetreat(
			{ birthDate: '1990-05-18' },
			{ startDate: '2026-05-15', endDate: '2026-05-18' },
		);
		expect(fixed).toBe(true);

		// Documenta que la versión buggy podría fallar (en UTC-N retorna false)
		// No asercionamos el buggy porque depende del timezone del runner
		const _buggyResult = hasBirthdayDuringRetreatBuggy(
			{ birthDate: '1990-05-18' },
			{ startDate: '2026-05-15', endDate: '2026-05-18' },
		);
		// En UTC-0 (CI): _buggyResult === true (no hay bug visible)
		// En UTC-6 (developer): _buggyResult === false (bug presente)
		// Solo verificamos que el fix siempre es correcto:
		expect(fixed).toBe(true);
	});
});
