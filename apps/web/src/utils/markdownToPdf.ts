import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { marked, type Token, type Tokens } from 'marked';

/**
 * Genera el PDF de un documento de preparación **en el navegador**, con panel
 * de marcadores.
 *
 * Por qué aquí y no en el servidor: Chrome headless llega a 345MB de pico
 * (medido) y el Lightsail de producción tiene ~400MB libres — un render
 * concurrente con cualquier otra cosa se lleva el API por delante. jsPDF ya
 * estaba en el bundle y su API `outline` genera bookmarks reales, así que el
 * PDF sale de la máquina del usuario, que memoria tiene de sobra.
 *
 * No se reusa la hoja CSS de `@repo/utils` (esa sigue sirviendo al diálogo de
 * impresión del navegador): aquí se dibuja con la API de jsPDF, replicando el
 * mismo diseño del .docx original. Las fuentes son las estándar del PDF
 * (Times/Helvetica) en vez de Cambria/Calibri: embeber los clones libres
 * costaba 2.7MB de base64, y estas cubren los acentos y símbolos del español.
 */

// Paleta del .docx original (word/styles.xml)
const NAVY: [number, number, number] = [0x16, 0x36, 0x5c];
const BLUE: [number, number, number] = [0x00, 0x20, 0x60];
const STEEL: [number, number, number] = [0x4f, 0x81, 0xbd];
const SLATE: [number, number, number] = [0x36, 0x5f, 0x91];
const MIST: [number, number, number] = [0xdc, 0xe6, 0xf1];
const TEAL: [number, number, number] = [0x21, 0x58, 0x68];
const INK: [number, number, number] = [0x1f, 0x23, 0x28];
const GRAY: [number, number, number] = [0x7f, 0x7f, 0x7f];

// A4 en mm
const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN_X = 16;
const MARGIN_TOP = 24;
const MARGIN_BOTTOM = 18;
const CONTENT_W = PAGE_W - MARGIN_X * 2;

const SERIF = 'times';
const SANS = 'helvetica';

export type { Piece };

export interface PdfDocumentInput {
	title: string;
	/** Contexto a la izquierda del encabezado: parroquia. */
	subtitle?: string;
	/** Preparación y fecha, a la derecha. Admite dos líneas con `\n`. */
	meta?: string;
	/** Markdown YA resuelto — nunca la plantilla con `{...}` sin sustituir. */
	markdown: string;
}

interface Ctx {
	doc: jsPDF;
	y: number;
	/** Títulos recogidos para el outline, con la página en la que caen. */
	bookmarks: Array<{ level: number; text: string; page: number }>;
}

/** Trozo de texto con su estilo, para componer párrafos con negritas. */
interface Piece {
	text: string;
	bold?: boolean;
	italic?: boolean;
}

function setFont(doc: jsPDF, family: string, bold = false, italic = false) {
	const style = bold && italic ? 'bolditalic' : bold ? 'bold' : italic ? 'italic' : 'normal';
	doc.setFont(family, style);
}

/** Aplana los tokens inline de marked a trozos con estilo. */
export function flattenInline(tokens: Token[] | undefined, inherited: Piece = { text: '' }): Piece[] {
	const out: Piece[] = [];
	for (const token of tokens ?? []) {
		const t = token as Tokens.Generic;
		switch (t.type) {
			case 'strong':
				out.push(...flattenInline(t.tokens, { ...inherited, bold: true }));
				break;
			case 'em':
				out.push(...flattenInline(t.tokens, { ...inherited, italic: true }));
				break;
			case 'link':
			case 'del':
				out.push(...flattenInline(t.tokens, inherited));
				break;
			case 'br':
				out.push({ ...inherited, text: '\n' });
				break;
			case 'codespan':
			case 'text':
			case 'escape':
				out.push({ ...inherited, text: (t as Tokens.Text).text ?? '' });
				break;
			default:
				if ((t as Tokens.Text).text) out.push({ ...inherited, text: (t as Tokens.Text).text });
		}
	}
	return out;
}

function pieceWidth(doc: jsPDF, piece: Piece, family: string, size: number): number {
	setFont(doc, family, piece.bold, piece.italic);
	doc.setFontSize(size);
	return doc.getTextWidth(piece.text);
}

