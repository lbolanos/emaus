import DOMPurify from 'dompurify';

/**
 * Configuración segura para DOMPurify
 */
const DOMPURIFY_CONFIG = {
	ALLOWED_TAGS: [
		'h1',
		'h2',
		'h3',
		'h4',
		'h5',
		'h6',
		'p',
		'br',
		'hr',
		'strong',
		'b',
		'em',
		'i',
		'u',
		's',
		'del',
		'ins',
		'ul',
		'ol',
		'li',
		'blockquote',
		'pre',
		'code',
		'a',
		'img',
		'table',
		'thead',
		'tbody',
		'tr',
		'th',
		'td',
	],
	ALLOWED_ATTR: ['href', 'title', 'target', 'rel', 'src', 'alt', 'width', 'height', 'class', 'id'],
	FORCE_BODY: true,
	ADD_ATTR: ['target'],
	ADD_DATA_URI_TAGS: ['img'],
};

/**
 * Sanitiza HTML para prevenir ataques XSS
 * @param html - Contenido HTML a sanitizar
 * @returns HTML sanitizado y seguro
 */
export function sanitizeHtml(html: string): string {
	if (!html) return '';

	try {
		return DOMPurify.sanitize(html, DOMPURIFY_CONFIG);
	} catch (error) {
		console.error('Error sanitizing HTML:', error);
		return '';
	}
}

/**
 * Sanitiza texto plano eliminando cualquier HTML
 * @param text - Texto a sanitizar
 * @returns Texto sin etiquetas HTML
 */
export function sanitizeText(text: string): string {
	if (!text) return '';

	try {
		// Eliminar todas las etiquetas HTML
		return text.replace(/<[^>]*>/g, '');
	} catch (error) {
		console.error('Error sanitizing text:', error);
		return '';
	}
}

/**
 * Convierte markdown simple a HTML seguro
 * @param markdown - Texto en formato markdown
 * @returns HTML sanitizado
 */
export function markdownToSafeHtml(markdown: string): string {
	if (!markdown) return '';

	try {
		// Convertir markdown básico a HTML
		const html = markdown
			.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
			.replace(/\*(.*?)\*/g, '<em>$1</em>')
			.replace(/`(.*?)`/g, '<code>$1</code>')
			.replace(/\n/g, '<br>');

		// Sanitizar el HTML resultante
		return sanitizeHtml(html);
	} catch (error) {
		console.error('Error converting markdown to HTML:', error);
		return '';
	}
}

/**
 * Verifica si una URL es segura
 * @param url - URL a verificar
 * @returns true si la URL es segura
 */
export function isSafeUrl(url: string): boolean {
	if (!url) return false;

	try {
		const parsedUrl = new URL(url);
		const allowedProtocols = ['http:', 'https:', 'mailto:', 'tel:'];
		return allowedProtocols.includes(parsedUrl.protocol);
	} catch {
		return false;
	}
}

/**
 * Sanitiza atributos HTML
 * @param value - Valor del atributo a sanitizar
 * @returns Valor sanitizado
 */
export function sanitizeAttribute(value: string): string {
	if (!value) return '';

	try {
		// Eliminar comillas y caracteres peligrosos
		return value
			.replace(/["'<>&]/g, '')
			.replace(/\s+/g, ' ')
			.trim();
	} catch (error) {
		console.error('Error sanitizing attribute:', error);
		return '';
	}
}

/**
 * Configuración adicional para DOMPurify si es necesario
 */
export function configureDOMPurify(): void {
	// Permitir target="_blank" con rel="noopener noreferrer" para seguridad
	DOMPurify.addHook('uponSanitizeAttribute', function (node, data) {
		if (data.attrName === 'target' && data.attrValue === '_blank') {
			node.setAttribute('rel', 'noopener noreferrer');
		}
	});
}

// Inicializar configuración adicional
configureDOMPurify();
