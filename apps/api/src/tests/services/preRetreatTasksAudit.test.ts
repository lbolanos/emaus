import { setupTestDatabase, teardownTestDatabase, clearTestData } from '../test-setup';
import { TestDataFactory } from '../test-utils/testDataFactory';
import { AppDataSource } from '@/data-source';
import { DomainAuditLog } from '@/entities/domainAuditLog.entity';
import { PreRetreatTaskTemplate } from '@/entities/preRetreatTaskTemplate.entity';
import { PreRetreatTaskTemplateSet } from '@/entities/preRetreatTaskTemplateSet.entity';
import {
	preRetreatTaskTemplateService,
} from '@/services/preRetreatTaskTemplateService';
import {
	retreatPreRetreatTaskService,
} from '@/services/retreatPreRetreatTaskService';
import { auditContext } from '@/utils/auditContext';

// Tanda P2: las plantillas de tareas pre-retiro y las tareas materializadas en
// el retiro mutaban sin rastro. El CRUD y la materialización ahora dejan fila.
describe('tareas pre-retiro — auditoría de dominio', () => {
	beforeAll(async () => {
		await setupTestDatabase();
	});

	afterAll(async () => {
		await teardownTestDatabase();
	});

	beforeEach(async () => {
		await clearTestData();
		// Las plantillas son GLOBALES (no cuelgan de retreat): clearTestData no
		// las alcanza. Ítems primero, sets después (FK).
		await AppDataSource.getRepository(PreRetreatTaskTemplate).clear();
		await AppDataSource.getRepository(PreRetreatTaskTemplateSet).clear();
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

	it('create de plantilla deja pre_retreat_task_template.create con los campos auditados', async () => {
		const set = await preRetreatTaskTemplateService.createSet({ name: 'Set auditoría' });
		const template = await preRetreatTaskTemplateService.create({
			templateSetId: set.id,
			name: 'Confirmar casas',
			defaultOrder: 1,
		});

		const rows = await waitForLogs(
			(r) => rowsOf(r, 'pre_retreat_task_template.create').length > 0,
		);
		const row = rowsOf(rows, 'pre_retreat_task_template.create')[0];
		expect(row.resourceType).toBe('pre_retreat_task_template');
		expect(row.resourceId).toBe(template.id);
		expect(JSON.parse(row.newValues!)).toMatchObject({
			name: 'Confirmar casas',
			templateSetId: set.id,
		});
		// La plantilla es global: sin retreatId en la fila.
		expect(row.retreatId).toBeNull();
	});

	it('update de set deja diff old→new', async () => {
		const set = await preRetreatTaskTemplateService.createSet({ name: 'Antes' });
		await preRetreatTaskTemplateService.updateSet(set.id, { name: 'Después' });

		const rows = await waitForLogs(
			(r) => rowsOf(r, 'pre_retreat_task_template_set.update').length > 0,
		);
		const row = rowsOf(rows, 'pre_retreat_task_template_set.update')[0];
		expect(JSON.parse(row.oldValues!)).toMatchObject({ name: 'Antes' });
		expect(JSON.parse(row.newValues!)).toMatchObject({ name: 'Después' });
	});

	it('deleteSet cuenta los ítems que se van en cascade', async () => {
		const set = await preRetreatTaskTemplateService.createSet({ name: 'Set borrar' });
		await preRetreatTaskTemplateService.create({ templateSetId: set.id, name: 'T1' });
		await preRetreatTaskTemplateService.create({ templateSetId: set.id, name: 'T2' });

		await expect(preRetreatTaskTemplateService.deleteSet(set.id)).resolves.toBe(true);

		const rows = await waitForLogs(
			(r) => rowsOf(r, 'pre_retreat_task_template_set.delete').length > 0,
		);
		const row = rowsOf(rows, 'pre_retreat_task_template_set.delete')[0];
		// El conteo se toma ANTES del delete: si contara después, el cascade
		// ya habría borrado los ítems y siempre daría 0.
		expect(meta(row).cascadeItems).toBe(2);
	});

	it('tarea del retiro: create/setStatus/remove llevan retreatId y actor', async () => {
		const actor = await TestDataFactory.createTestUser();
		const retreat = await TestDataFactory.createTestRetreat({ createdBy: actor.id });

		await auditContext.run({ userId: actor.id, ip: '10.0.0.21' }, async () => {
			const task = await retreatPreRetreatTaskService.create(retreat.id, {
				name: 'Comprar playeras',
				dueOffsetDays: -7,
			});
			await retreatPreRetreatTaskService.setStatus(task.id, 'done');
			await retreatPreRetreatTaskService.remove(task.id);
		});

		const rows = await waitForLogs(
			(r) => rowsOf(r, 'pre_retreat_task.delete').length > 0,
		);
		const create = rowsOf(rows, 'pre_retreat_task.create')[0];
		expect(create.retreatId).toBe(retreat.id);
		expect(create.actorUserId).toBe(actor.id);
		expect(create.ipAddress).toBe('10.0.0.21');

		const setStatus = rowsOf(rows, 'pre_retreat_task.set_status')[0];
		expect(setStatus.retreatId).toBe(retreat.id);
		expect(JSON.parse(setStatus.oldValues!)).toMatchObject({ status: 'pending' });
		expect(JSON.parse(setStatus.newValues!)).toMatchObject({ status: 'done' });

		const remove = rowsOf(rows, 'pre_retreat_task.delete')[0];
		expect(remove.retreatId).toBe(retreat.id);
		expect(JSON.parse(remove.oldValues!)).toMatchObject({ name: 'Comprar playeras' });
	});

	it('materializeFromTemplate deja UN evento agregado con los conteos', async () => {
		const retreat = await TestDataFactory.createTestRetreat();
		const set = await preRetreatTaskTemplateService.createSet({
			name: 'Set materializar',
			isDefault: true,
		});
		await preRetreatTaskTemplateService.create({
			templateSetId: set.id,
			name: 'Raíz 1',
			defaultOrder: 1,
			dueOffsetDays: -10,
		});
		await preRetreatTaskTemplateService.create({
			templateSetId: set.id,
			name: 'Raíz 2',
			defaultOrder: 2,
			dueOffsetDays: -5,
		});
		// Hijo de Raíz 1: materializa anidado.
		const root1 = (
			await AppDataSource.getRepository(PreRetreatTaskTemplate).findOne({
				where: { name: 'Raíz 1' },
			})
		)!;
		await preRetreatTaskTemplateService.create({
			templateSetId: set.id,
			parentId: root1.id,
			name: 'Hijo 1',
			defaultOrder: 1,
		});

		await retreatPreRetreatTaskService.materializeFromTemplate(retreat.id, set.id);

		const rows = await waitForLogs(
			(r) => rowsOf(r, 'pre_retreat_task.materialize').length > 0,
		);
		const row = rowsOf(rows, 'pre_retreat_task.materialize')[0];
		expect(row.retreatId).toBe(retreat.id);
		expect(row.resourceId).toBe(set.id);
		expect(meta(row)).toMatchObject({
			mode: 'replace',
			createdRoots: 2,
			createdChildren: 1,
			clearExisting: false,
		});
	});
});