function ensureSpace(ctx: Ctx, needed: number) {
	if (ctx.y + needed <= PAGE_H - MARGIN_BOTTOM) return;
	ctx.doc.addPage();
	ctx.y = MARGIN_TOP;
}

/**
 * Unidad de composición: una palabra con su estilo y si iba precedida de un
 * espacio en el original.
 */
export interface TextUnit extends Piece {
	spaceBefore: boolean;
	newline?: boolean;
}

/**
 * Parte los trozos en palabras conservando dónde había espacios.
 *
 * El `spaceBefore` es la razón de ser de todo esto: al partir por palabras se
 * pierde si dos trozos con distinto estilo iban pegados, y `**SERVIR**?`
 * acababa impreso como `SERVIR ?`.
 */
export function toUnits(pieces: Piece[], forceItalic?: boolean): TextUnit[] {
	const units: TextUnit[] = [];
	let pendingSpace = false;
	for (const piece of pieces) {
		for (const chunk of piece.text.split(/(\n|\s+)/)) {
			if (chunk === '') continue;
			if (chunk === '\n') {
				units.push({ ...piece, text: '', spaceBefore: false, newline: true });
				pendingSpace = false;
				continue;
			}
			if (/^\s+$/.test(chunk)) {
				pendingSpace = true;
				continue;
			}
			units.push({
				...piece,
				italic: piece.italic || forceItalic,
				text: chunk,
				spaceBefore: pendingSpace,
			});
			pendingSpace = false;
		}
	}
	return units;
}

/**
 * Escribe texto con estilos mezclados, partiendo por palabras. jsPDF no tiene
 * layout de texto enriquecido, así que el ajuste de línea se hace a mano.
 */
function writeRich(
	ctx: Ctx,
	pieces: Piece[],
	opts: {
		family?: string;
		size?: number;
		color?: [number, number, number];
		lineHeight?: number;
		indent?: number;
		width?: number;
		/** Fuerza cursiva en todo el bloque (citas y oraciones). */
		italic?: boolean;
		/** Solo calcula el alto: no dibuja ni añade páginas. */
		measureOnly?: boolean;
	} = {},
): number {
	const { doc } = ctx;
	const family = opts.family ?? SANS;
	const size = opts.size ?? 10.5;
	const lineHeight = opts.lineHeight ?? size * 0.42;
	const indent = opts.indent ?? 0;
	const maxWidth = opts.width ?? CONTENT_W - indent;
	const color = opts.color ?? INK;
	const startY = ctx.y;

	const units = toUnits(pieces, opts.italic);

	let line: TextUnit[] = [];
	let lineWidth = 0;
	const spaceWidth = () => {
		setFont(doc, family, false, false);
		doc.setFontSize(size);
		return doc.getTextWidth(' ');
	};

	const flush = () => {
		if (!line.length) {
			ctx.y += lineHeight;
			return;
		}
		if (opts.measureOnly) {
			ctx.y += lineHeight;
			line = [];
			lineWidth = 0;
			return;
		}
		ensureSpace(ctx, lineHeight);
		let x = MARGIN_X + indent;
		doc.setTextColor(...color);
		line.forEach((unit, i) => {
			if (i > 0 && unit.spaceBefore) x += spaceWidth();
			setFont(doc, family, unit.bold, unit.italic);
			doc.setFontSize(size);
			doc.text(unit.text, x, ctx.y);
			x += doc.getTextWidth(unit.text);
		});
		ctx.y += lineHeight;
		line = [];
		lineWidth = 0;
	};

	for (const unit of units) {
		if (unit.newline) {
			flush();
			continue;
		}
		const w = pieceWidth(doc, unit, family, size);
		const gap = line.length && unit.spaceBefore ? spaceWidth() : 0;
		if (lineWidth + gap + w > maxWidth && line.length) {
			flush();
			line.push({ ...unit, spaceBefore: false });
			lineWidth = w;
			continue;
		}
		line.push(unit);
		lineWidth += gap + w;
	}
	const before = startY;
	flush();
	return ctx.y - before;
}

