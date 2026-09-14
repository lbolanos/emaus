import {
	PHONE_CALLING_CODE_BY_COUNTRY,
	PHONE_DIGIT_LENGTHS_BY_COUNTRY,
	resolveCountryToIso,
} from '@repo/types';

/**
 * Limpia un número de teléfono para usarlo en URL de WhatsApp.
 *
 * WhatsApp API (`api.whatsapp.com/send?phone=...`) acepta SOLO dígitos.
 * Cualquier carácter no numérico — espacios, guiones, paréntesis, signo `+`,
 * puntos, letras — rompe el deep link y resulta en "número inválido" en la
 * app móvil.
 *
 * Conserva TODOS los dígitos (incluyendo prefijo de país) y descarta el resto.
 * Devuelve string vacío si el input está vacío o queda sin dígitos.
 *
 * Ejemplos:
 *   "+52 55 5999-9999"   → "525559999999"
 *   "(55) 5999 9999"     → "5559999999"
 *   "555.999.9999"       → "5559999999"
 *   "  "                 → ""
 *   null / undefined     → ""
 */
export function sanitizePhoneForWhatsapp(raw: string | null | undefined): string {
	if (!raw) return '';
	return String(raw).replace(/\D/g, '');
}

/**
 * Completa la lada (código de país) de un número de SOLO dígitos.
 *
 * La base guarda el número NACIONAL (sin lada): la validación del registro
 * recorta `+52`/`044` antes de persistir (verificado en la dev DB: 468 de 513
 * celulares tienen 10 dígitos, sólo 3 traen el `52`). Pero el deep link de
 * WhatsApp exige formato internacional — sin lada, `phone=5549…` se interpreta
 * como país "55" (Brasil) y abre un chat equivocado o "número inválido".
 *
 * La decisión es por LONGITUD TOTAL, no por prefijo: un nacional mexicano de 10
 * dígitos que empiece en "52" (p.ej. área 52x) debe recibir la lada, no
 * confundirse con un número que ya la trae.
 *
 * Largos que no casan con ninguna regla del país se devuelven tal cual: no se
 * inventa un número que WhatsApp pueda resolver a un desconocido.
 */
function withCallingCode(digits: string, iso: string): string {
	const lengths = PHONE_DIGIT_LENGTHS_BY_COUNTRY[iso];
	const code = PHONE_CALLING_CODE_BY_COUNTRY[iso];
	if (!lengths || !code) return digits;

	// Ya trae la lada: lada + longitud nacional válida.
	if (digits.startsWith(code) && lengths.includes(digits.length - code.length)) {
		return digits;
	}
	// Número nacional a secas: anteponer la lada.
	if (lengths.includes(digits.length)) {
		return `${code}${digits}`;
	}
	// Móvil MX legado `521` + 10 dígitos (formato pre-2019): normalizar a `52` + 10.
	if (iso === 'MX' && digits.startsWith(`${code}1`) && digits.length === code.length + 11) {
		return `${code}${digits.slice(code.length + 1)}`;
	}
	return digits;
}

/**
 * Enlace para ABRIR EL CHAT de WhatsApp con un número, sin redactar nada.
 *
 * La clave es que NO lleva `text`: con `text` WhatsApp abre el compositor con
 * el mensaje precargado, y sin él abre la conversación y se ve el historial
 * real (Web/Desktop en escritorio, la app en móvil).
 *
 * Es la única forma de ver lo que la familia contestó: los envíos de Emaús son
 * deep-link asistido —cada quien manda desde su propio WhatsApp— así que la app
 * registra lo que enviamos, pero las respuestas viven sólo en el teléfono.
 *
 * `country` (ISO-2 o nombre, texto libre del registro) resuelve la lada a
 * anteponer; sin país reconocible se asume México — la casa default es
 * `America/Mexico_City` y la base es abrumadoramente MX.
 *
 * Devuelve null cuando no hay dígitos: el llamador debe ocultar el botón en vez
 * de abrir un enlace que da "número inválido".
 */
export function buildWhatsAppChatLink(
	raw: string | null | undefined,
	country?: string | null,
): string | null {
	const digits = sanitizePhoneForWhatsapp(raw);
	if (!digits) return null;
	const iso = resolveCountryToIso(country) ?? 'MX';
	return `https://api.whatsapp.com/send?phone=${withCallingCode(digits, iso)}`;
}

/**
 * Enlace para ENVIAR un mensaje por WhatsApp: el chat abre con el texto ya
 * precargado en el compositor.
 *
 * Es el link de los envíos asistidos (cola de WhatsApp, recordatorio de saldo,
 * bandeja de secuencias, envío manual del MessageDialog). Mantiene la lada de
 * `buildWhatsAppChatLink` — sin ella, el número nacional a 10 dígitos que
 * domina la base abre un chat en Brasil ("55") y el mensaje no llega.
 *
 * Devuelve null sin dígitos: el llamador no debe abrir un enlace muerto.
 */
export function buildWhatsAppSendLink(
	raw: string | null | undefined,
	text: string,
	country?: string | null,
): string | null {
	const chat = buildWhatsAppChatLink(raw, country);
	if (!chat) return null;
	return `${chat}&text=${encodeURIComponent(text)}`;
}
