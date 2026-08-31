import {
	daysUntilBirthday,
	formatBirthdayEs,
	isPlaceholderBirthDate,
	normalizeBirthdayValue,
	resolveMemberBirthday,
	splitBirthdayValue,
	turningAge,
} from '@repo/utils';

/**
 * Helpers de cumpleaños de miembros de comunidad. Todo el cálculo va sobre
 * strings 'MM-DD' y componentes de calendario — nada de `Date` — así que estos
 * tests no dependen de la zona horaria en que corran.
 */
describe('normalizeBirthdayValue', () => {
	it('acepta el formato con año y el formato sin año', () => {
		expect(normalizeBirthdayValue('1985-03-14')).toBe('1985-03-14');
		expect(normalizeBirthdayValue('03-14')).toBe('03-14');
		expect(normalizeBirthdayValue('  03-14  ')).toBe('03-14');
	});

	it('rechaza fechas que no existen en el calendario', () => {
		expect(normalizeBirthdayValue('13-01')).toBeNull(); // mes 13
		expect(normalizeBirthdayValue('02-31')).toBeNull(); // 31 de febrero
		expect(normalizeBirthdayValue('04-31')).toBeNull(); // abril tiene 30
		expect(normalizeBirthdayValue('2025-02-29')).toBeNull(); // 2025 no es bisiesto
	});

	it('admite el 29 de febrero sin año, pero solo con año bisiesto', () => {
		expect(normalizeBirthdayValue('02-29')).toBe('02-29');
		expect(normalizeBirthdayValue('2024-02-29')).toBe('2024-02-29');
		expect(normalizeBirthdayValue('2023-02-29')).toBeNull();
	});

	it('rechaza basura y años imposibles', () => {
		expect(normalizeBirthdayValue('')).toBeNull();
		expect(normalizeBirthdayValue('mañana')).toBeNull();
		expect(normalizeBirthdayValue('14/03/1985')).toBeNull();
		expect(normalizeBirthdayValue('1899-01-01')).toBeNull();
		expect(normalizeBirthdayValue(null)).toBeNull();
	});
});

describe('splitBirthdayValue', () => {
	it('separa día/mes y año', () => {
		expect(splitBirthdayValue('1985-03-14')).toEqual({ monthDay: '03-14', year: 1985 });
		expect(splitBirthdayValue('03-14')).toEqual({ monthDay: '03-14', year: null });
		expect(splitBirthdayValue('')).toEqual({ monthDay: null, year: null });
	});
});

describe('isPlaceholderBirthDate', () => {
	const now = new Date('2026-08-31T12:00:00Z');

	it('detecta el relleno del alta: birthDate igual al día de registro', () => {
		// Así nace todo Participant creado desde el flujo de comunidad: la columna
		// es NOT NULL y el service le pone `new Date()`.
		expect(
			isPlaceholderBirthDate('2024-05-10', new Date('2024-05-10T18:30:00Z'), now),
		).toBe(true);
	});

	it('detecta una edad imposible aunque no haya fecha de registro', () => {
		expect(isPlaceholderBirthDate('2026-01-15', null, now)).toBe(true);
		expect(isPlaceholderBirthDate('2023-01-15', undefined, now)).toBe(true);
	});

	it('acepta una fecha de nacimiento real', () => {
		expect(
			isPlaceholderBirthDate('1985-03-14', new Date('2024-05-10T18:30:00Z'), now),
		).toBe(false);
	});

	it('trata la ausencia de fecha como relleno', () => {
		expect(isPlaceholderBirthDate(null, null, now)).toBe(true);
		expect(isPlaceholderBirthDate('no-es-fecha', null, now)).toBe(true);
	});
});

