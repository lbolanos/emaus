// Integración con DB real: calendario de preparaciones semanales pre-retiro.
// Cubre generate (semanas variables, clearExisting), skipForHoliday (break +
// corrimiento de sesiones), documentos (archivo inline sin S3, markdown
// editable) y la vista pública por slug (gate isPublic).

import { setupTestDatabase, teardownTestDatabase } from '../test-setup';
import { TestDataFactory } from '../test-utils/testDataFactory';
import { RetreatPreparation } from '@/entities/retreatPreparation.entity';
import { RetreatPreparationDocument } from '@/entities/retreatPreparationDocument.entity';
import {
	retreatPreparationService,
	addDaysYmd,
	PreparationValidationError,
} from '@/services/retreatPreparationService';

const PDF_DATA_URL = `data:application/pdf;base64,${Buffer.from('%PDF-1.4 test').toString('base64')}`;

describe('RetreatPreparationService — calendario de preparaciones', () => {
	let retreat: any;

	const getDS = () => TestDataFactory['testDataSource'];

	beforeAll(async () => {
		await setupTestDatabase();
	});

	afterAll(async () => {
		await teardownTestDatabase();
	});

	beforeEach(async () => {
		const ds = getDS();
		await ds.getRepository(RetreatPreparationDocument).createQueryBuilder().delete().execute();
		await ds.getRepository(RetreatPreparation).createQueryBuilder().delete().execute();
		retreat = await TestDataFactory.createTestRetreat({
			startDate: new Date('2026-09-18T12:00:00Z'),
		} as any);
	});

	describe('addDaysYmd (aritmética UTC, sin salto de día)', () => {
		it('suma semanas y cruza meses/años', () => {
			expect(addDaysYmd('2026-07-14', 7)).toBe('2026-07-21');
			expect(addDaysYmd('2026-07-28', 7)).toBe('2026-08-04');
			expect(addDaysYmd('2026-12-29', 7)).toBe('2027-01-05');
			expect(addDaysYmd('2026-09-18', -49)).toBe('2026-07-31');
		});
	});

	describe('generate', () => {
		it('crea N sesiones semanales con la misma hora (semanas variables)', async () => {
			const preps = await retreatPreparationService.generate(retreat.id, {
				weeks: 8,
				firstDate: '2026-07-14',
				time: '20:00',
			});
			expect(preps).toHaveLength(8);
			expect(preps[0]).toMatchObject({
				type: 'session',
				weekNumber: 1,
				title: '1ª preparación',
				date: '2026-07-14',
				time: '20:00',
			});
			expect(preps[7]).toMatchObject({
				weekNumber: 8,
				title: '8ª preparación',
				date: '2026-09-01',
			});
			// Todas separadas exactamente 7 días.
			for (let i = 1; i < preps.length; i++) {
				expect(preps[i].date).toBe(addDaysYmd(preps[i - 1].date!, 7));
			}
		});

		it('con includeDefaultDocs adjunta las plantillas markdown de la serie IX a cada semana', async () => {
			const preps = await retreatPreparationService.generate(retreat.id, {
				weeks: 7,
				firstDate: '2026-07-14',
				time: '20:00',
				includeDefaultDocs: true,
			});
			const byWeek = new Map(preps.map((p) => [p.weekNumber, p.documents ?? []]));
			// Semanas 1-4, 6, 7: un documento; semana 5: charla + dinámica.
			for (const w of [1, 2, 3, 4, 6, 7]) {
				expect(byWeek.get(w)).toHaveLength(1);
			}
			expect(byWeek.get(5)).toHaveLength(2);
			expect(byWeek.get(1)![0].fileName).toBe('1ª preparación — Servicio.md');
			expect(byWeek.get(1)![0].kind).toBe('markdown');
			// Semanas extra (>7) no tienen documento por defecto.
			const extra = await retreatPreparationService.generate(retreat.id, {
				weeks: 9,
				firstDate: '2026-07-14',
				time: '20:00',
				clearExisting: true,
				includeDefaultDocs: true,
			});
			expect(extra.find((p) => p.weekNumber === 9)!.documents ?? []).toHaveLength(0);
		});

		it('con includeOriginalDocx adjunta además el .docx original', async () => {
			const preps = await retreatPreparationService.generate(retreat.id, {
				weeks: 1,
				firstDate: '2026-07-14',
				time: '20:00',
				includeDefaultDocs: true,
				includeOriginalDocx: true,
			});
			const docs = preps[0].documents ?? [];
			expect(docs).toHaveLength(2);
			expect(docs.map((d) => d.kind).sort()).toEqual(['file', 'markdown']);
			expect(docs.find((d) => d.kind === 'file')!.fileName).toBe(
				'1ª preparación — Servicio.docx',
			);
		});

		it('la plantilla guarda los placeholders crudos pero se lee resuelta', async () => {
			const preps = await retreatPreparationService.generate(retreat.id, {
				weeks: 7,
				firstDate: '2026-07-14',
				time: '20:00',
				includeDefaultDocs: true,
			});
			const doc = (preps[0].documents ?? [])[0];

			// El content persistido es la PLANTILLA: nunca se congela.
			expect(doc.content).toContain('{preparations.table}');
			expect(doc.content).toContain('{retreat.maxWalkers}');

			// Lo que se lee/imprime ya trae las fechas de ESTE retiro.
			expect(doc.renderedContent).not.toContain('{preparations.table}');
			expect(doc.renderedContent).toContain('| # | Fecha | Preparación |');
			expect(doc.renderedContent).toContain('14 de julio de 2026');
			// Y ningún rastro del retiro del que venía el .docx original.
			expect(doc.renderedContent).not.toContain('Polanco');
		});

		it('mover una fecha actualiza la tabla del documento sin regenerarlo', async () => {
			const preps = await retreatPreparationService.generate(retreat.id, {
				weeks: 7,
				firstDate: '2026-07-14',
				time: '20:00',
				includeDefaultDocs: true,
			});
			const docId = (preps[0].documents ?? [])[0].id;

			await retreatPreparationService.skipForHoliday(preps[2].id, 'Día feriado');

			const after = await retreatPreparationService.listForRetreat(retreat.id);
			const doc = after
				.flatMap((p) => p.documents ?? [])
				.find((d) => d.id === docId)!;
			// El break aparece en la tabla y las fechas se corrieron solas.
			expect(doc.renderedContent).toContain('Día feriado');
			expect(doc.renderedContent).toContain('7 de julio de 2026');
			expect(doc.content).toContain('{preparations.table}');
		});
	});

	describe('alcance público de las variables', () => {
		it('un documento público NO resuelve los datos de pago del retiro', async () => {
			// Un coordinador puede escribir cualquier {retreat.*} en el markdown.
			// Por el enlace público eso no debe poder publicar la info bancaria.
			await getDS()
				.getRepository('Retreat')
				.update(retreat.id, {
					isPublic: true,
					slug: 'retiro-publico-test',
					paymentInfo: 'CLABE 012345678901234567',
					cost: '$3,500',
				} as any);

			const preps = await retreatPreparationService.generate(retreat.id, {
				weeks: 1,
				firstDate: '2026-07-14',
				time: '20:00',
			});
			await retreatPreparationService.createMarkdownDocument(preps[0].id, {
				title: 'Filtracion',
				content: 'Pago: {retreat.paymentInfo} — Costo: {retreat.cost} — {retreat.parish}',
			});

			const publico = await retreatPreparationService.getPublicBySlug('retiro-publico-test');
			const doc = (publico!.preparations[0].documents ?? [])[0];
			expect(doc.renderedContent).not.toContain('CLABE');
			expect(doc.renderedContent).not.toContain('3,500');
			// Y lo que sí es público sigue resolviendo.
			expect(doc.renderedContent).toContain(retreat.parish);
		});

		it('el mismo documento sí resuelve todo para quien tiene acceso al retiro', async () => {
			await getDS()
				.getRepository('Retreat')
				.update(retreat.id, { paymentInfo: 'CLABE 012345678901234567' } as any);
			const preps = await retreatPreparationService.generate(retreat.id, {
				weeks: 1,
				firstDate: '2026-07-14',
				time: '20:00',
			});
			await retreatPreparationService.createMarkdownDocument(preps[0].id, {
				title: 'Interno',
				content: 'Pago: {retreat.paymentInfo}',
			});

			const interno = await retreatPreparationService.listForRetreat(retreat.id);
			const doc = (interno[0].documents ?? [])[0];
			expect(doc.renderedContent).toContain('CLABE');
		});
	});

	describe('resyncDefaultDocuments', () => {
		it('reemplaza el .docx de fábrica por la plantilla y conserva el original', async () => {
			const preps = await retreatPreparationService.generate(retreat.id, {
				weeks: 1,
				firstDate: '2026-07-14',
				time: '20:00',
			});
			// Simula un retiro viejo: solo el .docx adjunto.
			await retreatPreparationService.addDocument(preps[0].id, {
				fileName: '1ª preparación — Servicio.docx',
				mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
				dataUrl: `data:application/vnd.openxmlformats-officedocument.wordprocessingml.document;base64,${Buffer.from('docx').toString('base64')}`,
			});

			const result = await retreatPreparationService.resyncDefaultDocuments(retreat.id);
			expect(result.added).toBe(1);
			expect(result.removed).toBe(0);

			const after = await retreatPreparationService.listForRetreat(retreat.id);
			const docs = after[0].documents ?? [];
			expect(docs).toHaveLength(2);
			const markdown = docs.find((d) => d.kind === 'markdown')!;
			expect(markdown.renderedContent).toContain('| # | Fecha | Preparación |');

			// Idempotente: correrlo otra vez no duplica.
			const again = await retreatPreparationService.resyncDefaultDocuments(retreat.id);
			expect(again.added).toBe(0);
		});

		it('con removeLegacy borra el .docx original', async () => {
			const preps = await retreatPreparationService.generate(retreat.id, {
				weeks: 1,
				firstDate: '2026-07-14',
				time: '20:00',
			});
			await retreatPreparationService.addDocument(preps[0].id, {
				fileName: '1ª preparación — Servicio.docx',
				mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
				dataUrl: `data:application/vnd.openxmlformats-officedocument.wordprocessingml.document;base64,${Buffer.from('docx').toString('base64')}`,
			});

			const result = await retreatPreparationService.resyncDefaultDocuments(retreat.id, {
				removeLegacy: true,
			});
			expect(result).toMatchObject({ added: 1, removed: 1 });

			const after = await retreatPreparationService.listForRetreat(retreat.id);
			const docs = after[0].documents ?? [];
			expect(docs).toHaveLength(1);
			expect(docs[0].kind).toBe('markdown');
		});

		it('no toca un documento que el coordinador renombró', async () => {
			const preps = await retreatPreparationService.generate(retreat.id, {
				weeks: 1,
				firstDate: '2026-07-14',
				time: '20:00',
			});
			await retreatPreparationService.addDocument(preps[0].id, {
				fileName: 'Servicio (versión de la comunidad).docx',
				mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
				dataUrl: `data:application/vnd.openxmlformats-officedocument.wordprocessingml.document;base64,${Buffer.from('docx').toString('base64')}`,
			});

			const result = await retreatPreparationService.resyncDefaultDocuments(retreat.id, {
				removeLegacy: true,
			});
			expect(result).toMatchObject({ added: 0, removed: 0 });

			const after = await retreatPreparationService.listForRetreat(retreat.id);
			expect(after[0].documents).toHaveLength(1);
			expect((after[0].documents ?? [])[0].fileName).toBe(
				'Servicio (versión de la comunidad).docx',
			);
		});

		it('sin includeDefaultDocs genera el calendario vacío de documentos', async () => {
			const preps = await retreatPreparationService.generate(retreat.id, {
				weeks: 7,
				firstDate: '2026-07-14',
				time: '20:00',
			});
			expect(preps.every((p) => (p.documents ?? []).length === 0)).toBe(true);
		});

		it('rechaza regenerar sin clearExisting y reemplaza con clearExisting', async () => {
			await retreatPreparationService.generate(retreat.id, {
				weeks: 7,
				firstDate: '2026-07-14',
				time: '20:00',
			});
			await expect(
				retreatPreparationService.generate(retreat.id, {
					weeks: 7,
					firstDate: '2026-07-15',
					time: '19:00',
				}),
			).rejects.toThrow(PreparationValidationError);

			const replaced = await retreatPreparationService.generate(retreat.id, {
				weeks: 9,
				firstDate: '2026-07-15',
				time: '19:00',
				clearExisting: true,
			});
			expect(replaced).toHaveLength(9);
			expect(replaced[0].date).toBe('2026-07-15');
			expect(replaced[0].time).toBe('19:00');
		});
	});

	describe('skipForHoliday', () => {
		it('marca festivo en la fecha original y adelanta −7 días esa sesión y las anteriores (la primera toma una fecha anterior)', async () => {
			const preps = await retreatPreparationService.generate(retreat.id, {
				weeks: 7,
				firstDate: '2026-07-14',
				time: '20:00',
			});
			const week3 = preps.find((p) => p.weekNumber === 3)!; // 2026-07-28

			const after = await retreatPreparationService.skipForHoliday(week3.id, 'Semana Santa');

			const breaks = after.filter((p) => p.type === 'break');
			expect(breaks).toHaveLength(1);
			expect(breaks[0]).toMatchObject({ date: '2026-07-28', title: 'Semana Santa' });

			const byWeek = new Map(
				after.filter((p) => p.type === 'session').map((p) => [p.weekNumber, p.date]),
			);
			// La fecha del retiro es fija: el final queda anclado y el calendario
			// crece hacia atrás. Semanas 1-3 se adelantan; 4..7 intactas.
			expect(byWeek.get(1)).toBe('2026-07-07');
			expect(byWeek.get(2)).toBe('2026-07-14');
			expect(byWeek.get(3)).toBe('2026-07-21');
			expect(byWeek.get(4)).toBe('2026-08-04');
			expect(byWeek.get(7)).toBe('2026-08-25');

			// Orden del calendario: … semana 3 (07-21), festivo (07-28), semana 4 (08-04) …
			const idxBreak = after.findIndex((p) => p.type === 'break');
			const idxWeek3 = after.findIndex((p) => p.weekNumber === 3);
			const idxWeek4 = after.findIndex((p) => p.weekNumber === 4);
			expect(idxBreak).toBeGreaterThan(idxWeek3);
			expect(idxBreak).toBeLessThan(idxWeek4);
		});

		it('la última preparación nunca se acerca al retiro: saltar la última solo adelanta las previas', async () => {
			const preps = await retreatPreparationService.generate(retreat.id, {
				weeks: 7,
				firstDate: '2026-07-31',
				time: '20:00',
			});
			const week7 = preps.find((p) => p.weekNumber === 7)!; // 2026-09-11
			const after = await retreatPreparationService.skipForHoliday(week7.id, 'Festivo');

			const byWeek = new Map(
				after.filter((p) => p.type === 'session').map((p) => [p.weekNumber, p.date]),
			);
			// Todas se adelantan una semana; ninguna fecha supera la original de la 7ª.
			expect(byWeek.get(1)).toBe('2026-07-24');
			expect(byWeek.get(7)).toBe('2026-09-04');
			const maxDate = [...byWeek.values()].sort().pop();
			expect(maxDate! < '2026-09-11').toBe(true);
		});

		it('rechaza saltar un break o una sesión sin fecha', async () => {
			const noDate = await retreatPreparationService.create(retreat.id, {
				title: 'Sin fecha',
			});
			await expect(retreatPreparationService.skipForHoliday(noDate.id)).rejects.toThrow(
				PreparationValidationError,
			);
		});
	});

	describe('documentos', () => {
		let session: RetreatPreparation;

		beforeEach(async () => {
			const preps = await retreatPreparationService.generate(retreat.id, {
				weeks: 7,
				firstDate: '2026-07-14',
				time: '20:00',
			});
			session = preps[0];
		});

		it('sube un archivo (inline sin S3) y lo borra', async () => {
			const doc = await retreatPreparationService.addDocument(session.id, {
				fileName: '1a preparación. Servicio.pdf',
				mimeType: 'application/pdf',
				dataUrl: PDF_DATA_URL,
			});
			expect(doc.kind).toBe('file');
			expect(doc.url.startsWith('data:application/pdf;base64,')).toBe(true);

			const list = await retreatPreparationService.listForRetreat(retreat.id);
			expect(list[0].documents).toHaveLength(1);

			expect(await retreatPreparationService.removeDocument(doc.id)).toBe(true);
		});

		it('rechaza tipos de archivo no permitidos y documentos en breaks', async () => {
			await expect(
				retreatPreparationService.addDocument(session.id, {
					fileName: 'x.exe',
					mimeType: 'application/x-msdownload',
					dataUrl: 'data:application/x-msdownload;base64,QUJD',
				}),
			).rejects.toThrow(PreparationValidationError);

			const brk = await retreatPreparationService.create(retreat.id, {
				type: 'break',
				title: 'Festivo',
				date: '2026-07-28',
			});
			await expect(
				retreatPreparationService.addDocument(brk.id, {
					fileName: 'a.pdf',
					mimeType: 'application/pdf',
					dataUrl: PDF_DATA_URL,
				}),
			).rejects.toThrow(PreparationValidationError);
		});

		it('crea y edita documentos de texto markdown', async () => {
			const doc = await retreatPreparationService.createMarkdownDocument(session.id, {
				title: 'Guía de la semana',
				content: '# Servicio\n\nLeer antes de la reunión.',
			});
			expect(doc.kind).toBe('markdown');
			expect(doc.fileName).toBe('Guía de la semana.md');

			const updated = await retreatPreparationService.updateMarkdownDocument(doc.id, {
				content: '# Servicio v2',
			});
			expect(updated.content).toBe('# Servicio v2');

			// Un archivo no se puede editar como markdown.
			const fileDoc = await retreatPreparationService.addDocument(session.id, {
				fileName: 'a.pdf',
				mimeType: 'application/pdf',
				dataUrl: PDF_DATA_URL,
			});
			await expect(
				retreatPreparationService.updateMarkdownDocument(fileDoc.id, { content: 'x' }),
			).rejects.toThrow(PreparationValidationError);
		});
	});

	describe('vista pública por slug', () => {
		it('expone el calendario solo si el retiro es público', async () => {
			await retreatPreparationService.generate(retreat.id, {
				weeks: 7,
				firstDate: '2026-07-14',
				time: '20:00',
			});
			const ds = getDS();
			await ds.query(`UPDATE retreat SET slug = 'mi-retiro', isPublic = 0 WHERE id = ?`, [
				retreat.id,
			]);
			expect(await retreatPreparationService.getPublicBySlug('mi-retiro')).toBeNull();

			await ds.query(`UPDATE retreat SET isPublic = 1 WHERE id = ?`, [retreat.id]);
			const data = await retreatPreparationService.getPublicBySlug('mi-retiro');
			expect(data).not.toBeNull();
			expect(data!.preparations).toHaveLength(7);
			expect(data!.retreat.id).toBe(retreat.id);

			expect(await retreatPreparationService.getPublicBySlug('no-existe')).toBeNull();
		});
	});
});
