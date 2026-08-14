/**
 * Saneo de texto capturado por el usuario en formularios.
 *
 * El teclado y el autocompletado de iOS/Android insertan caracteres de formato
 * Unicode invisibles (marcas de dirección bidireccional, espacios de ancho cero,
 * BOM) al pegar o autocompletar desde Contactos. No se ven en pantalla, pero
 * rompen cualquier validación estricta: un teléfono se ve "5530978314" y falla
 * como "solo puede contener números"; un correo se ve correcto y falla como
 * inválido.
 */

/**
 * Caracteres de formato Unicode invisibles: espacios de ancho cero y marcas
 * bidi (U+200B–U+200F), embeddings/overrides bidi (U+202A–U+202E), separadores
 * invisibles (U+2060–U+206F) y BOM (U+FEFF).
 */
const INVISIBLE_FORMAT_CHARS_REGEX = /[\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/g;

/**
 * Elimina los caracteres de formato invisibles de una cadena. NO toca espacios
 * normales ni ningún carácter visible.
 */
export function stripInvisibleFormatChars(value: string): string {
	return value.replace(INVISIBLE_FORMAT_CHARS_REGEX, '');
}

/**
 * Normaliza un correo capturado en un formulario: quita caracteres invisibles y
 * espacios de los bordes. NO cambia mayúsculas/minúsculas ni el contenido del
 * correo — solo lo que el usuario no puede ver ni quiso escribir.
 */
export function normalizeEmail(value: string | null | undefined): string {
	if (value == null) return '';
	return stripInvisibleFormatChars(value).trim();
}
