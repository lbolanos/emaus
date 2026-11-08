import { escapeHtmlText } from '@repo/utils';
import type { Letter, LetterPrintBatchEntry } from '@repo/types';

const paragraphs = (text: string): string =>
	text
		.split(/\n{2,}/)
		.map((block) => `<p>${escapeHtmlText(block).replace(/\n/g, '<br />')}</p>`)
		.join('');

type PrintableAttachment = {
	fileName: string;
	storageUrl: string;
	isBrowserSafeImage: boolean;
};

/**
 * Lo que va en papel de una carta es SOLO lo que escribió la familia: el
 * cuerpo del mensaje y sus fotos imprimibles. Nada de remitente, correo,
 * fecha, asunto, nombre del caminante ni avisos internos (fotos HEIC, adjuntos
 * descartados): eso se revisa en pantalla, y el papel es la carta que se le
 * entrega al caminante.
 */
const letterBlockHtml = (letter: Letter): string => {
	const photos = ((letter as { attachments?: PrintableAttachment[] }).attachments ?? [])
		.filter((a) => a.isBrowserSafeImage)
		.map(
			(a) =>
				`<figure class="letter-attachment"><img src="${escapeHtmlText(a.storageUrl)}" alt="${escapeHtmlText(a.fileName)}" /></figure>`,
		)
		.join('');
	return `<article class="letter-body">${paragraphs(letter.bodyText)}${photos}</article>`;
};

/**
 * Carátula del folder: hoja propia con el nombre en grande, mesa, número y
 * cuántas cartas trae — para rotular la carpeta física sin confundirla.
 */
const coverHtml = (entry: LetterPrintBatchEntry): string => {
	const count = entry.letters.length;
	const bits = [entry.tableName, entry.idOnRetreat != null ? `Nº ${entry.idOnRetreat}` : null].filter(
		Boolean,
	);
	return `
		<div class="letter-cover">
			<div class="letter-cover-name">${escapeHtmlText(entry.participantName)}</div>
			<div class="letter-cover-meta">${escapeHtmlText(bits.join(' · '))}</div>
			<div class="letter-cover-count">${count} ${count === 1 ? 'carta' : 'cartas'}</div>
		</div>
	`;
};

const sheetHtml = (inner: string): string => `
		<table class="letter-sheet">
			<thead><tr><td></td></tr></thead>
			<tfoot><tr><td></td></tr></tfoot>
			<tbody><tr><td>${inner}</td></tr></tbody>
		</table>
	`;

/**
 * Body HTML del paquete de impresión (specs/letters-email D13): cada carta
 * aprobada en su hoja, agrupadas por participante en orden de llegada, con
 * sus fotos browser-safe. Todo el texto pasa por `escapeHtmlText`: el del
 * email jamás viaja como HTML (D10). Las URLs de las fotos vienen presigned.
 */
export const buildLettersBodyHtml = (
	entries: LetterPrintBatchEntry[],
	options: { cover?: boolean } = {},
): string => {
	const style = `
		<style>
			/* Sin encabezado ni pie del navegador: Chrome pinta fecha, título, URL
			   y número de página DENTRO del margen de @page, y solo deja de hacerlo
			   con margen 0 (un margen chico, p. ej. 9mm, no basta: verificado con
			   Chrome headless). El margen real lo dan los laterales del body y los
			   espaciadores thead/tfoot de .letter-sheet, que Chrome repite en
			   CADA hoja — un padding del body solo valdría para la primera. */
			@page { size: A4; margin: 0; }
			body { padding-top: 0; padding-bottom: 0; }
			/* .letter-sheet es maqueta, no una tabla de datos: anula lo que la hoja
			   compartida da a toda tabla (margen, 10pt, y la primera celda centrada,
			   al 8% y en negrita azul — la columna de semana de las preparaciones). */
			table.letter-sheet { width: 100%; border-collapse: collapse; margin: 0; font-size: inherit; }
			.letter-sheet > thead > tr > td,
			.letter-sheet > tfoot > tr > td { height: 14mm; padding: 0; border: 0; background: none; }
			.letter-sheet > tbody > tr > td,
			.letter-sheet > tbody > tr > td:first-child {
				padding: 0; border: 0; background: none; vertical-align: top;
				text-align: left; width: auto; font-weight: 400; color: inherit;
			}
			/* La hoja compartida, en print, quita el padding del body (sus laterales
			   salían del @page) y no deja partir un tr: con @page en 0 y todo el
			   folder en una fila, las dos reglas pegaban el texto al borde y
			   empujaban el folder entero. Mismo peso, declaradas después: ganan. */
			@media print {
				body { padding: 0 16mm; }
				.letter-sheet tr { break-inside: auto; }
			}
			/* Una carta larga se parte entre hojas sin dejar líneas sueltas. */
			.letter-body p { margin: 0 0 9pt; line-height: 1.55; orphans: 3; widows: 3; }
			.letter-attachment { margin: 10pt 0 0; text-align: center; break-inside: avoid; }
			.letter-attachment img { max-width: 100%; max-height: 150mm; border-radius: 4px; }
			/* Cada carta en su hoja: se entregan (y se doblan) por separado. */
			.letter-sheet + .letter-sheet { break-before: page; }
			.letter-cover { text-align: center; padding-top: 70mm; }
			.letter-cover-name { font-family: Cambria, Georgia, serif; font-size: 30pt; color: #16365C; line-height: 1.2; }
			.letter-cover-meta { font-size: 16pt; color: #4F81BD; margin-top: 10mm; }
			.letter-cover-count { font-size: 13pt; color: #555; margin-top: 6mm; }
		</style>
	`;
	if (entries.length === 0) {
		return `${style}<p>No hay cartas aprobadas para imprimir.</p>`;
	}
	// Una hoja por carta (los espaciadores thead/tfoot dan el margen arriba y
	// abajo en cada hoja, también si una carta ocupa varias). Las cartas de un
	// caminante van seguidas; la carátula opcional, en su hoja, las encabeza y
	// es lo único que dice de quién es el folder.
	const sections = entries
		.map(
			(entry) =>
				(options.cover ? sheetHtml(coverHtml(entry)) : '') +
				entry.letters.map((letter) => sheetHtml(letterBlockHtml(letter))).join(''),
		)
		.join('');
	return `${style}${sections}`;
};

/** Título del documento de impresión según el alcance. */
export const lettersPrintTitle = (
	scope: 'participant' | 'table' | 'retreat',
	entries: LetterPrintBatchEntry[],
): string => {
	const count = entries.reduce((sum, entry) => sum + entry.letters.length, 0);
	const scopeLabel =
		scope === 'participant'
			? entries[0]?.participantName ?? 'Participante'
			: scope === 'table'
				? entries[0]?.tableName ?? 'Mesa'
				: 'Retiro';
	return `Cartas — ${scopeLabel} (${count})`;
};

/** batchId del trabajo de impresión (print-mark). */
export const newPrintBatchId = (): string =>
	typeof crypto !== 'undefined' && 'randomUUID' in crypto
		? crypto.randomUUID()
		: `${Date.now()}-${Math.random().toString(36).slice(2)}`;
