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
	it('arma una sección por participante con su encabezado y page-break entre participantes', () => {
		const html = buildLettersBodyHtml([entry(), entry({ retreatParticipantId: 'rp2', participantName: 'Ana' })]);
		expect(html).toContain('Juan Pérez');
		expect(html).toContain('Ana');
		expect(html).toContain('Mesa 3');
		// Solo el separador del 2º participante (el <style> define la clase una vez).
		expect((html.match(/class="letter-page-break"/g) || []).length).toBe(1);
	});

	it('escapa el texto de la carta: un <script> sale como texto, no como HTML', () => {
		const html = buildLettersBodyHtml([
			entry({ letters: [letter({ bodyText: 'Hola <script>alert(1)</script> Juan' })] }),
		]);
		expect(html).not.toContain('<script>');
		expect(html).toContain('&lt;script&gt;');
	});

	it('inlinea imágenes browser-safe y deja placeholder para HEIC/PDF', () => {
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
		expect(html).toContain('formato no imprimible');
		expect(html).toContain('retrato.heic');
	});

	it('incluye solo los datos que el caller pasa: no filtra approved (eso lo hace el API)', () => {
		const html = buildLettersBodyHtml([entry({ letters: [letter({ status: 'hidden' })] })]);
		expect(html).toContain('Hola Juan');
	});

	it('muestra avisos (warnings) del ingest dentro de la carta', () => {
		const html = buildLettersBodyHtml([
			entry({ letters: [letter({ warnings: ['Adjunto "raro.exe" descartado: formato no soportado'] })] }),
		]);
		expect(html).toContain('raro.exe');
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