/** Versalitas simuladas: jsPDF no tiene small-caps. */
function writeSmallCaps(
	ctx: Ctx,
	text: string,
	opts: { size: number; color: [number, number, number]; family?: string },
) {
	const { doc } = ctx;
	const family = opts.family ?? SERIF;
	setFont(doc, family, true);
	doc.setTextColor(...opts.color);
	let x = MARGIN_X;
	for (const ch of text) {
		const isLower = ch !== ch.toUpperCase() && ch === ch.toLowerCase();
		doc.setFontSize(isLower ? opts.size * 0.82 : opts.size);
		const glyph = isLower ? ch.toUpperCase() : ch;
		doc.text(glyph, x, ctx.y);
		x += doc.getTextWidth(glyph);
	}
}

function drawHeading(ctx: Ctx, token: Tokens.Heading) {
	const { doc } = ctx;
	const text = flattenInline(token.tokens)
		.map((p) => p.text)
		.join(' ')
		.replace(/\s+/g, ' ')
		.trim();
	if (!text) return;

	const size = token.depth <= 1 ? 15 : token.depth === 2 ? 12.5 : 11;
	const color = token.depth <= 1 ? NAVY : token.depth === 2 ? BLUE : SLATE;

	ensureSpace(ctx, size * 0.7 + 6);
	ctx.y += token.depth === 1 ? 3 : 5;
	ensureSpace(ctx, size * 0.7 + 4);

	writeSmallCaps(ctx, text, { size, color });
	ctx.y += 1.6;
	if (token.depth <= 2) {
		doc.setDrawColor(...(token.depth === 1 ? STEEL : MIST));
		doc.setLineWidth(token.depth === 1 ? 0.5 : 0.25);
		doc.line(MARGIN_X, ctx.y, PAGE_W - MARGIN_X, ctx.y);
	}
	ctx.y += 3.4;

	ctx.bookmarks.push({
		level: token.depth,
		text,
		page: doc.getCurrentPageInfo().pageNumber,
	});
}

/** Rótulos tipo "Tema:" / "Objetivo:" → sangría francesa, como el .docx. */
const LABEL_COL = 30;

function drawParagraph(ctx: Ctx, token: Tokens.Paragraph) {
	const pieces = flattenInline(token.tokens);
	if (!pieces.length) return;

	const first = pieces[0];
	const label = first.bold ? first.text.trim() : '';
	const restText = pieces
		.slice(1)
		.map((p) => p.text)
		.join('')
		.trim();
	const isLabeled =
		!!label && label.length <= 24 && (/[:：]$/.test(label) || /^[:：]/.test(restText));

	if (isLabeled) {
		const startY = ctx.y;
		ensureSpace(ctx, 5);
		setFont(ctx.doc, SANS, true);
		ctx.doc.setFontSize(10.5);
		ctx.doc.setTextColor(...BLUE);
		ctx.doc.text(/[:：]$/.test(label) ? label : `${label}:`, MARGIN_X, ctx.y);
		const rest = pieces.slice(1);
		if (rest.length) rest[0] = { ...rest[0], text: rest[0].text.replace(/^\s*[:：]\s*/, '') };
		// Mismo renglón que el rótulo, indentado a su columna.
		ctx.y = startY;
		writeRich(ctx, rest, { indent: LABEL_COL, width: CONTENT_W - LABEL_COL });
		ctx.y += 1.6;
		return;
	}

	writeRich(ctx, pieces);
	ctx.y += 1.8;
}

function drawList(ctx: Ctx, token: Tokens.List) {
	for (const [index, item] of token.items.entries()) {
		const bullet = token.ordered ? `${(Number(token.start) || 1) + index}.` : '•';
		ensureSpace(ctx, 5);
		setFont(ctx.doc, SANS, false);
		ctx.doc.setFontSize(10.5);
		ctx.doc.setTextColor(...STEEL);
		ctx.doc.text(bullet, MARGIN_X + 2, ctx.y);
		const pieces = flattenInline(
			(item.tokens ?? []).flatMap((t) =>
				t.type === 'text' || t.type === 'paragraph' ? ((t as Tokens.Text).tokens ?? [t]) : [t],
			) as Token[],
		);
		writeRich(ctx, pieces, { indent: 7, width: CONTENT_W - 7 });
		ctx.y += 0.8;
	}
	ctx.y += 1.6;
}

