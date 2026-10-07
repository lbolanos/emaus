import { setupTestDatabase, teardownTestDatabase, clearTestData } from '../test-setup';
import { TestDataFactory } from '../test-utils/testDataFactory';
import { GlobalMessageSequenceService } from '@/services/globalMessageSequenceService';
import { GlobalMessageTemplateService } from '@/services/globalMessageTemplateService';
import { AppDataSource } from '@/data-source';
import { DomainAuditLog } from '@/entities/domainAuditLog.entity';
import { MessageTemplate } from '@/entities/messageTemplate.entity';
import { GlobalMessageTemplateType } from '@/entities/globalMessageTemplate.entity';
import { auditContext } from '@/utils/auditContext';

// Tercer y cuarto pilar del módulo de mensajería: las plantillas globales
// (secuencias y mensajes) se editan fuera de todo retiro, pero sus copias SÍ
// aterrizan en uno — ambos lados quedan en domain_audit_log.
describe('Global messaging — auditoría de dominio', () => {
	let seqSvc: GlobalMessageSequenceService;
	let tplSvc: GlobalMessageTemplateService;

	beforeAll(async () => {
		await setupTestDatabase();
		seqSvc = new GlobalMessageSequenceService();
		tplSvc = new GlobalMessageTemplateService();
	});

	afterAll(async () => {
		await teardownTestDatabase();
	});

	beforeEach(async () => {
		await clearTestData();
		await AppDataSource.query('DELETE FROM global_message_sequences;');
		await AppDataSource.query('DELETE FROM global_sequence_steps;');
		await AppDataSource.query('DELETE FROM global_message_templates;');
		await AppDataSource.query('DELETE FROM message_sequences;');
		await AppDataSource.query('DELETE FROM sequence_steps;');
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

	const rowsOf = (rows: DomainAuditLog[], action: string) => rows.filter((r) => r.action === action);
	const meta = (row: DomainAuditLog) => JSON.parse(row.metadata ?? '{}');

	describe('GlobalMessageSequenceService', () => {
		it('create deja global_message_sequence.create con stepCount y sin retreatId', async () => {
			await auditContext.run({ userId: 'actor-g' }, async () => {
				await seqSvc.create({
					name: 'Bienvenida global',
					trigger: 'participant_created',
					audience: 'walker',
					steps: [
						{
							stepOrder: 0,
							offsetDays: 0,
							sendHour: 9,
							templateType: 'WALKER_WELCOME',
							channel: 'whatsapp',
						},
					],
				});
			});

			const rows = await waitForLogs(
				(r) => rowsOf(r, 'global_message_sequence.create').length > 0,
			);
			const row = rowsOf(rows, 'global_message_sequence.create')[0];
			expect(row.retreatId).toBeNull();
			expect(row.actorUserId).toBe('actor-g');
			expect(JSON.parse(row.newValues!).name).toBe('Bienvenida global');
			expect(meta(row)).toEqual({ stepCount: 1 });
		});

		it('update deja solo el diff y toggleActive su acción propia', async () => {
			const seq = await seqSvc.create({
				name: 'G',
				trigger: 'birthday',
				audience: 'all',
			});

			await seqSvc.update(seq.id, { name: 'G2', maxOverdueDays: 5 });

			let rows = await waitForLogs(
				(r) => rowsOf(r, 'global_message_sequence.update').length > 0,
			);
			let row = rowsOf(rows, 'global_message_sequence.update')[0];
			expect(JSON.parse(row.oldValues!)).toEqual({ name: 'G', maxOverdueDays: null });
			expect(JSON.parse(row.newValues!)).toEqual({ name: 'G2', maxOverdueDays: 5 });

			await seqSvc.toggleActive(seq.id);
			rows = await waitForLogs(
				(r) => rowsOf(r, 'global_message_sequence.toggle_active').length > 0,
			);
			row = rowsOf(rows, 'global_message_sequence.toggle_active')[0];
			expect(JSON.parse(row.oldValues!)).toEqual({ isActive: true });
			expect(JSON.parse(row.newValues!)).toEqual({ isActive: false });
		});

		it('delete deja el snapshot previo', async () => {
			const seq = await seqSvc.create({ name: 'Por borrar', trigger: 'birthday' });
			await expect(seqSvc.delete(seq.id)).resolves.toBe(true);

			const rows = await waitForLogs(
				(r) => rowsOf(r, 'global_message_sequence.delete').length > 0,
			);
			const row = rowsOf(rows, 'global_message_sequence.delete')[0];
			expect(JSON.parse(row.oldValues!).name).toBe('Por borrar');
		});

		it('copyToRetreat deja copy_to_retreat con retreatId + el create del clon con clonedFrom', async () => {
			const retreat = await TestDataFactory.createTestRetreat();
			const global = await seqSvc.create({
				name: 'Seguimiento',
				trigger: 'days_after_retreat',
				audience: 'table_leaders',
				steps: [
					{
						stepOrder: 0,
						offsetDays: 7,
						sendHour: 9,
						templateType: 'WALKER_FOLLOWUP_WEEK_1',
						channel: 'whatsapp',
					},
				],
			});

			const created = await seqSvc.copyToRetreat(global.id, retreat.id);

			const rows = await waitForLogs(
				(r) => rowsOf(r, 'global_message_sequence.copy_to_retreat').length > 0,
			);
			const row = rowsOf(rows, 'global_message_sequence.copy_to_retreat')[0];
			expect(row.resourceId).toBe(global.id);
			expect(row.retreatId).toBe(retreat.id);
			expect(meta(row)).toEqual({ createdSequenceId: created!.id, name: 'Seguimiento' });

			// El clon deja su propio create con la traza del origen.
			const cloneCreate = rowsOf(rows, 'message_sequence.create').find(
				(r) => r.resourceId === created!.id,
			);
			expect(cloneCreate).toBeDefined();
			expect(meta(cloneCreate!)).toEqual({ clonedFrom: global.id });
		});
	});

	describe('GlobalMessageTemplateService', () => {
		it('create/update/delete con el cuerpo fuera del diff', async () => {
			const tpl = await tplSvc.create({
				name: 'Plantilla global',
				type: GlobalMessageTemplateType.GENERAL,
				message: 'Cuerpo inicial',
				isActive: true,
			});

			let rows = await waitForLogs(
				(r) => rowsOf(r, 'global_message_template.create').length > 0,
			);
			let row = rowsOf(rows, 'global_message_template.create')[0];
			expect(row.retreatId).toBeNull();
			expect(JSON.parse(row.newValues!)).toEqual({
				name: 'Plantilla global',
				type: 'GENERAL',
				isActive: true,
			});
			expect(meta(row)).toEqual({ messageChanged: true, messageChars: 14 });

			await tplSvc.update(tpl.id, { name: 'Plantilla global v2', message: 'Cuerpo nuevo' });
			rows = await waitForLogs(
				(r) => rowsOf(r, 'global_message_template.update').length > 0,
			);
			row = rowsOf(rows, 'global_message_template.update')[0];
			expect(JSON.parse(row.oldValues!)).toEqual({ name: 'Plantilla global' });
			expect(meta(row)).toEqual({ messageChanged: true, messageChars: 12 });

			await expect(tplSvc.delete(tpl.id)).resolves.toBe(true);
			rows = await waitForLogs(
				(r) => rowsOf(r, 'global_message_template.delete').length > 0,
			);
			row = rowsOf(rows, 'global_message_template.delete')[0];
			expect(JSON.parse(row.oldValues!).name).toBe('Plantilla global v2');
		});

		it('toggleActive deja su acción propia', async () => {
			const tpl = await tplSvc.create({
				name: 'Toggle me',
				type: GlobalMessageTemplateType.GENERAL,
				message: 'x',
				isActive: true,
			});

			await tplSvc.toggleActive(tpl.id);

			const rows = await waitForLogs(
				(r) => rowsOf(r, 'global_message_template.toggle_active').length > 0,
			);
			const row = rowsOf(rows, 'global_message_template.toggle_active')[0];
			expect(JSON.parse(row.oldValues!)).toEqual({ isActive: true });
			expect(JSON.parse(row.newValues!)).toEqual({ isActive: false });
		});

		it('copyToRetreat: UN evento de copia con retreatId, sin duplicar como message_template.create', async () => {
			const retreat = await TestDataFactory.createTestRetreat();
			const tpl = await tplSvc.create({
				name: 'Para copiar',
				type: GlobalMessageTemplateType.GENERAL,
				message: 'Cuerpo a copiar',
				isActive: true,
			});

			const copied = await tplSvc.copyToRetreat(tpl.id, retreat.id);

			expect(copied).not.toBeNull();
			const rows = await waitForLogs(
				(r) => rowsOf(r, 'global_message_template.copy_to_retreat').length > 0,
			);
			const row = rowsOf(rows, 'global_message_template.copy_to_retreat')[0];
			expect(row.resourceId).toBe(tpl.id);
			expect(row.retreatId).toBe(retreat.id);
			expect(meta(row)).toEqual({
				targetTemplateId: copied!.id,
				updatedExisting: false,
				name: 'Para copiar',
			});
			// La copia escribe por repo directo: no debe haber create del target.
			const targetCreates = rowsOf(rows, 'message_template.create').filter(
				(r) => r.resourceId === copied!.id,
			);
			expect(targetCreates).toHaveLength(0);
		});

		it('copyToRetreat sobre plantilla ya existente reporta updatedExisting', async () => {
			const retreat = await TestDataFactory.createTestRetreat();
			const tpl = await tplSvc.create({
				name: 'Para recopiar',
				type: GlobalMessageTemplateType.GENERAL,
				message: 'v1',
				isActive: true,
			});
			const first = await tplSvc.copyToRetreat(tpl.id, retreat.id);

			await tplSvc.update(tpl.id, { message: 'v2' });
			const second = await tplSvc.copyToRetreat(tpl.id, retreat.id);

			// La segunda copia actualiza la existente: mismo target.
			expect(second!.id).toBe(first!.id);

			const rows = await waitForLogs(
				(r) => rowsOf(r, 'global_message_template.copy_to_retreat').length === 2,
			);
			// Ambas filas comparten targetTemplateId: la de la 2a copia es la
			// última en createdAt.
			const copies = rowsOf(rows, 'global_message_template.copy_to_retreat')
				.filter((r) => meta(r).targetTemplateId === second!.id)
				.sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt));
			expect(copies).toHaveLength(2);
			expect(meta(copies[0]).updatedExisting).toBe(false);
			expect(meta(copies[1])).toEqual({
				targetTemplateId: second!.id,
				updatedExisting: true,
				name: 'Para recopiar',
			});
		});

		it('copyToCommunity lleva communityId en metadata (sin retreatId)', async () => {
			const owner = await TestDataFactory.createTestUser();
			const community = await TestDataFactory.createTestCommunity(owner.id);
			const tpl = await tplSvc.create({
				name: 'Comunitaria',
				type: GlobalMessageTemplateType.GENERAL,
				message: 'Hola comunidad',
				isActive: true,
			});

			const copied = await tplSvc.copyToCommunity(tpl.id, community.id);

			const rows = await waitForLogs(
				(r) => rowsOf(r, 'global_message_template.copy_to_community').length > 0,
			);
			const row = rowsOf(rows, 'global_message_template.copy_to_community')[0];
			expect(row.retreatId).toBeNull();
			expect(meta(row)).toEqual({
				communityId: community.id,
				targetTemplateId: copied!.id,
				updatedExisting: false,
				name: 'Comunitaria',
			});
		});

		it('copyRetreatTemplateToCommunity deja copy_from_retreat con el retiro de ORIGEN', async () => {
			const retreat = await TestDataFactory.createTestRetreat();
			const owner = await TestDataFactory.createTestUser();
			const community = await TestDataFactory.createTestCommunity(owner.id);
			// Siembra directa por repo: el create del origen no hace ruido aquí.
			const mtRepo = AppDataSource.getRepository(MessageTemplate);
			const origin = await mtRepo.save(
				mtRepo.create({
					name: 'Origen retiro',
					type: 'GENERAL' as any,
					scope: 'retreat',
					retreatId: retreat.id,
					message: 'Texto del retiro',
				}),
			);

			const copied = await tplSvc.copyRetreatTemplateToCommunity(origin.id, community.id);

			const rows = await waitForLogs(
				(r) => rowsOf(r, 'global_message_template.copy_from_retreat').length > 0,
			);
			const row = rowsOf(rows, 'global_message_template.copy_from_retreat')[0];
			expect(row.resourceId).toBe(origin.id);
			expect(row.retreatId).toBe(retreat.id);
			expect(meta(row)).toEqual({
				communityId: community.id,
				targetTemplateId: copied!.id,
				updatedExisting: false,
				name: 'Origen retiro',
			});
		});
	});
});
