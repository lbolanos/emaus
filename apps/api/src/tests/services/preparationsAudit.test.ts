import { setupTestDatabase, teardownTestDatabase, clearTestData } from '../test-setup';
import { TestDataFactory } from '../test-utils/testDataFactory';
import { AppDataSource } from '@/data-source';
import { DomainAuditLog } from '@/entities/domainAuditLog.entity';
import { RetreatPreparation } from '@/entities/retreatPreparation.entity';
import { retreatPreparationService } from '@/services/retreatPreparationService';

// Bloque C de la auditoría de dominio: el calendario de preparaciones del
// equipo servidor mutaba sin rastro. La generación masiva y el salto por
// festivo dejan UN evento agregado por retiro (no una fila por sesión); el
// CRUD de sesiones y documentos sí deja filas individuales. El contenido
// markdown y la url (data: o S3) NUNCA entran al log: viajan tamaños y
// banderas.
describe('preparaciones — auditoría de dominio', () => {
	beforeAll(async () => {
		await setupTestDatabase();
	});

	afterAll(async () => {
		await teardownTestDatabase();
	});

	beforeEach(async () => {
		// clearTestData no cubre las preparaciones: documentos (hija) primero.
		await clearTestData();
		await AppDataSource.query('DELETE FROM retreat_preparation_document');
		await AppDataSource.query('DELETE FROM retreat_preparation');
	});

	const auditRepo = () => AppDataSource.getRepository(DomainAuditLog);

	async function waitForLogs(
		predicate: (rows: DomainAuditLog[]) => boolean,
		tries = 60,
		delayMs = 5,
	): Promise<DomainAuditLog[]> {
		for (let i = 0; i < tries; i++) {
			const rows = await auditRepo().find();
			if (predicate(rows)) return rows;
			await new Promise((r) => setTimeout(r, delayMs));
		}
		return auditRepo().find();
	}

	const rowsOf = (rows: DomainAuditLog[], action: string) => rows.filter((r) => r.action === action);
	const meta = (row: DomainAuditLog) => JSON.parse(row.metadata ?? '{}');
	const prepRepo = () => AppDataSource.getRepository(RetreatPreparation);

	it('generate deja un agregado por retiro; regenerar cuenta lo limpiado', async () => {
		const retreat = await TestDataFactory.createTestRetreat();

		const entries = await retreatPreparationService.generate(retreat.id, {
			weeks: 2,
			firstDate: '2026-11-05',
			time: '19:30',
		});
		expect(entries).toHaveLength(2);

		let rows = await waitForLogs((r) => rowsOf(r, 'retreat_preparation.generate').length > 0);
		const gen = rowsOf(rows, 'retreat_preparation.generate')[0];
		// Agregado: resourceId = el retiro, no una sesión.
		expect(gen.resourceId).toBe(retreat.id);
		expect(gen.retreatId).toBe(retreat.id);
		expect(meta(gen)).toMatchObject({
			weeks: 2,
			firstDate: '2026-11-05',
			time: '19:30',
			created: 2,
			cleared: 0,
			clearedDocs: 0,
			clearExisting: false,
		});
		// La generación masiva no ensucia con filas por sesión.
		expect(rowsOf(rows, 'retreat_preparation.create')).toHaveLength(0);

		await retreatPreparationService.generate(retreat.id, {
			weeks: 3,
			firstDate: '2026-11-05',
			time: '19:30',
			clearExisting: true,
		});
		rows = await waitForLogs(
			(r) => rowsOf(r, 'retreat_preparation.generate').length > 1,
		);
		const regen = rowsOf(rows, 'retreat_preparation.generate')[1];
		expect(meta(regen)).toMatchObject({ cleared: 2, clearedDocs: 0, created: 3, clearExisting: true });
	});

	it('CRUD de sesión: diff de campos y cascadeDocuments al borrar', async () => {
		const retreat = await TestDataFactory.createTestRetreat();

		const session = await retreatPreparationService.create(retreat.id, {
			type: 'session',
			weekNumber: 1,
			title: 'Preparación inicial',
			date: '2026-11-05',
			time: '19:30',
			description: 'Primera reunión del equipo',
		});
		let rows = await waitForLogs((r) => rowsOf(r, 'retreat_preparation.create').length > 0);
		const create = rowsOf(rows, 'retreat_preparation.create')[0];
		expect(create.retreatId).toBe(retreat.id);
		expect(create.resourceId).toBe(session.id);
		expect(JSON.parse(create.newValues!)).toMatchObject({
			title: 'Preparación inicial',
			date: '2026-11-05',
		});
		expect(meta(create).descriptionChars).toBe('Primera reunión del equipo'.length);
		expect(JSON.parse(create.newValues!)).not.toHaveProperty('description');

		await retreatPreparationService.update(session.id, { title: 'Preparación de apertura' });
		rows = await waitForLogs((r) => rowsOf(r, 'retreat_preparation.update').length > 0);
		const update = rowsOf(rows, 'retreat_preparation.update')[0];
		expect(update.retreatId).toBe(retreat.id);
		expect(JSON.parse(update.oldValues!)).toMatchObject({ title: 'Preparación inicial' });
		expect(JSON.parse(update.newValues!)).toMatchObject({ title: 'Preparación de apertura' });

		await retreatPreparationService.createMarkdownDocument(session.id, {
			title: 'Guion',
			content: 'Hola mundo',
		});
		await waitForLogs((r) => rowsOf(r, 'retreat_preparation_document.create').length > 0);

		const ok = await retreatPreparationService.remove(session.id);
		expect(ok).toBe(true);
		rows = await waitForLogs((r) => rowsOf(r, 'retreat_preparation.delete').length > 0);
		const del = rowsOf(rows, 'retreat_preparation.delete')[0];
		expect(del.retreatId).toBe(retreat.id);
		expect(JSON.parse(del.oldValues!)).toMatchObject({ title: 'Preparación de apertura' });
		// Contado ANTES: el FK CASCADE borra el documento junto con la sesión.
		expect(meta(del)).toMatchObject({ cascadeDocuments: 1 });
	});

	it('skipForHoliday: un agregado con la fecha del festivo y las sesiones movidas', async () => {
		const retreat = await TestDataFactory.createTestRetreat();
		await retreatPreparationService.generate(retreat.id, {
			weeks: 3,
			firstDate: '2026-11-05',
			time: '19:30',
		});
		await waitForLogs((r) => rowsOf(r, 'retreat_preparation.generate').length > 0);

		// Saltar la semana 2 (2026-11-12): las sesiones 1 y 2 se adelantan 7 días.
		const week2 = await prepRepo().findOneOrFail({ where: { retreatId: retreat.id, weekNumber: 2 } });
		await retreatPreparationService.skipForHoliday(week2.id, 'Puente del 12');

		const rows = await waitForLogs((r) => rowsOf(r, 'retreat_preparation.skip_holiday').length > 0);
		const skip = rowsOf(rows, 'retreat_preparation.skip_holiday')[0];
		expect(skip.resourceId).toBe(retreat.id);
		expect(skip.retreatId).toBe(retreat.id);
		expect(JSON.parse(skip.newValues!)).toMatchObject({
			breakDate: '2026-11-12',
			reason: 'Puente del 12',
		});
		expect(meta(skip)).toMatchObject({ shiftedSessions: 2 });
		expect(meta(skip).breakEntryId).toEqual(expect.any(String));
		// El movimiento masivo no deja filas update por sesión.
		expect(rowsOf(rows, 'retreat_preparation.update')).toHaveLength(0);
	});

	it('documento markdown: create/update/delete sin volcar el contenido', async () => {
		const retreat = await TestDataFactory.createTestRetreat();
		const session = await retreatPreparationService.create(retreat.id, {
			type: 'session',
			weekNumber: 1,
			title: 'Preparación 1',
			date: '2026-11-05',
		});
		await waitForLogs((r) => rowsOf(r, 'retreat_preparation.create').length > 0);

		const doc = await retreatPreparationService.createMarkdownDocument(session.id, {
			title: 'Guion',
			content: 'Hola mundo',
		});
		let rows = await waitForLogs(
			(r) => rowsOf(r, 'retreat_preparation_document.create').length > 0,
		);
		const create = rowsOf(rows, 'retreat_preparation_document.create')[0];
		expect(create.retreatId).toBe(retreat.id);
		expect(JSON.parse(create.newValues!)).toMatchObject({
			fileName: 'Guion.md',
			kind: 'markdown',
			sizeBytes: 'Hola mundo'.length,
		});
		expect(meta(create)).toMatchObject({ contentChars: 'Hola mundo'.length });

		// Contenido de longitud DISTINTA para que el diff de sizeBytes exista.
		await retreatPreparationService.updateMarkdownDocument(doc.id, {
			content: 'Hola mundo editado',
		});
		rows = await waitForLogs(
			(r) => rowsOf(r, 'retreat_preparation_document.update').length > 0,
		);
		const update = rowsOf(rows, 'retreat_preparation_document.update')[0];
		// retreatId resuelto a través de la relación preparation.
		expect(update.retreatId).toBe(retreat.id);
		expect(JSON.parse(update.oldValues!)).toMatchObject({ sizeBytes: 'Hola mundo'.length });
		expect(JSON.parse(update.newValues!)).toMatchObject({ sizeBytes: 'Hola mundo editado'.length });
		expect(meta(update)).toMatchObject({ contentChanged: true, kind: 'markdown' });
		// El markdown es contenido: no debe existir en crudo en el log.
		const blob = [update.oldValues, update.newValues, update.metadata].join(' ');
		expect(blob).not.toContain('Hola mundo');

		const ok = await retreatPreparationService.removeDocument(doc.id);
		expect(ok).toBe(true);
		rows = await waitForLogs(
			(r) => rowsOf(r, 'retreat_preparation_document.delete').length > 0,
		);
		const del = rowsOf(rows, 'retreat_preparation_document.delete')[0];
		expect(del.retreatId).toBe(retreat.id);
		expect(meta(del)).toMatchObject({ hadS3Asset: false, kind: 'markdown' });
	});

	it('addDocument inline: metadata de storage y sin volcar el data:URL', async () => {
		const retreat = await TestDataFactory.createTestRetreat();
		const session = await retreatPreparationService.create(retreat.id, {
			type: 'session',
			weekNumber: 1,
			title: 'Preparación 1',
			date: '2026-11-05',
		});
		await waitForLogs((r) => rowsOf(r, 'retreat_preparation.create').length > 0);

		// PNG 1x1 mínimo, inline en el data:URL (sin S3 en el entorno de test).
		const PNG_1X1 =
			'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
		const doc = await retreatPreparationService.addDocument(session.id, {
			fileName: 'croquis.png',
			dataUrl: PNG_1X1,
		});

		const rows = await waitForLogs(
			(r) => rowsOf(r, 'retreat_preparation_document.create').length > 0,
		);
		const create = rowsOf(rows, 'retreat_preparation_document.create')[0];
		expect(create.retreatId).toBe(retreat.id);
		expect(JSON.parse(create.newValues!)).toMatchObject({
			fileName: 'croquis.png',
			mimeType: 'image/png',
		});
		expect(meta(create)).toMatchObject({ storage: 'inline' });
		// La url (data:URL con el binario) nunca entra al log.
		const blob = [create.oldValues, create.newValues, create.metadata].join(' ');
		expect(blob).not.toContain('base64');
	});
});
