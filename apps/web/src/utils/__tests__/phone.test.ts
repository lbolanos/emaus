import { describe, it, expect } from 'vitest';
import { sanitizePhoneForWhatsapp, buildWhatsAppChatLink } from '../phone';

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

describe('buildWhatsAppChatLink', () => {
	/**
	 * Sin `text` WhatsApp abre la CONVERSACIÓN (y se ve el historial real);
	 * con `text` abre el compositor. La ausencia del parámetro es la feature,
	 * así que se fija con un test.
	 */
	it('no incluye el parámetro text', () => {
		const link = buildWhatsAppChatLink('+52 55 5999-9999');
		expect(link).toBe('https://api.whatsapp.com/send?phone=525559999999');
		expect(link).not.toContain('text=');
	});

	it('normaliza el número a solo dígitos', () => {
		expect(buildWhatsAppChatLink('(55) 5999 9999')).toBe(
			'https://api.whatsapp.com/send?phone=5559999999',
		);
		expect(buildWhatsAppChatLink('555.999.9999')).toBe(
			'https://api.whatsapp.com/send?phone=5559999999',
		);
	});

	it('devuelve null cuando no hay número, para poder ocultar el botón', () => {
		expect(buildWhatsAppChatLink('')).toBeNull();
		expect(buildWhatsAppChatLink('   ')).toBeNull();
		expect(buildWhatsAppChatLink(null)).toBeNull();
		expect(buildWhatsAppChatLink(undefined)).toBeNull();
		expect(buildWhatsAppChatLink('sin dígitos')).toBeNull();
	});
});
