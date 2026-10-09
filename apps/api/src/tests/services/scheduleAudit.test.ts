import { setupTestDatabase, teardownTestDatabase, clearTestData } from '../test-setup';
import { TestDataFactory } from '../test-utils/testDataFactory';
import { AppDataSource } from '@/data-source';
import { DomainAuditLog } from '@/entities/domainAuditLog.entity';
import { ScheduleTemplate } from '@/entities/scheduleTemplate.entity';
import { ScheduleTemplateSet } from '@/entities/scheduleTemplateSet.entity';
import { ScheduleTemplateService } from '@/services/scheduleTemplateService';
import { RetreatScheduleService } from '@/services/retreatScheduleService';
import { auditContext } from '@/utils/auditContext';

// Tanda P2: el minuto a minuto (schedule_item) es de lo más visible en el
// retiro — crear/editar/mover/completar items corría sin rastro. Las
// transiciones manuales y las acciones masivas ahora dejan fila; las
// consecuencias derivadas (resolveSantisimoConflicts, angelitos) no.
describe('minuto a minuto — auditoría de dominio', () => {
	// Instancias locales (no el singleton): estos servicios ligan sus repos
	// como campos de instancia al construirse, y el singleton nace antes del
	// setupTestDatabase — contra el DataSource sin inicializar.
	let scheduleTemplates: ScheduleTemplateService;
	let schedule: RetreatScheduleService;

	beforeAll(async () => {
		await setupTestDatabase();
		scheduleTemplates = new ScheduleTemplateService();
		schedule = new RetreatScheduleService();
	});

	afterAll(async () => {
		await teardownTestDatabase();
	});

	beforeEach(async () => {
		await clearTestData();
		// Las plantillas son GLOBALES (no cuelgan de retreat): ítems primero,
		// sets después (FK).
		await AppDataSource.getRepository(ScheduleTemplate).clear();
		await AppDataSource.getRepository(ScheduleTemplateSet).clear();
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

	it('create/update/delete de item del retiro con retreatId y actor', async () => {
		const actor = await TestDataFactory.createTestUser();
		const retreat = await TestDataFactory.createTestRetreat({ createdBy: actor.id });

		await auditContext.run({ userId: actor.id, ip: '10.0.0.31' }, async () => {
			const item = await schedule.create(retreat.id, {
				name: 'Llegada y recepción',
				type: 'logistica',
				day: 1,
				startTime: '2026-11-20T17:00:00.000Z',
				durationMinutes: 45,
			});
			await schedule.update(item.id, { name: 'Recepción de caminantes' });
			await schedule.delete(item.id);
		});

		const rows = await waitForLogs((r) => rowsOf(r, 'schedule_item.delete').length > 0);
		const create = rowsOf(rows, 'schedule_item.create')[0];
		expect(create.resourceType).toBe('schedule_item');
		expect(create.retreatId).toBe(retreat.id);
		expect(create.actorUserId).toBe(actor.id);
		expect(create.ipAddress).toBe('10.0.0.31');
		expect(JSON.parse(create.newValues!)).toMatchObject({
			name: 'Llegada y recepción',
			type: 'logistica',
		});

		const update = rowsOf(rows, 'schedule_item.update')[0];
		expect(JSON.parse(update.oldValues!)).toMatchObject({ name: 'Llegada y recepción' });
		expect(JSON.parse(update.newValues!)).toMatchObject({
			name: 'Recepción de caminantes',
		});

		const del = rowsOf(rows, 'schedule_item.delete')[0];
		expect(del.retreatId).toBe(retreat.id);
		expect(JSON.parse(del.oldValues!)).toMatchObject({
			name: 'Recepción de caminantes',
		});
	});

	it('startItem deja schedule_item.start con el diff de status', async () => {
		const retreat = await TestDataFactory.createTestRetreat();
		const item = await schedule.create(retreat.id, {
			name: 'Misa de envío',
			type: 'misa',
			day: 2,
			startTime: '2026-11-21T10:00:00.000Z',
		});

		await schedule.startItem(item.id);

		const rows = await waitForLogs((r) => rowsOf(r, 'schedule_item.start').length > 0);
		const row = rowsOf(rows, 'schedule_item.start')[0];
		expect(row.retreatId).toBe(retreat.id);
		expect(JSON.parse(row.oldValues!)).toMatchObject({ status: 'pending' });
		expect(JSON.parse(row.newValues!)).toMatchObject({ status: 'active' });
		expect(JSON.parse(row.newValues!)).toHaveProperty('actualStartTime');
	});

	it('shiftDay deja UN evento agregado con el alcance (y no revienta la transacción)', async () => {
		const retreat = await TestDataFactory.createTestRetreat();
		await schedule.create(retreat.id, {
			name: 'Charla 1',
			type: 'charla',
			day: 1,
			startTime: '2026-11-20T18:00:00.000Z',
		});
		await schedule.create(retreat.id, {
			name: 'Charla 2',
			type: 'charla',
			day: 1,
			startTime: '2026-11-20T20:00:00.000Z',
		});

		// Flush de los logs fire-and-forget de los creates ANTES de abrir la
		// transacción: con better-sqlite3 síncrono, una microtask de log que
		// aterriza dentro de la ventana transaccional la revienta (§25.3).
		await waitForLogs((r) => rowsOf(r, 'schedule_item.create').length >= 2);
		// Corre dentro de AppDataSource.transaction: el log propio se dispara
		// FUERA. Que el test llegue al assert ya prueba que no anidó.
		await schedule.shiftDay(retreat.id, 1, 30);

		const rows = await waitForLogs((r) => rowsOf(r, 'schedule_item.shift_day').length > 0);
		const row = rowsOf(rows, 'schedule_item.shift_day')[0];
		expect(row.retreatId).toBe(retreat.id);
		expect(meta(row)).toMatchObject({ day: 1, minutesDelta: 30, itemsCount: 2 });
	});

	it('plantilla de minuto a minuto: create audita campos y deleteSet cuenta cascade', async () => {
		const set = await scheduleTemplates.createSet({ name: 'Set MaM' });
		await scheduleTemplates.create({
			templateSetId: set.id,
			name: 'Campana inicial',
			type: 'campana',
			defaultDay: 1,
			defaultStartTime: '09:00',
		});

		const rows = await waitForLogs(
			(r) => rowsOf(r, 'schedule_template.create').length > 0,
		);
		const row = rowsOf(rows, 'schedule_template.create')[0];
		expect(row.resourceType).toBe('schedule_template');
		expect(row.retreatId).toBeNull();
		expect(JSON.parse(row.newValues!)).toMatchObject({
			name: 'Campana inicial',
			type: 'campana',
			defaultDay: 1,
		});

		await expect(scheduleTemplates.deleteSet(set.id)).resolves.toBe(true);
		const after = await waitForLogs(
			(r) => rowsOf(r, 'schedule_template_set.delete').length > 0,
		);
		const setDel = rowsOf(after, 'schedule_template_set.delete')[0];
		expect(meta(setDel).cascadeItems).toBe(1);
	});

	it('materializeFromTemplate del schedule deja UN evento agregado replace', async () => {
		const retreat = await TestDataFactory.createTestRetreat();
		const set = await scheduleTemplates.createSet({ name: 'Set instalar' });
		await scheduleTemplates.create({
			templateSetId: set.id,
			name: 'Comida día 1',
			type: 'comida',
			defaultDay: 1,
			defaultStartTime: '14:00',
			blocksSantisimoAttendance: true,
		});

		await schedule.materializeFromTemplate(
			retreat.id,
			new Date('2026-11-20T00:00:00.000Z'),
			false,
			set.id,
		);

		const rows = await waitForLogs(
			(r) => rowsOf(r, 'schedule_item.materialize').length > 0,
		);
		const row = rowsOf(rows, 'schedule_item.materialize')[0];
		expect(row.retreatId).toBe(retreat.id);
		expect(meta(row)).toMatchObject({
			mode: 'replace',
			templateSetId: set.id,
			created: 1,
			clearExisting: false,
		});
	});
});
