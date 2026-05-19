import { describe, it, expect } from 'vitest';
import { sanitizePhoneForWhatsapp } from '../phone';

describe('sanitizePhoneForWhatsapp', () => {
	it('quita el signo + del prefijo internacional', () => {
		expect(sanitizePhoneForWhatsapp('+525559999999')).toBe('525559999999');
	});

	it('quita espacios', () => {
		expect(sanitizePhoneForWhatsapp('+52 55 5999 9999')).toBe('525559999999');
	});

	it('quita guiones', () => {
		expect(sanitizePhoneForWhatsapp('555-999-9999')).toBe('5559999999');
	});

	it('quita paréntesis', () => {
		expect(sanitizePhoneForWhatsapp('(55) 5999 9999')).toBe('5559999999');
	});

	it('quita puntos', () => {
		expect(sanitizePhoneForWhatsapp('555.999.9999')).toBe('5559999999');
	});

	it('mezcla todos los separadores comunes', () => {
		expect(sanitizePhoneForWhatsapp('+52 (55) 5999-9999')).toBe('525559999999');
	});

	it('quita letras', () => {
		expect(sanitizePhoneForWhatsapp('555 9999 ext 12')).toBe('555999912');
	});

	it('preserva el número limpio sin cambios', () => {
		expect(sanitizePhoneForWhatsapp('5559999999')).toBe('5559999999');
	});

	it('devuelve string vacío para null', () => {
		expect(sanitizePhoneForWhatsapp(null)).toBe('');
	});

	it('devuelve string vacío para undefined', () => {
		expect(sanitizePhoneForWhatsapp(undefined)).toBe('');
	});

	it('devuelve string vacío cuando input solo tiene espacios', () => {
		expect(sanitizePhoneForWhatsapp('   ')).toBe('');
	});

	it('devuelve string vacío cuando input solo tiene caracteres no-numéricos', () => {
		expect(sanitizePhoneForWhatsapp('+()- ')).toBe('');
	});

	it('tolera número como string con whitespace alrededor', () => {
		expect(sanitizePhoneForWhatsapp('  5559999999  ')).toBe('5559999999');
	});
});
