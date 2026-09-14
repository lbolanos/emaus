import { describe, it, expect } from 'vitest';
import { sanitizePhoneForWhatsapp, buildWhatsAppChatLink, buildWhatsAppSendLink } from '../phone';

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
			'https://api.whatsapp.com/send?phone=525559999999',
		);
		expect(buildWhatsAppChatLink('555.999.9999')).toBe(
			'https://api.whatsapp.com/send?phone=525559999999',
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

describe('buildWhatsAppChatLink con lada (código de país)', () => {
	/**
	 * La base guarda el número NACIONAL (sin lada) pero el deep link exige
	 * formato internacional: sin la lada, `phone=5549…` se lee como país "55"
	 * (Brasil). El helper antepone la lada del país del participante.
	 */
	it('antepone la lada a un número nacional de 10 dígitos (caso dominante en la DB)', () => {
		expect(buildWhatsAppChatLink('5549442834', 'México')).toBe(
			'https://api.whatsapp.com/send?phone=525549442834',
		);
	});

	it('sin país asume México (casa default America/Mexico_City)', () => {
		expect(buildWhatsAppChatLink('5549442834')).toBe(
			'https://api.whatsapp.com/send?phone=525549442834',
		);
		expect(buildWhatsAppChatLink('5549442834', 'N/A')).toBe(
			'https://api.whatsapp.com/send?phone=525549442834',
		);
	});

	it('no duplica la lada cuando el número ya la trae (filas legacy)', () => {
		expect(buildWhatsAppChatLink('525549442834', 'MX')).toBe(
			'https://api.whatsapp.com/send?phone=525549442834',
		);
		expect(buildWhatsAppChatLink('+52 55 4944 2834', 'México')).toBe(
			'https://api.whatsapp.com/send?phone=525549442834',
		);
	});

	it('un nacional que empieza con 52 recibe la lada igual (decisión por longitud, no prefijo)', () => {
		expect(buildWhatsAppChatLink('5244123456', 'MX')).toBe(
			'https://api.whatsapp.com/send?phone=525244123456',
		);
	});

	it('normaliza el móvil MX legado 521 + 10 dígitos a 52 + 10', () => {
		expect(buildWhatsAppChatLink('5215549442834', 'MX')).toBe(
			'https://api.whatsapp.com/send?phone=525549442834',
		);
	});

	it('usa la lada de otros países cuando el registro los declara', () => {
		expect(buildWhatsAppChatLink('3001234567', 'Colombia')).toBe(
			'https://api.whatsapp.com/send?phone=573001234567',
		);
		expect(buildWhatsAppChatLink('(415) 555-2671', 'US')).toBe(
			'https://api.whatsapp.com/send?phone=14155552671',
		);
	});

	it('anteponer la lada también limpia los caracteres invisibles bidi de iOS', () => {
		expect(buildWhatsAppChatLink('‭5549442834‬', 'MX')).toBe(
			'https://api.whatsapp.com/send?phone=525549442834',
		);
	});

	it('devuelve los dígitos tal cual cuando el largo no casa con ninguna regla del país', () => {
		// 8 dígitos con país MX: no es nacional válido ni trae lada reconocible.
		// No se inventa nada — WhatsApp dirá lo que tenga que decir.
		expect(buildWhatsAppChatLink('55494428', 'MX')).toBe(
			'https://api.whatsapp.com/send?phone=55494428',
		);
	});
});

describe('buildWhatsAppSendLink — envío con texto precargado', () => {
	/**
	 * Los envíos asistidos (cola, recordatorio de saldo, secuencias, envío
	 * manual) comparten el requisito de lada del chat link, más el `text` con
	 * el mensaje URL-encoded.
	 */
	it('antepone la lada y codifica el texto', () => {
		expect(buildWhatsAppSendLink('5549442834', 'Hola Juan', 'México')).toBe(
			'https://api.whatsapp.com/send?phone=525549442834&text=Hola%20Juan',
		);
	});

	it('codifica acentos y signos de apertura del español', () => {
		const text = '¿Cómo estás? ¡Nos vemos!';
		expect(buildWhatsAppSendLink('5549442834', text, 'MX')).toBe(
			`https://api.whatsapp.com/send?phone=525549442834&text=${encodeURIComponent(text)}`,
		);
	});

	it('no duplica la lada cuando el número ya la trae', () => {
		expect(buildWhatsAppSendLink('+52 55 4944 2834', 'msg', 'MX')).toBe(
			'https://api.whatsapp.com/send?phone=525549442834&text=msg',
		);
	});

	it('sin país asume México, como el chat link', () => {
		expect(buildWhatsAppSendLink('5549442834', 'msg', null)).toBe(
			'https://api.whatsapp.com/send?phone=525549442834&text=msg',
		);
	});

	it('usa la lada de otros países cuando el registro los declara', () => {
		expect(buildWhatsAppSendLink('3001234567', 'msg', 'Colombia')).toBe(
			'https://api.whatsapp.com/send?phone=573001234567&text=msg',
		);
	});

	it('sin dígitos devuelve null (el llamador no abre un link muerto)', () => {
		expect(buildWhatsAppSendLink('sin número', 'msg', 'MX')).toBeNull();
		expect(buildWhatsAppSendLink(null, 'msg')).toBeNull();
		expect(buildWhatsAppSendLink('', 'msg', 'México')).toBeNull();
	});
});
