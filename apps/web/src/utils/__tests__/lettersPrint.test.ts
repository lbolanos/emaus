import { describe, it, expect } from 'vitest';
import { buildLettersBodyHtml, lettersPrintTitle, newPrintBatchId } from '../lettersPrint';
import type { LetterPrintBatchEntry } from '@repo/types';

const attachment = (over: Record<string, any> = {}) => ({
	id: 'a1',
	letterId: 'l1',
	fileName: 'foto.jpg',
	mimeType: 'image/jpeg',
	sizeBytes: 1000,
	isBrowserSafeImage: true,
	storageUrl: 'https://bucket/signed-url',
	sortOrder: 0,
	createdAt: '2026-11-05T14:03:00.000Z',
	...over,
});

const letter = (over: Record<string, any> = {}) => ({
	id: 'l1',
	retreatId: 'r1',
	retreatParticipantId: 'rp1',
	participantName: 'Juan Pérez',
	fromEmail: 'familia@ejemplo.com',
	fromName: 'María',
	subject: 'Para Juan',
	bodyText: 'Hola Juan\nFuerza',
	status: 'approved',
	receivedAt: '2026-11-05T14:03:00.000Z',
	warnings: null,
	reviewedAt: null,
	printedAt: null,
	printedBatchId: null,
	attachments: [],
	...over,
});

const entry = (over: Partial<LetterPrintBatchEntry> = {}): LetterPrintBatchEntry => ({
	retreatParticipantId: 'rp1',
	participantId: 'p1',
	participantName: 'Juan Pérez',
	idOnRetreat: 12,
	tableName: 'Mesa 3',
	tableSortKey: 'Mesa 3',
	letters: [letter()],
	...over,
});

describe('lettersPrint', () => {
	it('en papel va SOLO el cuerpo: sin caminante, mesa, remitente, correo, fecha ni asunto', () => {
		const html = buildLettersBodyHtml([entry()]);
		expect(html).toContain('Hola Juan');
		const body = html.slice(html.indexOf('</style>'));
		for (const metadata of ['Juan Pérez', 'Mesa 3', 'De:', 'familia@ejemplo.com', 'María', 'Para Juan']) {
			expect(body).not.toContain(metadata);
		}
	});

	it('una hoja por carta, del 2º caminante en adelante también en hoja nueva', () => {
		const html = buildLettersBodyHtml([
			entry({ letters: [letter(), letter({ id: 'l2', bodyText: 'Segunda' })] }),
			entry({ retreatParticipantId: 'rp2', participantName: 'Ana' }),
		]);
		expect((html.match(/<table class="letter-sheet">/g) || []).length).toBe(3);
		expect(html).toContain('.letter-sheet + .letter-sheet { break-before: page; }');
	});

	it('carátula opcional: una hoja con nombre, mesa y número de cartas antes del folder', () => {
		const sin = buildLettersBodyHtml([entry()]);
		expect(sin).not.toContain('class="letter-cover"');
		const con = buildLettersBodyHtml([entry()], { cover: true });
		expect(con).toContain('class="letter-cover"');
		expect(con).toContain('letter-cover-name">Juan Pérez<');
		expect(con).toMatch(/letter-cover-count">1 carta</);
		// Carátula y carta son hojas aparte.
		expect((con.match(/<table class="letter-sheet">/g) || []).length).toBe(2);
	});

	it('papel sin cromo del navegador: @page en 0 y margen por espaciadores que se repiten', () => {
		const html = buildLettersBodyHtml([entry()]);
		// Con cualquier margen > 0 Chrome pinta fecha, título, URL y n/N
		// (verificado con Chrome headless: 9mm no basta).
		expect(html).toContain('@page { size: A4; margin: 0; }');
		expect(html).toMatch(/<thead><tr><td><\/td><\/tr><\/thead>/);
		expect(html).toMatch(/<tfoot><tr><td><\/td><\/tr><\/tfoot>/);
	});

	it('escapa el texto de la carta: un <script> sale como texto, no como HTML', () => {
		const html = buildLettersBodyHtml([
			entry({ letters: [letter({ bodyText: 'Hola <script>alert(1)</script> Juan' })] }),
		]);
		expect(html).not.toContain('<script>');
		expect(html).toContain('&lt;script&gt;');
	});

	it('inlinea las fotos imprimibles; una HEIC no sale en papel (el aviso queda en pantalla)', () => {
		const html = buildLettersBodyHtml([
			entry({
				letters: [
					letter({
						attachments: [
							attachment(),
							attachment({ id: 'a2', fileName: 'retrato.heic', mimeType: 'image/heic', isBrowserSafeImage: false }),
						],
					}),
				],
			}),
		]);
		expect(html).toContain('<img src="https://bucket/signed-url"');
		expect(html).not.toContain('formato no imprimible');
		expect(html).not.toContain('retrato.heic');
	});

	it('incluye solo los datos que el caller pasa: no filtra approved (eso lo hace el API)', () => {
		const html = buildLettersBodyHtml([entry({ letters: [letter({ status: 'hidden' })] })]);
		expect(html).toContain('Hola Juan');
	});

	it('los avisos internos del ingest no salen en papel', () => {
		const html = buildLettersBodyHtml([
			entry({ letters: [letter({ warnings: ['Adjunto "raro.exe" descartado: formato no soportado'] })] }),
		]);
		expect(html).not.toContain('raro.exe');
	});

	it('vacío: mensaje claro sin secciones', () => {
		const html = buildLettersBodyHtml([]);
		expect(html).toContain('No hay cartas aprobadas');
	});

	it('lettersPrintTitle etiqueta por alcance', () => {
		expect(lettersPrintTitle('retreat', [entry()])).toContain('Retiro');
		expect(lettersPrintTitle('table', [entry()])).toContain('Mesa 3');
		expect(lettersPrintTitle('participant', [entry()])).toContain('Juan Pérez');
	});

	it('newPrintBatchId genera ids únicos', () => {
		const ids = new Set(Array.from({ length: 50 }, () => newPrintBatchId()));
		expect(ids.size).toBe(50);
	});
});
