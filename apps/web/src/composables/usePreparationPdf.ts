import { type RetreatPreparationDocumentDTO } from '@/services/api';

/**
 * Descarga el PDF de un documento markdown, con panel de marcadores.
 *
 * Se genera **en el navegador**: Chrome headless en el servidor llegaba a
 * 345MB de pico (medido) y el Lightsail de producción tiene ~400MB libres.
 * jsPDF ya estaba en el bundle y produce marcadores reales, así que el coste
 * lo paga la máquina del usuario y el servidor no se entera.
 *
 * El generador se carga con `import()` dinámico para no meter jsPDF y sus
 * tablas en el bundle inicial: solo lo descarga quien pulsa el botón.
 */

export interface MarkdownPdfOptions {
	/** Base del nombre de archivo, sin extensión. */
	fileName: string;
	title: string;
	/** Markdown YA resuelto — nunca la plantilla con los `{...}`. */
	markdown: string;
	/** Contexto del encabezado (parroquia) y fecha de la sesión. */
	subtitle?: string;
	meta?: string;
	onError?: (message: string) => void;
}

export interface PreparationPdfOptions {
	doc: RetreatPreparationDocumentDTO;
	/** Contexto del encabezado (parroquia) y fecha de la sesión. */
	subtitle?: string;
	meta?: string;
	onError?: (message: string) => void;
}

function saveBlob(blob: Blob, fileName: string) {
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = fileName;
	document.body.appendChild(a);
	a.click();
	a.remove();
	URL.revokeObjectURL(url);
}

/**
 * Núcleo genérico: sirve para cualquier documento markdown ya resuelto, no solo
 * para los de preparación (lo usa también la carta al párroco).
 */
export async function downloadMarkdownPdf(opts: MarkdownPdfOptions): Promise<boolean> {
	try {
		const { buildPreparationPdf } = await import('@/utils/markdownToPdf');
		const blob = await buildPreparationPdf({
			title: opts.title,
			subtitle: opts.subtitle,
			meta: opts.meta,
			markdown: opts.markdown,
		});
		saveBlob(blob, `${opts.fileName}.pdf`);
		return true;
	} catch (err) {
		console.error('[usePreparationPdf]', err);
		opts.onError?.('No se pudo generar el PDF. Inténtalo de nuevo.');
		return false;
	}
}

export async function downloadPreparationPdf(opts: PreparationPdfOptions): Promise<boolean> {
	const baseName = opts.doc.fileName.replace(/\.md$/i, '');
	return downloadMarkdownPdf({
		fileName: baseName,
		title: baseName,
		subtitle: opts.subtitle,
		meta: opts.meta,
		// Siempre el texto resuelto: `content` es la plantilla con los `{...}`.
		markdown: opts.doc.renderedContent ?? opts.doc.content ?? '',
		onError: opts.onError,
	});
}
