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
 * Devuelve null cuando no hay dígitos: el llamador debe ocultar el botón en vez
 * de abrir un enlace que da "número inválido".
 */
export function buildWhatsAppChatLink(raw: string | null | undefined): string | null {
	const digits = sanitizePhoneForWhatsapp(raw);
	if (!digits) return null;
	return `https://api.whatsapp.com/send?phone=${digits}`;
}
