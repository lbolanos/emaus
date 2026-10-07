import { setupTestDatabase, teardownTestDatabase, clearTestData } from '../test-setup';
import { TestDataFactory } from '../test-utils/testDataFactory';
import { AppDataSource } from '@/data-source';
import { DomainAuditLog } from '@/entities/domainAuditLog.entity';
import { crmService } from '@/services/crmService';
import { auditContext } from '@/utils/auditContext';

// Bloque C de la auditoría de dominio: el seguimiento (follow-up) y las tareas
// del CRM mutaban sin rastro. Las notas NO se auditan al crear/editar (son
// trabajo vivo del equipo); sólo su borrado deja fila, y el cuerpo nunca
// entra al log — viaja su tamaño (`bodyChars`).
describe('CRM de seguimiento — auditoría de dominio', () => {
	beforeAll(async () => {
		await setupTestDatabase();
	});

	afterAll(async () => {
		await teardownTestDatabase();
	});

	beforeEach(async () => {
		// clearTestData no cubre las tablas del CRM: limpiarlas después, hijas
		// de participant/retreat primero, para no chocar con las FKs.
		await clearTestData();
		await AppDataSource.query('DELETE FROM participant_notes');
		await AppDataSource.query('DELETE FROM participant_followups');
		await AppDataSource.query('DELETE FROM crm_tasks');
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
	// Para las aserciones negativas: dar tiempo al insert fire-and-forget.
	const settle = (ms = 150) => new Promise((r) => setTimeout(r, ms));

	it('upsertFollowUp: sólo el cambio de etapa deja fila; la sincronía de asistencia queda registrada', async () => {
		const actor = await TestDataFactory.createTestUser();
		const retreat = await TestDataFactory.createTestRetreat({ createdBy: actor.id });
		const participant = await TestDataFactory.createTestParticipant(retreat.id);

		await auditContext.run({ userId: actor.id }, async () => {
			await crmService.upsertFollowUp({
				retreatId: retreat.id,
				participantId: participant.id,
				status: 'contacted',
			});
		});
		let rows = await waitForLogs((r) => rowsOf(r, 'crm_follow_up.update').length > 0);
		let updates = rowsOf(rows, 'crm_follow_up.update');
		expect(updates).toHaveLength(1);
		expect(updates[0].retreatId).toBe(retreat.id);
		expect(JSON.parse(updates[0].newValues!)).toMatchObject({ status: 'contacted' });
		expect(meta(updates[0])).toMatchObject({ participantId: participant.id, attendanceSynced: false });

		// Flush §25.3 antes de la segunda llamada (abre transacción).
		await crmService.upsertFollowUp({
			retreatId: retreat.id,
			participantId: participant.id,
			status: 'confirmed',
		});
		rows = await waitForLogs((r) => rowsOf(r, 'crm_follow_up.update').length > 1);
		updates = rowsOf(rows, 'crm_follow_up.update');
		const confirmed = updates[updates.length - 1];
		expect(JSON.parse(confirmed.oldValues!)).toMatchObject({ status: 'contacted' });
		expect(JSON.parse(confirmed.newValues!)).toMatchObject({ status: 'confirmed' });
		// confirmed escribe también la asistencia del participante.
		expect(meta(confirmed)).toMatchObject({ attendanceSynced: true });

		// Repetir la misma etapa no es un cambio: ninguna fila nueva.
		await crmService.upsertFollowUp({
			retreatId: retreat.id,
			participantId: participant.id,
			status: 'confirmed',
		});
		await settle();
		rows = await auditRepo().find();
		expect(rowsOf(rows, 'crm_follow_up.update')).toHaveLength(2);
	});

	it('tareas: create/update/delete con retreatId y descriptionChars', async () => {
		const retreat = await TestDataFactory.createTestRetreat();

		const task = await crmService.createTask({
			retreatId: retreat.id,
			title: 'Llamar a Juan',
			description: 'Confirmar el pago del depósito',
		});
		let rows = await waitForLogs((r) => rowsOf(r, 'crm_task.create').length > 0);
		const create = rowsOf(rows, 'crm_task.create')[0];
		expect(create.retreatId).toBe(retreat.id);
		expect(create.resourceId).toBe(task.id);
		expect(JSON.parse(create.newValues!)).toMatchObject({ title: 'Llamar a Juan', status: 'open' });
		expect(meta(create).descriptionChars).toBe('Confirmar el pago del depósito'.length);
		// La descripción es free text: nunca entra al diff.
		expect(JSON.parse(create.newValues!)).not.toHaveProperty('description');

		await crmService.updateTask(task.id, { title: 'Llamar a Juan Pérez', status: 'done' });
		rows = await waitForLogs((r) => rowsOf(r, 'crm_task.update').length > 0);
		const update = rowsOf(rows, 'crm_task.update')[0];
		expect(update.retreatId).toBe(retreat.id);
		expect(JSON.parse(update.oldValues!)).toMatchObject({ title: 'Llamar a Juan', status: 'open' });
		expect(JSON.parse(update.newValues!)).toMatchObject({ title: 'Llamar a Juan Pérez', status: 'done' });

		const ok = await crmService.deleteTask(task.id);
		expect(ok).toBe(true);
		rows = await waitForLogs((r) => rowsOf(r, 'crm_task.delete').length > 0);
		const del = rowsOf(rows, 'crm_task.delete')[0];
		expect(del.retreatId).toBe(retreat.id);
		expect(JSON.parse(del.oldValues!)).toMatchObject({ title: 'Llamar a Juan Pérez' });
	});

	it('notas: crear/editar no deja rastro; borrar sí, sin el cuerpo', async () => {
		const actor = await TestDataFactory.createTestUser();
		const retreat = await TestDataFactory.createTestRetreat({ createdBy: actor.id });
		const participant = await TestDataFactory.createTestParticipant(retreat.id);

		const BODY = 'La mamá llamó, quiere hablar con la coordinación';
		const note = await crmService.createNote({
			retreatId: retreat.id,
			participantId: participant.id,
			body: BODY,
			createdBy: actor.id,
		});
		await crmService.updateNote(note.id, `${BODY} (2)`, actor.id);
		await settle();
		let rows = await auditRepo().find();
		expect(rows.filter((r) => r.resourceType === 'participant_note')).toHaveLength(0);

		const ok = await crmService.deleteNote(note.id, actor.id);
		expect(ok).toBe(true);
		rows = await waitForLogs((r) => rowsOf(r, 'participant_note.delete').length > 0);
		const del = rowsOf(rows, 'participant_note.delete')[0];
		expect(del.retreatId).toBe(retreat.id);
		expect(del.resourceId).toBe(note.id);
		expect(meta(del)).toMatchObject({
			participantId: participant.id,
			authorId: actor.id,
			bodyChars: `${BODY} (2)`.length,
		});
		// El contenido de la nota es PII sensible: no debe existir en crudo
		// en ninguna columna del log.
		const blob = [del.oldValues, del.newValues, del.metadata].join(' ');
		expect(blob).not.toContain('mamá');
	});

	it('setDoNotContact: diff sólo al cambiar, con retreatId enlazado', async () => {
		const retreat = await TestDataFactory.createTestRetreat();
		const participant = await TestDataFactory.createTestParticipant(retreat.id);

		await crmService.setDoNotContact(participant.id, true, retreat.id);
		let rows = await waitForLogs((r) =>
			rowsOf(r, 'participant.update').some((row) => row.resourceId === participant.id),
		);
		const dncRows = rowsOf(rows, 'participant.update').filter((r) => r.resourceId === participant.id);
		expect(dncRows).toHaveLength(1);
		expect(dncRows[0].retreatId).toBe(retreat.id);
		expect(JSON.parse(dncRows[0].oldValues!)).toMatchObject({ doNotContact: false });
		expect(JSON.parse(dncRows[0].newValues!)).toMatchObject({ doNotContact: true });

		// Repetir el mismo valor no deja fila nueva; apagarlo sí.
		await crmService.setDoNotContact(participant.id, true, retreat.id);
		await settle();
		rows = await auditRepo().find();
		expect(
			rowsOf(rows, 'participant.update').filter((r) => r.resourceId === participant.id),
		).toHaveLength(1);

		await crmService.setDoNotContact(participant.id, false, retreat.id);
		rows = await waitForLogs(
			(r) => rowsOf(r, 'participant.update').filter((row) => row.resourceId === participant.id).length > 1,
		);
		const off = rowsOf(rows, 'participant.update').filter((r) => r.resourceId === participant.id);
		expect(JSON.parse(off[off.length - 1].newValues!)).toMatchObject({ doNotContact: false });
	});
});
