import {
	buildPrintableHtml,
	printableSlug,
	PRINT_STYLESHEET,
	type PrintableDocumentData,
} from '@repo/utils';
import { renderMarkdown } from './useMarkdown';

// El diseño del documento (hoja A4, encabezado corrido, tabla) vive en
// `@repo/utils` porque el servidor genera el mismo papel con Chrome headless
// para el PDF con marcadores. Aquí solo queda la parte que necesita ventana.
export { PRINT_STYLESHEET };

export interface PrintableDocumentOptions
	extends Omit<PrintableDocumentData, 'bodyHtml'> {
	/** Markdown YA resuelto — nunca la plantilla con `{...}` sin sustituir. */
	markdown: string;
	/** El caller decide cómo avisar (toast), para no acoplar esto a @repo/ui. */
	onPopupBlocked?: () => void;
}

/**
 * Abre una ventana con el markdown renderizado y la hoja A4, y dispara el
 * diálogo nativo (donde el usuario elige "Guardar como PDF").
 *
 * Por qué una ventana nueva y no `@media print` en la página: las vistas que
 * abren esto ya tienen sus propias reglas de impresión que ocultan diálogos.
 * Una ventana hija le da al documento un contexto de impresión limpio.
 *
 * Para un PDF con panel de marcadores hay que pasar por el servidor: el
 * diálogo del navegador no puede generarlos.
 *
 * Devuelve false si el navegador bloqueó el popup.
 */
export function printMarkdownDocument(opts: PrintableDocumentOptions): boolean {
	const win = window.open('', '_blank', 'width=900,height=1100');
	if (!win) {
		opts.onPopupBlocked?.();
		return false;
	}

	win.document.write(
		buildPrintableHtml(
			{
				title: opts.title,
				subtitle: opts.subtitle,
				meta: opts.meta,
				bodyHtml: renderMarkdown(opts.markdown ?? ''),
			},
			{
				// `window.open('')` abre about:blank, sin base URI: sin esto las
				// rutas raíz-relativas de las imágenes no resuelven y el PDF sale
				// sin ilustraciones.
				baseHref: `${window.location.origin}/`,
				autoPrint: true,
				printPath: `/imprimir/${printableSlug(opts.title)}`,
			},
		),
	);
	win.document.close();
	return true;
}
