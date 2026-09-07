/**
 * Tests del helper compartido de cumpleaños durante el retiro.
 *
 * El caso que motivó extraerlo: la versión que alimentaba el aviso de
 * WalkersView pasaba el `birthDate` por `toISOString()`, así que un string con
 * hora y sin sufijo `Z` se corría de día. Aquí se fija que día y mes se leen
 * tal como vienen.
 */
import { describe, it, expect } from 'vitest';
import {
	parseCalendarDate,
	getBirthdayCelebration,
	hasBirthdayDuringRetreat,
	getBirthdaysDuringRetreat,
} from '../retreatBirthdays';

const RETREAT_START = '2026-05-14';
const RETREAT_END = '2026-05-17';

describe('parseCalendarDate', () => {
	it('lee los componentes de un YYYY-MM-DD', () => {
		expect(parseCalendarDate('1990-05-15')).toEqual({ year: 1990, month: 5, day: 15 });
	});

	it('ignora la hora del string', () => {
		expect(parseCalendarDate('1990-05-15T00:00:00')).toEqual({ year: 1990, month: 5, day: 15 });
		expect(parseCalendarDate('1990-05-15T23:30:00.000Z')).toEqual({ year: 1990, month: 5, day: 15 });
	});

	it('lee un Date por sus componentes UTC', () => {
		expect(parseCalendarDate(new Date('1990-05-15T00:00:00.000Z'))).toEqual({
			year: 1990,
			month: 5,
			day: 15,
		});
	});

	it('devuelve null para vacío, formato desconocido o fecha inválida', () => {
		expect(parseCalendarDate(null)).toBeNull();
		expect(parseCalendarDate(undefined)).toBeNull();
		expect(parseCalendarDate('')).toBeNull();
		expect(parseCalendarDate('15/05/1990')).toBeNull();
		expect(parseCalendarDate(new Date('no es fecha'))).toBeNull();
	});
});

describe('hasBirthdayDuringRetreat', () => {
	it('detecta el cumpleaños el primer día del retiro', () => {
		expect(hasBirthdayDuringRetreat('1990-05-14', RETREAT_START, RETREAT_END)).toBe(true);
	});

	it('detecta el cumpleaños el último día del retiro', () => {
		expect(hasBirthdayDuringRetreat('1990-05-17', RETREAT_START, RETREAT_END)).toBe(true);
	});

	it('detecta el cumpleaños en un día intermedio', () => {
		expect(hasBirthdayDuringRetreat('1990-05-15', RETREAT_START, RETREAT_END)).toBe(true);
	});

	it('no lo detecta un día antes ni un día después del retiro', () => {
		expect(hasBirthdayDuringRetreat('1990-05-13', RETREAT_START, RETREAT_END)).toBe(false);
		expect(hasBirthdayDuringRetreat('1990-05-18', RETREAT_START, RETREAT_END)).toBe(false);
	});

	it('no se corre de día cuando el string trae hora sin sufijo Z', () => {
		// La versión vieja hacía `new Date(...).toISOString()`: en zonas UTC+ eso
		// devolvía el día anterior y el 18 se colaba como si cayera en el retiro.
		expect(hasBirthdayDuringRetreat('1990-05-18T00:00:00', RETREAT_START, RETREAT_END)).toBe(false);
		expect(hasBirthdayDuringRetreat('1990-05-14T00:00:00', RETREAT_START, RETREAT_END)).toBe(true);
	});

	it('funciona cuando el retiro cruza el fin de mes', () => {
		expect(hasBirthdayDuringRetreat('1990-06-01', '2026-05-30', '2026-06-02')).toBe(true);
		expect(hasBirthdayDuringRetreat('1990-06-03', '2026-05-30', '2026-06-02')).toBe(false);
	});

	it('funciona cuando el retiro cruza el fin de año', () => {
		expect(hasBirthdayDuringRetreat('1990-01-01', '2026-12-30', '2027-01-02')).toBe(true);
		expect(hasBirthdayDuringRetreat('1990-12-31', '2026-12-30', '2027-01-02')).toBe(true);
	});

	it('devuelve false sin fecha de nacimiento o sin fechas del retiro', () => {
		expect(hasBirthdayDuringRetreat(null, RETREAT_START, RETREAT_END)).toBe(false);
		expect(hasBirthdayDuringRetreat('1990-05-15', null, RETREAT_END)).toBe(false);
		expect(hasBirthdayDuringRetreat('1990-05-15', RETREAT_START, undefined)).toBe(false);
	});
});

describe('getBirthdayCelebration', () => {
	it('devuelve el día del retiro y los años que cumple', () => {
		const celebration = getBirthdayCelebration('1990-05-15', RETREAT_START, RETREAT_END);
		expect(celebration).not.toBeNull();
		expect(celebration!.turningAge).toBe(36);
		expect(celebration!.date.getFullYear()).toBe(2026);
		expect(celebration!.date.getMonth() + 1).toBe(5);
		expect(celebration!.date.getDate()).toBe(15);
	});

	it('cuenta la edad contra el año del día en que cae, no el de inicio', () => {
		// Retiro que arranca en 2026 y termina en 2027: quien cumple el 1 de enero
		// suma un año más que quien lo cumple el 31 de diciembre.
		const enDiciembre = getBirthdayCelebration('1990-12-31', '2026-12-30', '2027-01-02');
		const enEnero = getBirthdayCelebration('1990-01-01', '2026-12-30', '2027-01-02');
		expect(enDiciembre!.turningAge).toBe(36);
		expect(enEnero!.turningAge).toBe(37);
	});
});

describe('getBirthdaysDuringRetreat', () => {
	const walkers = [
		{ id: '1', firstName: 'Ana', birthDate: '1990-05-17' },
		{ id: '2', firstName: 'Beto', birthDate: '1985-05-15' },
		{ id: '3', firstName: 'Carla', birthDate: '1992-08-20' },
		{ id: '4', firstName: 'Dani', birthDate: null },
	];

	it('deja solo a los que cumplen dentro del retiro, ordenados por día', () => {
		const result = getBirthdaysDuringRetreat(walkers, RETREAT_START, RETREAT_END);
		expect(result.map((r) => r.participant.firstName)).toEqual(['Beto', 'Ana']);
		expect(result.map((r) => r.turningAge)).toEqual([41, 36]);
	});

	it('devuelve una lista vacía si el retiro no tiene fechas', () => {
		expect(getBirthdaysDuringRetreat(walkers, null, null)).toEqual([]);
	});
});