describe('resolveMemberBirthday', () => {
	const now = new Date('2026-08-31T12:00:00Z');

	it('el overlay de la comunidad gana sobre el participant', () => {
		expect(
			resolveMemberBirthday(
				{
					birthDate: '03-14',
					participant: { birthDate: '1990-07-01', registrationDate: '2024-01-01' },
				},
				now,
			),
		).toEqual({ monthDay: '03-14', year: null });
	});

	it('hereda la fecha del participant cuando es creíble', () => {
		expect(
			resolveMemberBirthday(
				{
					birthDate: null,
					participant: {
						birthDate: new Date('1990-07-01T00:00:00Z'),
						registrationDate: new Date('2024-01-01T00:00:00Z'),
					},
				},
				now,
			),
		).toEqual({ monthDay: '07-01', year: 1990 });
	});

	it('NO hereda el relleno automático del alta', () => {
		// El caso que hace útil toda la feature: sin este descarte, el sistema
		// felicitaría a media comunidad en el aniversario de su registro.
		expect(
			resolveMemberBirthday(
				{
					birthDate: null,
					participant: {
						birthDate: '2024-05-10',
						registrationDate: '2024-05-10T18:30:00Z',
					},
				},
				now,
			),
		).toEqual({ monthDay: null, year: null });
	});

	it('devuelve "sin fecha" cuando no hay nada', () => {
		expect(resolveMemberBirthday({ birthDate: null, participant: null }, now)).toEqual({
			monthDay: null,
			year: null,
		});
	});
});

describe('daysUntilBirthday', () => {
	it('cuenta 0 el día del cumpleaños', () => {
		expect(daysUntilBirthday('03-14', { year: 2026, month: 3, day: 14 })).toBe(0);
	});

	it('cuenta los días dentro del mismo año', () => {
		expect(daysUntilBirthday('03-20', { year: 2026, month: 3, day: 14 })).toBe(6);
	});

	it('cruza el fin de año sin romperse', () => {
		// El bug clásico de comparar 'MM-DD': enero parece "pasado" frente a diciembre.
		expect(daysUntilBirthday('01-05', { year: 2026, month: 12, day: 28 })).toBe(8);
		expect(daysUntilBirthday('01-01', { year: 2026, month: 12, day: 31 })).toBe(1);
	});

	it('cuenta el cumpleaños de ayer como el del año que viene', () => {
		expect(daysUntilBirthday('03-13', { year: 2026, month: 3, day: 14 })).toBe(364);
	});

	it('celebra el 29 de febrero el día 28 en los años no bisiestos', () => {
		// 2026 no es bisiesto → se cuenta el 28.
		expect(daysUntilBirthday('02-29', { year: 2026, month: 2, day: 28 })).toBe(0);
		// 2028 sí lo es → el 28 falta un día.
		expect(daysUntilBirthday('02-29', { year: 2028, month: 2, day: 28 })).toBe(1);
	});

	it('devuelve null sin fecha', () => {
		expect(daysUntilBirthday(null, { year: 2026, month: 3, day: 14 })).toBeNull();
		expect(daysUntilBirthday('basura', { year: 2026, month: 3, day: 14 })).toBeNull();
	});
});

describe('turningAge', () => {
	it('calcula la edad del próximo cumpleaños', () => {
		expect(turningAge({ monthDay: '03-14', year: 1985 }, { year: 2026, month: 3, day: 1 })).toBe(41);
	});

	it('cuenta el año siguiente si el cumpleaños ya pasó', () => {
		expect(turningAge({ monthDay: '03-14', year: 1985 }, { year: 2026, month: 6, day: 1 })).toBe(42);
	});

	it('devuelve null si no se conoce el año', () => {
		expect(turningAge({ monthDay: '03-14', year: null }, { year: 2026, month: 3, day: 1 })).toBeNull();
	});
});

describe('formatBirthdayEs', () => {
	it('formatea con y sin año', () => {
		expect(formatBirthdayEs({ monthDay: '03-14', year: null })).toBe('14 de marzo');
		expect(formatBirthdayEs({ monthDay: '03-14', year: 1985 })).toBe('14 de marzo de 1985');
		expect(formatBirthdayEs({ monthDay: '01-01', year: null })).toBe('1 de enero');
	});

	it('devuelve null sin fecha', () => {
		expect(formatBirthdayEs({ monthDay: null, year: null })).toBeNull();
	});
});