function drawBlockquote(ctx: Ctx, token: Tokens.Blockquote) {
	const { doc } = ctx;
	const paragraphs = (token.tokens ?? []).filter((t) => t.type === 'paragraph');
	const quoteOpts = { color: TEAL, italic: true, indent: 7, width: CONTENT_W - 11 } as const;

	// Medir antes de pintar: el fondo tiene que ir DEBAJO del texto, así que
	// hay que conocer el alto sin haber escrito nada todavía.
	const probe: Ctx = { doc, y: 0, bookmarks: [] };
	for (const child of paragraphs) {
		writeRich(probe, flattenInline((child as Tokens.Paragraph).tokens), {
			...quoteOpts,
			measureOnly: true,
		});
		probe.y += 1.4;
	}
	const inner = probe.y;
	const boxHeight = inner + 5;

	// El fondo solo se pinta si la cita cabe en lo que queda de página. Si no,
	// se deja fluir y partir: forzarla entera a la hoja siguiente dejaba medio
	// folio en blanco, y pintar el fondo a caballo entre dos páginas sale mal.
	const fits = ctx.y + boxHeight <= PAGE_H - MARGIN_BOTTOM;
	const top = ctx.y - 1.5;
	if (fits) {
		doc.setFillColor(0xf5, 0xf8, 0xfc);
		doc.rect(MARGIN_X, top, CONTENT_W, boxHeight, 'F');
		doc.setFillColor(...STEEL);
		doc.rect(MARGIN_X, top, 1.1, boxHeight, 'F');
	}

	ctx.y += 2.4;
	for (const child of paragraphs) {
		writeRich(ctx, flattenInline((child as Tokens.Paragraph).tokens), quoteOpts);
		ctx.y += 1.4;
	}
	ctx.y = fits ? top + boxHeight + 3 : ctx.y + 2;
}

