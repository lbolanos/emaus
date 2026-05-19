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
