import { escapeHtmlText } from '@repo/utils';
import type { Letter, LetterPrintBatchEntry } from '@repo/types';

type AnyLetter = Letter;

const dateFmt = new Intl.DateTimeFormat('es-MX', {
	dateStyle: 'medium',
	timeStyle: 'short',
});

const letterDate = (letter: AnyLetter): string => {
	const value = (letter as { receivedAt?: string | Date }).receivedAt;
	return value ? dateFmt.format(new Date(value)) : '';
};

const paragraphs = (text: string): string =>
	text
		.split(/\n{2,}/)
		.map((block) => `<p>${escapeHtmlText(block).replace(/\n/g, '<br />')}</p>`)
		.join('');

const attachmentHtml = (attachment: {
	fileName: string;
	storageUrl: string;
	isBrowserSafeImage: boolean;
	mimeType: string;
}): string => {
	if (attachment.isBrowserSafeImage) {
		return `<figure class="letter-attachment"><img src="${escapeHtmlText(attachment.storageUrl)}" alt="${escapeHtmlText(attachment.fileName)}" /></figure>`;
	}
	return `<p class="letter-nonprintable">Foto adjunta en formato no imprimible: ${escapeHtmlText(attachment.fileName)} — pedirla de nuevo en JPG/PNG para salir en papel.</p>`;
};

const letterBlockHtml = (letter: AnyLetter): string => {
	const from = letter.fromName
		? `${escapeHtmlText(letter.fromName)} <span class="letter-muted">(${escapeHtmlText(letter.fromEmail)})</span>`
		: escapeHtmlText(letter.fromEmail);
	const subject = letter.subject
		? `<div class="letter-subject">«${escapeHtmlText(letter.subject)}»</div>`
		: '';
	const attachments = ((letter as { attachments?: Parameters<typeof attachmentHtml>[0][] }).attachments ?? [])
		.map(attachmentHtml)
		.join('');
	const warnings = (letter as { warnings?: string[] | null }).warnings?.length
		? `<p class="letter-warning">${escapeHtmlText(
				(letter as { warnings?: string[] }).warnings!.join(' · '),
			)}</p>`
		: '';
	return `
		<article class="letter-card">
			<header class="letter-meta">
				<span class="letter-from">De: ${from}</span>
				<span class="letter-muted">${escapeHtmlText(letterDate(letter))}</span>
			</header>
			${subject}
			<div class="letter-body">${paragraphs(letter.bodyText)}</div>
			${attachments}
			${warnings}
		</article>
	`;
};

const participantHeaderHtml = (entry: LetterPrintBatchEntry): string => {
	// tableName ya trae su propio "Mesa N" — no anteponer nada.
	const bits = [entry.tableName, entry.idOnRetreat != null ? `Nº ${entry.idOnRetreat}` : null].filter(
		Boolean,
	);
	return `
		<div class="letter-participant">
			<h2>${escapeHtmlText(entry.participantName)}</h2>
			<div class="letter-participant-meta">${escapeHtmlText(bits.join(' · '))}</div>
		</div>
	`;
};

/**
 * Body HTML del paquete de impresión (specs/letters-email D13): una sección por
 * participante con page-break, cartas aprobadas en orden de llegada y fotos
 * browser-safe inline. Todo el contenido de las cartas pasa por
 * `escapeHtmlText` — el texto del email jamás viaja como HTML (D10).
 * Las URLs de las imágenes ya vienen presigned del API.
 */
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
			.letter-participant { border-bottom: 2px solid #16365C; padding-bottom: 6px; margin: 0 0 14px; }
			.letter-participant h2 { font-size: 15pt; color: #16365C; margin: 0; }
			.letter-participant-meta { color: #4F81BD; font-size: 10pt; margin-top: 2px; }
			/* Una carta larga se parte entre hojas (con avoid saltaba entera a la
			   siguiente y dejaba la hoja del nombre casi vacía); el encabezado de la
			   carta y del participante nunca quedan solos al pie. */
			.letter-card { border: 1px solid #d9d9d9; border-radius: 6px; padding: 12px 14px; margin-bottom: 16px; break-inside: auto; }
			.letter-participant, .letter-meta, .letter-subject { break-after: avoid; }
			.letter-body p { orphans: 3; widows: 3; }
			.letter-meta { display: flex; justify-content: space-between; font-size: 9.5pt; color: #333; border-bottom: 1px solid #eee; padding-bottom: 4px; margin-bottom: 8px; }
			.letter-from { font-weight: 600; }
			.letter-muted { color: #777; }
			.letter-subject { font-size: 11pt; font-style: italic; margin-bottom: 8px; }
			.letter-body p { margin: 0 0 8px; line-height: 1.5; }
			.letter-attachment { margin: 8px 0 0; text-align: center; break-inside: avoid; }
			.letter-attachment img { max-width: 100%; max-height: 150mm; border-radius: 4px; }
			.letter-nonprintable { border: 1px dashed #b00; color: #b00; border-radius: 4px; padding: 8px; font-size: 9pt; }
			.letter-warning { color: #a50; font-size: 9pt; margin-top: 6px; }
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
	// Una tabla por participante: su folder empieza en hoja nueva y los
	// espaciadores thead/tfoot dan margen arriba y abajo en cada hoja. Con
	// carátula, la portada va en su propia hoja antes de las cartas.
	const sections = entries
		.map(
			(entry) =>
				(options.cover ? sheetHtml(coverHtml(entry)) : '') +
				sheetHtml(`${participantHeaderHtml(entry)}${entry.letters.map(letterBlockHtml).join('')}`),
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
