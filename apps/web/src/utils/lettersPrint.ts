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

const participantHeaderHtml = (entry: Entry): string => {
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
export const buildLettersBodyHtml = (entries: LetterPrintBatchEntry[]): string => {
	const style = `
		<style>
			.letter-participant { border-bottom: 2px solid #16365C; padding-bottom: 6px; margin: 0 0 14px; }
			.letter-participant h2 { font-size: 15pt; color: #16365C; margin: 0; }
			.letter-participant-meta { color: #4F81BD; font-size: 10pt; margin-top: 2px; }
			.letter-card { border: 1px solid #d9d9d9; border-radius: 6px; padding: 12px 14px; margin-bottom: 16px; break-inside: avoid; }
			.letter-meta { display: flex; justify-content: space-between; font-size: 9.5pt; color: #333; border-bottom: 1px solid #eee; padding-bottom: 4px; margin-bottom: 8px; }
			.letter-from { font-weight: 600; }
			.letter-muted { color: #777; }
			.letter-subject { font-size: 11pt; font-style: italic; margin-bottom: 8px; }
			.letter-body p { margin: 0 0 8px; line-height: 1.5; }
			.letter-attachment { margin: 8px 0 0; text-align: center; break-inside: avoid; }
			.letter-attachment img { max-width: 100%; max-height: 150mm; border-radius: 4px; }
			.letter-nonprintable { border: 1px dashed #b00; color: #b00; border-radius: 4px; padding: 8px; font-size: 9pt; }
			.letter-warning { color: #a50; font-size: 9pt; margin-top: 6px; }
			.letter-page-break { break-before: page; }
		</style>
	`;
	if (entries.length === 0) {
		return `${style}<p>No hay cartas aprobadas para imprimir.</p>`;
	}
	const sections = entries
		.map(
			(entry, index) => `
		<section class="${index > 0 ? 'letter-page-break' : ''}">
			${participantHeaderHtml(entry)}
			${entry.letters.map(letterBlockHtml).join('')}
		</section>
	`,
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