function drawTable(ctx: Ctx, token: Tokens.Table) {
	const head = [token.header.map((cell) => cell.text)];
	const body = token.rows.map((row) => row.map((cell) => cell.text));

	autoTable(ctx.doc, {
		head,
		body,
		startY: ctx.y + 1,
		margin: { left: MARGIN_X, right: MARGIN_X, top: MARGIN_TOP, bottom: MARGIN_BOTTOM },
		theme: 'grid',
		styles: { font: SANS, fontSize: 9, cellPadding: 1.8, textColor: INK, lineColor: [0xb8, 0xcc, 0xe4] },
		headStyles: { fillColor: STEEL, textColor: 255, fontStyle: 'bold', font: SERIF },
		alternateRowStyles: { fillColor: [0xed, 0xf2, 0xf9] },
		columnStyles: { 0: { halign: 'center', fontStyle: 'bold', textColor: NAVY, cellWidth: 14 } },
	});
	ctx.y = (ctx.doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 4;
}

async function drawImage(ctx: Ctx, src: string) {
	try {
		const res = await fetch(src);
		const blob = await res.blob();
		const dataUrl: string = await new Promise((resolve, reject) => {
			const reader = new FileReader();
			reader.onload = () => resolve(String(reader.result));
			reader.onerror = reject;
			reader.readAsDataURL(blob);
		});
		const props = ctx.doc.getImageProperties(dataUrl);
		// Acotada: las ilustraciones del .docx vienen a tamaño natural y si no
		// se comen media página.
		const maxW = Math.min(CONTENT_W, 110);
		const maxH = 95;
		let w = maxW;
		let h = (props.height / props.width) * w;
		if (h > maxH) {
			h = maxH;
			w = (props.width / props.height) * h;
		}
		ensureSpace(ctx, h + 4);
		ctx.doc.addImage(dataUrl, MARGIN_X + (CONTENT_W - w) / 2, ctx.y, w, h);
		ctx.y += h + 4;
	} catch {
		// Una imagen que no carga no debe tumbar el documento entero.
	}
}

/** Encabezado corrido y pie con numeración, en todas las páginas. */
function paintChrome(doc: jsPDF, input: PdfDocumentInput) {
	const total = doc.getNumberOfPages();
	for (let page = 1; page <= total; page++) {
		doc.setPage(page);

		if (input.subtitle) {
			setFont(doc, SANS, false);
			doc.setFontSize(8);
			doc.setTextColor(...SLATE);
			doc.text(input.subtitle, MARGIN_X, 13);
		}
		if (input.meta) {
			setFont(doc, SANS, true);
			doc.setFontSize(8);
			doc.setTextColor(...NAVY);
			const lines = input.meta.split('\n');
			lines.forEach((line, i) => {
				doc.text(line, PAGE_W - MARGIN_X, 11 + i * 3.4, { align: 'right' });
			});
		}
		doc.setDrawColor(...MIST);
		doc.setLineWidth(0.2);
		doc.line(MARGIN_X, 16.5, PAGE_W - MARGIN_X, 16.5);

		setFont(doc, SANS, false);
		doc.setFontSize(8);
		doc.setTextColor(...GRAY);
		doc.text(`Página ${page} de ${total}`, PAGE_W - MARGIN_X, PAGE_H - 10, { align: 'right' });
	}
}

/**
 * Marcadores jerárquicos. `doc.outline.add(parent, título, { pageNumber })`
 * los escribe como `/Outlines` reales del PDF, que es lo que el visor muestra
 * en su panel lateral.
 */
function addBookmarks(doc: jsPDF, input: PdfDocumentInput, bookmarks: Ctx['bookmarks']) {
	const outline = (doc as jsPDF & { outline: { add: (p: unknown, t: string, o: { pageNumber: number }) => unknown } })
		.outline;
	const root = outline.add(null, input.title, { pageNumber: 1 });
	// Un padre por nivel, para colgar los h3 del h2 que los precede.
	const parents: Record<number, unknown> = { 0: root, 1: root };
	for (const mark of bookmarks) {
		const parent = parents[mark.level - 1] ?? root;
		parents[mark.level] = outline.add(parent, mark.text, { pageNumber: mark.page });
	}
}

export async function buildPreparationPdf(input: PdfDocumentInput): Promise<Blob> {
	const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
	doc.setProperties({ title: input.title });

	const ctx: Ctx = { doc, y: MARGIN_TOP, bookmarks: [] };

	// Título del documento, centrado en versalitas sobre un filete.
	setFont(doc, SERIF, true);
	doc.setFontSize(16);
	doc.setTextColor(...NAVY);
	doc.text(input.title, PAGE_W / 2, ctx.y, { align: 'center' });
	ctx.y += 2.4;
	doc.setDrawColor(...STEEL);
	doc.setLineWidth(0.6);
	doc.line(MARGIN_X, ctx.y, PAGE_W - MARGIN_X, ctx.y);
	ctx.y += 6;

	for (const token of marked.lexer(input.markdown ?? '')) {
		switch (token.type) {
			case 'heading':
				drawHeading(ctx, token as Tokens.Heading);
				break;
			case 'paragraph': {
				const paragraph = token as Tokens.Paragraph;
				const image = (paragraph.tokens ?? []).find((t) => t.type === 'image') as
					| Tokens.Image
					| undefined;
				if (image && (paragraph.tokens ?? []).length === 1) await drawImage(ctx, image.href);
				else drawParagraph(ctx, paragraph);
				break;
			}
			case 'list':
				drawList(ctx, token as Tokens.List);
				break;
			case 'blockquote':
				drawBlockquote(ctx, token as Tokens.Blockquote);
				break;
			case 'table':
				drawTable(ctx, token as Tokens.Table);
				break;
			case 'hr':
				ensureSpace(ctx, 6);
				doc.setDrawColor(...MIST);
				doc.setLineWidth(0.2);
				doc.line(MARGIN_X, ctx.y, PAGE_W - MARGIN_X, ctx.y);
				ctx.y += 5;
				break;
			case 'space':
				ctx.y += 1.5;
				break;
			default:
				break;
		}
	}

	paintChrome(doc, input);
	addBookmarks(doc, input, ctx.bookmarks);
	// `/PageMode /UseOutlines`: sin esto el índice existe pero el visor no
	// despliega el panel y nadie lo descubre.
	doc.setDisplayMode(undefined, undefined, 'UseOutlines');
	return doc.output('blob');
}
