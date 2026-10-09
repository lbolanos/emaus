// Mock del EmailService antes de importar el service (nada sale del sandbox).
// `mockSendEmail` es COMPARTIDO por instancia: los tests de envío fallido lo
// puentean con mockResolvedValueOnce(false) sin tocar el default (éxito).
const mockSendEmail = jest.fn(async () => true);
jest.mock('@/services/emailService', () => ({
	EmailService: jest.fn(() => ({
		sendEmail: mockSendEmail,
	})),
}));

import { setupTestDatabase, teardownTestDatabase, clearTestData } from '../test-setup';
import { TestDataFactory } from '../test-utils/testDataFactory';
import { MessageSequenceService } from '@/services/messageSequenceService';
import { AppDataSource } from '@/data-source';
import { DomainAuditLog } from '@/entities/domainAuditLog.entity';
import { ScheduledMessage } from '@/entities/scheduledMessage.entity';
import { MessageTemplate } from '@/entities/messageTemplate.entity';
import { auditContext } from '@/utils/auditContext';

// Incidente Buen Despacho 2026-10-06: los cambios de secuencias no dejaban
// autor. Cada superficie del servicio debe dejar fila en domain_audit_log con
// retreatId y actor (del auditContext cuando la operación viene de un request).
describe('MessageSequenceService — auditoría de dominio', () => {
	let svc: MessageSequenceService;

	beforeAll(async () => {
		await setupTestDatabase();
		svc = new MessageSequenceService();
	});

	afterAll(async () => {
		await teardownTestDatabase();
	});

	beforeEach(async () => {
		await clearTestData();
		// clearTestData borra por cascade de retreat, pero las secuencias de un
		// retiro ya borrado podrían quedar huérfanas según la FK: limpiarlas
		// explícito evita activity fantasma en el test del cron.
		await AppDataSource.query('DELETE FROM scheduled_messages;');
		await AppDataSource.query('DELETE FROM sequence_steps;');
		await AppDataSource.query('DELETE FROM message_sequences;');
	});

	const auditRepo = () => AppDataSource.getRepository(DomainAuditLog);

	/** El audit es fire-and-forget: espera (con reintentos) a que la fila aterrice. */
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

	const rowsOf = (rows: DomainAuditLog[], action: string) => rows.filter((r) => r.action === action);
	const meta = (row: DomainAuditLog) => JSON.parse(row.metadata ?? '{}');

	async function createGeneralTemplate(retreatId: string, message = 'Hola {participant.nickname}') {
		const repo = AppDataSource.getRepository(MessageTemplate);
		return repo.save(
			repo.create({
				type: 'GENERAL' as any,
				scope: 'retreat',
				retreatId,
				name: 'Mensaje General',
				message,
			}),
		);
	}

	async function seedRetreatWithWalker() {
		const retreat = await TestDataFactory.createTestRetreat({ timezone: 'America/Mexico_City' });
		const participant = await TestDataFactory.createTestParticipant(retreat.id, {
			type: 'walker',
			email: 'audit@example.com',
			cellPhone: '5512345678',
		} as any);
		return { retreat, participant };
	}

	/** Secuencia activa de 1 paso GENERAL (whatsapp, manual: processDue encola). */
	async function seedSequence(
		retreatId: string,
		opts: { sendHour?: number; channel?: 'whatsapp' | 'email' } = {},
	) {
		return svc.createSequence({
			name: 'Audit',
			retreatId,
			trigger: 'participant_created',
			audience: 'walker',
			steps: [
				{
					stepOrder: 0,
					offsetDays: 0,
					sendHour: opts.sendHour ?? 9,
					templateType: 'GENERAL',
					channel: opts.channel ?? 'whatsapp',
				},
			] as any,
		});
	}

	/** Fila scheduled manual en el estado pedido (fuera del enrolamiento). */
	async function seedRow(
		retreatId: string,
		participantId: string,
		seq: { id: string },
		step: { id: string },
		status: string,
	) {
		const repo = AppDataSource.getRepository(ScheduledMessage);
		return repo.save(
			repo.create({
				sequenceId: seq.id,
				stepId: step.id,
				participantId,
				retreatId,
				channel: 'whatsapp',
				templateType: 'GENERAL',
				recipientTarget: 'participant',
				scheduledFor: new Date(Date.now() - 3600_000),
				status,
				resolvedContent: 'SNAPSHOT',
				resolvedContact: '5512345678',
			}),
		);
	}

	it('create deja message_sequence.create con retreatId, actor del contexto y clonedFrom', async () => {
		const { retreat } = await seedRetreatWithWalker();
		let seqId = '';
		await auditContext.run({ userId: 'actor-1', ip: '10.0.0.1' }, async () => {
			const seq = await svc.createSequence({
				name: 'Clon',
				retreatId: retreat.id,
				trigger: 'participant_created',
				audience: 'walker',
				clonedFrom: 'origen-123',
				steps: [
					{ stepOrder: 0, offsetDays: 0, sendHour: 9, templateType: 'GENERAL', channel: 'whatsapp' },
				] as any,
			});
			seqId = seq.id;
		});

		const rows = await waitForLogs((r) => rowsOf(r, 'message_sequence.create').length > 0);
		const row = rowsOf(rows, 'message_sequence.create')[0];
		expect(row.resourceId).toBe(seqId);
		expect(row.retreatId).toBe(retreat.id);
		expect(row.actorUserId).toBe('actor-1');
		expect(row.ipAddress).toBe('10.0.0.1');
		expect(JSON.parse(row.newValues!)).toEqual({
			name: 'Clon',
			trigger: 'participant_created',
			audience: 'walker',
			isActive: true,
			maxOverdueDays: null,
		});
		expect(meta(row)).toEqual({ clonedFrom: 'origen-123' });
	});

	it('update registra solo los campos que cambiaron + los conteos de B3', async () => {
		const { retreat } = await seedRetreatWithWalker();
		const seq = await seedSequence(retreat.id);

		await svc.updateSequence(seq.id, { name: 'Audit 2', isActive: false });

		const rows = await waitForLogs((r) => rowsOf(r, 'message_sequence.update').length > 0);
		const row = rowsOf(rows, 'message_sequence.update')[0];
		expect(row.retreatId).toBe(retreat.id);
		expect(JSON.parse(row.oldValues!)).toEqual({ name: 'Audit', isActive: true });
		expect(JSON.parse(row.newValues!)).toEqual({ name: 'Audit 2', isActive: false });
		expect(meta(row)).toEqual({
			// La descripción es texto libre: nunca entra al diff, sólo su tamaño.
			descriptionChars: 0,
			descriptionChanged: false,
			archivedStepCount: 0,
			archivedPendingCount: 0,
			cancelledPendingCount: 0,
		});
	});

	it('update que cambia la semántica (trigger) reporta las pending canceladas', async () => {
		const { retreat, participant } = await seedRetreatWithWalker();
		const seq = await seedSequence(retreat.id);
		await seedRow(retreat.id, participant.id, seq, seq.steps![0], 'pending');

		await svc.updateSequence(seq.id, { trigger: 'birthday' });

		const rows = await waitForLogs((r) => rowsOf(r, 'message_sequence.update').length > 0);
		const row = rowsOf(rows, 'message_sequence.update')[0];
		expect(JSON.parse(row.oldValues!)).toEqual({ trigger: 'participant_created' });
		expect(meta(row).cancelledPendingCount).toBe(1);
	});

	it('delete deja message_sequence.delete con el snapshot previo', async () => {
		const { retreat } = await seedRetreatWithWalker();
		const seq = await seedSequence(retreat.id);

		await expect(svc.deleteSequence(seq.id)).resolves.toBe(true);

		const rows = await waitForLogs((r) => rowsOf(r, 'message_sequence.delete').length > 0);
		const row = rowsOf(rows, 'message_sequence.delete')[0];
		expect(row.resourceId).toBe(seq.id);
		expect(row.retreatId).toBe(retreat.id);
		expect(JSON.parse(row.oldValues!).name).toBe('Audit');
	});

	it('delete de algo inexistente no deja fila', async () => {
		await expect(svc.deleteSequence('no-existe')).resolves.toBe(false);
		await new Promise((r) => setTimeout(r, 50));
		expect(rowsOf(await auditRepo().find(), 'message_sequence.delete')).toHaveLength(0);
	});

	it('rescheduleStep deja sequence_step.reschedule con el paso como recurso y el conteo', async () => {
		const { retreat, participant } = await seedRetreatWithWalker();
		const seq = await seedSequence(retreat.id);
		await seedRow(retreat.id, participant.id, seq, seq.steps![0], 'pending');
		const step = await svc.findStepWithSequence(seq.steps![0].id);

		const res = await svc.rescheduleStep(step!, { date: '2030-01-01', hour: 9 });

		expect(res.affected).toBe(1);
		const rows = await waitForLogs((r) => rowsOf(r, 'sequence_step.reschedule').length > 0);
		const row = rowsOf(rows, 'sequence_step.reschedule')[0];
		expect(row.resourceType).toBe('sequence_step');
		expect(row.resourceId).toBe(step!.id);
		expect(row.retreatId).toBe(retreat.id);
		expect(meta(row)).toEqual({ affected: 1, immediate: false, date: '2030-01-01', hour: 9 });
		expect(JSON.parse(row.newValues!).scheduledFor).toContain('2030-01-01');
	});

	it('markDispatched deja scheduled_message.dispatch con old/new status', async () => {
		const { retreat, participant } = await seedRetreatWithWalker();
		const seq = await seedSequence(retreat.id);
		const sm = await seedRow(retreat.id, participant.id, seq, seq.steps![0], 'queued');

		await auditContext.run({ userId: 'coord-1' }, async () => {
			await svc.markDispatched(sm.id, 'coord-1');
		});

		const rows = await waitForLogs((r) => rowsOf(r, 'scheduled_message.dispatch').length > 0);
		const row = rowsOf(rows, 'scheduled_message.dispatch')[0];
		expect(row.resourceId).toBe(sm.id);
		expect(row.retreatId).toBe(retreat.id);
		expect(row.actorUserId).toBe('coord-1');
		expect(JSON.parse(row.oldValues!)).toEqual({ status: 'queued' });
		expect(JSON.parse(row.newValues!)).toEqual({ status: 'sent', dispatchedBy: 'coord-1' });
		expect(meta(row)).toEqual({ channel: 'whatsapp' });
	});

	it('assign deja scheduled_message.assign con el responsable previo → nuevo', async () => {
		const { retreat, participant } = await seedRetreatWithWalker();
		const seq = await seedSequence(retreat.id);
		const sm = await seedRow(retreat.id, participant.id, seq, seq.steps![0], 'queued');

		await svc.assign(sm.id, 'resp-9');

		const rows = await waitForLogs((r) => rowsOf(r, 'scheduled_message.assign').length > 0);
		const row = rowsOf(rows, 'scheduled_message.assign')[0];
		expect(row.retreatId).toBe(retreat.id);
		expect(JSON.parse(row.oldValues!)).toEqual({ assignedTo: null });
		expect(JSON.parse(row.newValues!)).toEqual({ assignedTo: 'resp-9' });
	});

	it('skip/retry/discard dejan su acción con la transición de status', async () => {
		const { retreat, participant } = await seedRetreatWithWalker();
		// La UQ (stepId, participantId, occurrenceYear) impide dos filas del
		// mismo participante: una por participante.
		const walker2 = await TestDataFactory.createTestParticipant(retreat.id, {
			type: 'walker',
			email: 'audit2@example.com',
		} as any);
		const seq = await seedSequence(retreat.id);
		const queued = await seedRow(retreat.id, participant.id, seq, seq.steps![0], 'queued');
		const failed = await seedRow(retreat.id, walker2.id, seq, seq.steps![0], 'failed');

		await svc.markSkipped(queued.id, 'coord-1');
		let rows = await waitForLogs((r) => rowsOf(r, 'scheduled_message.skip').length > 0);
		let row = rowsOf(rows, 'scheduled_message.skip')[0];
		expect(row.resourceId).toBe(queued.id);
		expect(JSON.parse(row.oldValues!)).toEqual({ status: 'queued' });
		expect(JSON.parse(row.newValues!)).toEqual({ status: 'skipped' });
		expect(meta(row).reason).toBe('omitido manualmente');

		await svc.retryScheduled(failed.id, 'coord-1');
		rows = await waitForLogs((r) => rowsOf(r, 'scheduled_message.retry').length > 0);
		row = rowsOf(rows, 'scheduled_message.retry')[0];
		expect(row.resourceId).toBe(failed.id);
		expect(JSON.parse(row.oldValues!)).toEqual({ status: 'failed' });
		expect(JSON.parse(row.newValues!).status).toBe('pending');

		// El retried quedó pending; para descartar uso el skipped de arriba.
		await svc.discardScheduled(queued.id, 'coord-1');
		rows = await waitForLogs((r) => rowsOf(r, 'scheduled_message.discard').length > 0);
		row = rowsOf(rows, 'scheduled_message.discard')[0];
		expect(row.resourceId).toBe(queued.id);
		expect(JSON.parse(row.oldValues!)).toEqual({ status: 'skipped' });
		expect(JSON.parse(row.newValues!)).toEqual({ status: 'cancelled' });
	});

	it('bulkResolveIssues deja UNA fila scheduled_message.bulk_resolve con el conteo real', async () => {
		const { retreat, participant } = await seedRetreatWithWalker();
		const walker2 = await TestDataFactory.createTestParticipant(retreat.id, {
			type: 'walker',
			email: 'audit-bulk@example.com',
		} as any);
		const seq = await seedSequence(retreat.id);
		await seedRow(retreat.id, participant.id, seq, seq.steps![0], 'failed');
		await seedRow(retreat.id, walker2.id, seq, seq.steps![0], 'skipped');

		const affected = await svc.bulkResolveIssues(retreat.id, 'retry');

		expect(affected).toBe(2);
		const rows = await waitForLogs((r) => rowsOf(r, 'scheduled_message.bulk_resolve').length > 0);
		const row = rowsOf(rows, 'scheduled_message.bulk_resolve')[0];
		expect(row.retreatId).toBe(retreat.id);
		expect(row.resourceId).toBeNull();
		expect(meta(row)).toEqual({ bulkAction: 'retry', affected: 2, idsCount: null });
	});

	it('bulkResolveIssues sin filas afectadas no deja fila', async () => {
		const { retreat } = await seedRetreatWithWalker();
		await svc.bulkResolveIssues(retreat.id, 'discard');
		await new Promise((r) => setTimeout(r, 50));
		expect(rowsOf(await auditRepo().find(), 'scheduled_message.bulk_resolve')).toHaveLength(0);
	});

	it('regenerateQueuedForRetreat deja message_sequence.regenerate_queue con regenerated/skipped', async () => {
		const { retreat, participant } = await seedRetreatWithWalker();
		// Plantilla con hueco manual: regenerar conserva el snapshot (skipped=1).
		await createGeneralTemplate(
			retreat.id,
			'Hola {participant.nickname}\n\n{custom_message}\n\nUn abrazo.',
		);
		const seq = await seedSequence(retreat.id);
		await seedRow(retreat.id, participant.id, seq, seq.steps![0], 'queued');

		const result = await svc.regenerateQueuedForRetreat(retreat.id);

		expect(result).toEqual({ regenerated: 0, skipped: 1 });
		const rows = await waitForLogs(
			(r) => rowsOf(r, 'message_sequence.regenerate_queue').length > 0,
		);
		const row = rowsOf(rows, 'message_sequence.regenerate_queue')[0];
		expect(row.retreatId).toBe(retreat.id);
		expect(meta(row)).toEqual({ regenerated: 0, skipped: 1 });
	});

	it('runForRetreat deja message_sequence.run_now con el resumen de la corrida', async () => {
		const { retreat, participant } = await seedRetreatWithWalker();
		await createGeneralTemplate(retreat.id);
		// sendHour 0: la fila nace vencida → enrolled 1 y processed 1 al correr.
		await seedSequence(retreat.id, { sendHour: 0 });

		const result = await auditContext.run({ userId: 'actor-run' }, () =>
			svc.runForRetreat(retreat.id),
		);

		expect(result.enrolled).toBe(1);
		expect(result.processed).toBeGreaterThanOrEqual(0);
		const rows = await waitForLogs((r) => rowsOf(r, 'message_sequence.run_now').length > 0);
		const row = rowsOf(rows, 'message_sequence.run_now')[0];
		expect(row.retreatId).toBe(retreat.id);
		expect(row.actorUserId).toBe('actor-run');
		expect(meta(row)).toEqual({
			trigger: 'participant_create',
			sendNowStepIds: [],
			enrolled: 1,
			processed: result.processed,
			failed: 0,
			pastStepsCount: 0,
		});
	});

	it('runForRetreat automático SIN actividad no deja run_now (ruido); manual sí aunque no haga nada', async () => {
		// Auto sin actividad: retiro sin secuencias → nada que reportar.
		const quiet = await TestDataFactory.createTestRetreat();
		await svc.runForRetreat(quiet.id);
		// El fire-and-forget de un eventual log tendría que aterrizar en este margen.
		await new Promise((r) => setTimeout(r, 100));
		let rows = await auditRepo().find();
		expect(rowsOf(rows, 'message_sequence.run_now')).toHaveLength(0);

		// Manual sin actividad: la fila SIEMPRE va — registra la intención.
		await auditContext.run({ userId: 'actor-manual' }, () =>
			svc.runForRetreat(quiet.id, { trigger: 'manual' }),
		);
		rows = await waitForLogs((r) => rowsOf(r, 'message_sequence.run_now').length > 0);
		const row = rowsOf(rows, 'message_sequence.run_now')[0];
		expect(row.actorUserId).toBe('actor-manual');
		expect(meta(row)).toEqual({
			trigger: 'manual',
			sendNowStepIds: [],
			enrolled: 0,
			processed: 0,
			failed: 0,
			pastStepsCount: 0,
		});
	});

	it('runEngineCycle emite cron_run agregado por retiro tocado (actor sistema, sin actividad = sin fila)', async () => {
		const { retreat: retreatA } = await seedRetreatWithWalker();
		await createGeneralTemplate(retreatA.id);
		await seedSequence(retreatA.id, { sendHour: 0 });
		// Retiro B: sin secuencias → sin actividad → sin fila.
		await TestDataFactory.createTestRetreat();

		await svc.runEngineCycle(new Date());

		const rows = await waitForLogs(
			(r) => rowsOf(r, 'message_sequence.cron_run').length > 0,
		);
		const cronRows = rowsOf(rows, 'message_sequence.cron_run');
		expect(cronRows).toHaveLength(1);
		const row = cronRows[0];
		expect(row.retreatId).toBe(retreatA.id);
		expect(row.resourceId).toBeNull();
		expect(row.actorUserId).toBeNull();
		expect(meta(row)).toEqual({
			system: true,
			enrolled: 1,
			processed: expect.any(Number),
			failed: 0,
		});
	});

	it('cron_run cuenta envíos fallidos: processed 0, failed 1 en el agregado', async () => {
		const { retreat } = await seedRetreatWithWalker();
		await createGeneralTemplate(retreat.id);
		// Canal email: processDue lo ENVÍA (whatsapp sólo se encola) y con el
		// mock en false cae en la rama de fallo SMTP.
		await seedSequence(retreat.id, { sendHour: 0, channel: 'email' });
		mockSendEmail.mockResolvedValueOnce(false);

		await svc.runEngineCycle(new Date());

		const rows = await waitForLogs((r) => rowsOf(r, 'message_sequence.cron_run').length > 0);
		const row = rowsOf(rows, 'message_sequence.cron_run')[0];
		// Sin el conteo, un retiro con todos los envíos caídos no dejaba rastro
		// de la caída en el agregado del cron.
		expect(meta(row)).toEqual({ system: true, enrolled: 1, processed: 0, failed: 1 });
	});

	it('runForRetreat automático deja run_now cuando lo único que hay son fallos', async () => {
		const { retreat } = await seedRetreatWithWalker();
		await createGeneralTemplate(retreat.id);
		await seedSequence(retreat.id, { sendHour: 0, channel: 'email' });

		// Primera corrida: el envío falla → la fila queda 'failed' con intentos.
		mockSendEmail.mockResolvedValueOnce(false);
		await svc.runForRetreat(retreat.id);
		await waitForLogs((r) => rowsOf(r, 'message_sequence.run_now').length > 0);

		// Segunda: sin enrolamiento nuevo ni enviados — la fila run_now automática
		// sólo existe por el reintento fallido (failed > 0 en la condición).
		mockSendEmail.mockResolvedValueOnce(false);
		await svc.runForRetreat(retreat.id);

		const rows = await waitForLogs(
			(r) =>
				rowsOf(r, 'message_sequence.run_now').filter((x) => x.retreatId === retreat.id)
					.length >= 2,
		);
		const runs = rowsOf(rows, 'message_sequence.run_now').filter(
			(x) => x.retreatId === retreat.id,
		);
		// find() no garantiza orden: la corrida con enrolled 0 es la segunda.
		const onlyFailures = runs.find((r) => meta(r).enrolled === 0);
		expect(onlyFailures).toBeDefined();
		expect(meta(onlyFailures!)).toEqual({
			trigger: 'participant_create',
			sendNowStepIds: [],
			enrolled: 0,
			processed: 0,
			failed: 1,
			pastStepsCount: 0,
		});
	});
});
