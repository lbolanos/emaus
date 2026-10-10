import { setupTestDatabase, teardownTestDatabase, clearTestData } from '../test-setup';
import { TestDataFactory } from '../test-utils/testDataFactory';
import { AppDataSource } from '@/data-source';
import { DomainAuditLog } from '@/entities/domainAuditLog.entity';
import {
	createResponsability,
	updateResponsability,
	deleteResponsability,
	assignResponsabilityToParticipant,
	removeResponsabilityFromParticipant,
	createAndAssignSpeaker,
} from '@/services/responsabilityService';
import { responsabilityAttachmentService } from '@/services/responsabilityAttachmentService';
import { auditContext } from '@/utils/auditContext';

// Tanda P2, bloque B: las responsabilidades del retiro (logística, palanqueros,
// charlistas…) y sus documentos (manuales en markdown/archivos) mutaban sin
// rastro. El CRUD, la asignación a participantes y el versionado de documentos
// ahora dejan fila; las semillas automáticas del retiro no se auditan.
describe('responsabilidades — auditoría de dominio', () => {
	beforeAll(async () => {
		await setupTestDatabase();
	});

	afterAll(async () => {
		await teardownTestDatabase();
	});

	beforeEach(async () => {
		await clearTestData();
	});

	const auditRepo = () => AppDataSource.getRepository(DomainAuditLog);

	async function waitForLogs(
		predicate: (rows: DomainAuditLog[]) => boolean,
		tries = 60,
		delayMs = 5,
	): Promise<DomainAuditLog[]> {
		let rows = await auditRepo().find();
		for (let i = 0; i < tries && !predicate(rows); i++) {
			await new Promise((r) => setTimeout(r, delayMs));
			rows = await auditRepo().find();
		}
		return rows;
	}

	const rowsOf = (rows: DomainAuditLog[], action: string) =>
		rows.filter((r) => r.action === action);
	const meta = (row: DomainAuditLog) => JSON.parse(row.metadata ?? '{}');

	it('create/update/delete de responsabilidad con retreatId y actor', async () => {
		const actor = await TestDataFactory.createTestUser();
		const retreat = await TestDataFactory.createTestRetreat({ createdBy: actor.id });

		await auditContext.run({ userId: actor.id, ip: '10.0.0.61' }, async () => {
			const resp = await createResponsability({
				name: 'Coordinación de sonido',
				retreatId: retreat.id,
			});
			await updateResponsability(resp.id, { name: 'Sonido y proyección' });
			await deleteResponsability(resp.id);
		});

		const rows = await waitForLogs((r) => rowsOf(r, 'responsability.delete').length > 0);
		const create = rowsOf(rows, 'responsability.create')[0];
		expect(create.resourceType).toBe('responsability');
		expect(create.retreatId).toBe(retreat.id);
		expect(create.actorUserId).toBe(actor.id);
		expect(create.ipAddress).toBe('10.0.0.61');
		expect(JSON.parse(create.newValues!)).toMatchObject({ name: 'Coordinación de sonido' });

		const update = rowsOf(rows, 'responsability.update')[0];
		expect(JSON.parse(update.oldValues!)).toMatchObject({ name: 'Coordinación de sonido' });
		expect(JSON.parse(update.newValues!)).toMatchObject({ name: 'Sonido y proyección' });

		const del = rowsOf(rows, 'responsability.delete')[0];
		expect(JSON.parse(del.oldValues!)).toMatchObject({ name: 'Sonido y proyección' });
	});

	it('assign/remove registran el participantId viejo y el nuevo', async () => {
		const retreat = await TestDataFactory.createTestRetreat();
		const participant = await TestDataFactory.createTestParticipant(retreat.id);
		const other = await TestDataFactory.createTestParticipant(retreat.id);
		const resp = await createResponsability({ name: 'Tesorería', retreatId: retreat.id });

		await assignResponsabilityToParticipant(resp.id, participant.id);
		await assignResponsabilityToParticipant(resp.id, other.id);
		await removeResponsabilityFromParticipant(resp.id, other.id);

		const rows = await waitForLogs(
			(r) => rowsOf(r, 'responsability.remove').length > 0,
		);
		const assigns = rowsOf(rows, 'responsability.assign');
		expect(assigns).toHaveLength(2);
		expect(JSON.parse(assigns[0].oldValues!)).toMatchObject({ participantId: null });
		expect(JSON.parse(assigns[0].newValues!)).toMatchObject({ participantId: participant.id });
		// Reasignar directo: el diff muestra el reemplazo.
		expect(JSON.parse(assigns[1].oldValues!)).toMatchObject({ participantId: participant.id });
		expect(JSON.parse(assigns[1].newValues!)).toMatchObject({ participantId: other.id });

		const remove = rowsOf(rows, 'responsability.remove')[0];
		expect(JSON.parse(remove.oldValues!)).toMatchObject({ participantId: other.id });
		expect(JSON.parse(remove.newValues!)).toMatchObject({ participantId: null });
	});

	it('createAndAssignSpeaker deja create_speaker con el nombre y sin PII', async () => {
		const retreat = await TestDataFactory.createTestRetreat();
		const resp = await createResponsability({
			name: 'Charla: De la Rosa',
			retreatId: retreat.id,
		});

		const saved = await createAndAssignSpeaker(resp.id, {
			firstName: 'Ana',
			lastName: 'Torres',
			cellPhone: '5587654321',
			retreatId: retreat.id,
		});

		const rows = await waitForLogs(
			(r) => rowsOf(r, 'responsability.create_speaker').length > 0,
		);
		const row = rowsOf(rows, 'responsability.create_speaker')[0];
		expect(row.resourceId).toBe(resp.id);
		expect(row.retreatId).toBe(retreat.id);
		expect(JSON.parse(row.newValues!)).toMatchObject({
			participantId: saved!.participantId,
		});
		expect(meta(row)).toMatchObject({
			speakerName: 'Ana Torres',
			hasPhone: true,
			hasEmail: false,
		});
		// El teléfono nunca entra al evento.
		const raw = JSON.stringify(row);
		expect(raw).not.toContain('5587654321');
	});

	it('documento markdown: create → update → restore_version → delete', async () => {
		const doc = await responsabilityAttachmentService.createMarkdown('Santísimo', {
			title: 'Guion de adoración',
			content: 'Versión inicial del guion.',
		});
		// Edición de contenido: snapshotea la versión previa al historial.
		// (Contenido de longitud DISTINTA: el diff de sizeBytes es el assert.)
		await responsabilityAttachmentService.updateMarkdown(doc.id, {
			content: 'Versión editada del guion, revisada por el coordinador.',
		});
		const history = await responsabilityAttachmentService.listMarkdownHistory(doc.id);
		expect(history).toHaveLength(1);
		await responsabilityAttachmentService.restoreMarkdownVersion(doc.id, history[0].id);
		await responsabilityAttachmentService.delete(doc.id);

		const rows = await waitForLogs(
			(r) => rowsOf(r, 'responsability_attachment.delete').length > 0,
		);
		const create = rowsOf(rows, 'responsability_attachment.create')[0];
		// Cuelga del nombre de la responsabilidad, no de un retiro.
		expect(create.retreatId).toBeNull();
		expect(JSON.parse(create.newValues!)).toMatchObject({
			responsabilityName: 'Santísimo',
			kind: 'markdown',
			fileName: 'Guion de adoración.md',
		});

		const update = rowsOf(rows, 'responsability_attachment.update')[0];
		expect(meta(update).historySnapshot).toBe(true);
		expect(JSON.parse(update.oldValues!).sizeBytes).toBeLessThan(
			JSON.parse(update.newValues!).sizeBytes,
		);
		// El contenido markdown nunca entra al log.
		expect(JSON.stringify(update)).not.toContain('Versión inicial');

		const restore = rowsOf(rows, 'responsability_attachment.restore_version')[0];
		expect(meta(restore).historyId).toBe(history[0].id);
		// Restaurar vuelve exactamente al tamaño de la versión de historial.
		expect(JSON.parse(restore.newValues!).sizeBytes).toBe(history[0].sizeBytes);

		const del = rowsOf(rows, 'responsability_attachment.delete')[0];
		expect(meta(del)).toMatchObject({ kind: 'markdown', hadS3Asset: false });
	});

	it('upload de archivo registra el documento inline sin el data:URL', async () => {
		const tinyPng =
			'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

		const saved = await responsabilityAttachmentService.upload('Logistica', {
			dataUrl: tinyPng,
			fileName: 'inventario.png',
			mimeType: 'image/png',
		});

		const rows = await waitForLogs(
			(r) => rowsOf(r, 'responsability_attachment.create').length > 0,
		);
		const row = rowsOf(rows, 'responsability_attachment.create')[0];
		expect(row.resourceId).toBe(saved.id);
		expect(JSON.parse(row.newValues!)).toMatchObject({
			responsabilityName: 'Logistica',
			kind: 'file',
			mimeType: 'image/png',
		});
		expect(meta(row)).toMatchObject({ storage: 'inline' });
		// La data:URL (payload completo del archivo) jamás entra al log.
		expect(JSON.stringify(row)).not.toContain('base64');
	});
});
