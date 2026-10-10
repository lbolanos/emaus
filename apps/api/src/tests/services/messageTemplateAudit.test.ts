import { setupTestDatabase, teardownTestDatabase, clearTestData } from '../test-setup';
import { TestDataFactory } from '../test-utils/testDataFactory';
import { MessageTemplateService } from '@/services/messageTemplateService';
import { AppDataSource } from '@/data-source';
import { DomainAuditLog } from '@/entities/domainAuditLog.entity';
import { auditContext } from '@/utils/auditContext';

// Editar una plantilla cambia lo que se envía: el CRUD completo deja fila en
// domain_audit_log, con el cuerpo FUERA del diff (sólo changed/length).
describe('MessageTemplateService — auditoría de dominio', () => {
	let svc: MessageTemplateService;

	beforeAll(async () => {
		await setupTestDatabase();
		svc = new MessageTemplateService();
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

	const rowsOf = (rows: DomainAuditLog[], action: string) => rows.filter((r) => r.action === action);
	const meta = (row: DomainAuditLog) => JSON.parse(row.metadata ?? '{}');

	it('createForRetreat deja message_template.create con retreatId y sin el cuerpo en el diff', async () => {
		const retreat = await TestDataFactory.createTestRetreat();

		const body = '<p>Hola {participant.firstName}</p>';
		await auditContext.run({ userId: 'actor-tpl' }, async () => {
			await svc.createForRetreat(retreat.id, {
				name: 'Bienvenida',
				type: 'GENERAL' as any,
				message: body,
			});
		});

		const rows = await waitForLogs((r) => rowsOf(r, 'message_template.create').length > 0);
		const row = rowsOf(rows, 'message_template.create')[0];
		expect(row.retreatId).toBe(retreat.id);
		expect(row.actorUserId).toBe('actor-tpl');
		expect(JSON.parse(row.newValues!)).toEqual({
			name: 'Bienvenida',
			type: 'GENERAL',
			scope: 'retreat',
			isDefault: false,
		});
		// El cuerpo nunca va al diff: sólo el hecho de que cambió y su tamaño.
		expect(JSON.stringify(row.newValues)).not.toContain('<p>');
		expect(meta(row)).toEqual({ messageChanged: true, messageChars: body.length });
	});

	it('update registra solo los campos que cambiaron + messageChanged/messageChars', async () => {
		const retreat = await TestDataFactory.createTestRetreat();
		const tpl = await svc.createForRetreat(retreat.id, {
			name: 'Bienvenida',
			type: 'GENERAL' as any,
			message: 'Texto corto',
		});

		const newBody = 'Texto un poco más largo';
		await svc.update(tpl.id, {
			name: 'Bienvenida v2',
			message: newBody,
		});

		const rows = await waitForLogs((r) => rowsOf(r, 'message_template.update').length > 0);
		const row = rowsOf(rows, 'message_template.update')[0];
		expect(row.retreatId).toBe(retreat.id);
		expect(JSON.parse(row.oldValues!)).toEqual({ name: 'Bienvenida' });
		expect(JSON.parse(row.newValues!)).toEqual({ name: 'Bienvenida v2' });
		expect(meta(row)).toEqual({ messageChanged: true, messageChars: newBody.length });
	});

	it('update que no toca el mensaje deja messageChanged=false', async () => {
		const retreat = await TestDataFactory.createTestRetreat();
		const body = 'Texto que no cambia';
		const tpl = await svc.createForRetreat(retreat.id, {
			name: 'Bienvenida',
			type: 'GENERAL' as any,
			message: body,
		});

		await svc.update(tpl.id, { name: 'Bienvenida v3' });

		const rows = await waitForLogs((r) => rowsOf(r, 'message_template.update').length > 0);
		const row = rowsOf(rows, 'message_template.update')[0];
		expect(meta(row)).toEqual({ messageChanged: false, messageChars: body.length });
	});

	it('remove deja message_template.delete con el snapshot previo', async () => {
		const retreat = await TestDataFactory.createTestRetreat();
		const tpl = await svc.createForRetreat(retreat.id, {
			name: 'Por borrar',
			type: 'GENERAL' as any,
			message: 'x',
		});

		await expect(svc.remove(tpl.id)).resolves.toBe(true);

		const rows = await waitForLogs((r) => rowsOf(r, 'message_template.delete').length > 0);
		const row = rowsOf(rows, 'message_template.delete')[0];
		expect(row.resourceId).toBe(tpl.id);
		expect(row.retreatId).toBe(retreat.id);
		expect(JSON.parse(row.oldValues!).name).toBe('Por borrar');
	});

	it('createForCommunity lleva communityId en metadata (la columna retreatId no aplica)', async () => {
		const owner = await TestDataFactory.createTestUser();
		const community = await TestDataFactory.createTestCommunity(owner.id);

		const body = 'Comunidad';
		await svc.createForCommunity(community.id, {
			name: 'Aviso parroquial',
			type: 'GENERAL' as any,
			message: body,
		});

		const rows = await waitForLogs((r) => rowsOf(r, 'message_template.create').length > 0);
		const row = rowsOf(rows, 'message_template.create')[0];
		expect(row.retreatId).toBeNull();
		expect(meta(row)).toEqual({
			messageChanged: true,
			messageChars: body.length,
			communityId: community.id,
		});
	});
});
