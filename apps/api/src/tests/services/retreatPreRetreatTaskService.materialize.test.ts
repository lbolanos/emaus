// Integración con DB real: materialización del template de tareas pre-retiro,
// cálculo de dueDate (startDate − offset, herencia del padre), idempotencia de
// addMissingTemplateItems, validación de profundidad 2 y completedAt en setStatus.

import { setupTestDatabase, teardownTestDatabase } from '../test-setup';
import { TestDataFactory } from '../test-utils/testDataFactory';
import { PreRetreatTaskTemplate } from '@/entities/preRetreatTaskTemplate.entity';
import { PreRetreatTaskTemplateSet } from '@/entities/preRetreatTaskTemplateSet.entity';
import { RetreatPreRetreatTask } from '@/entities/retreatPreRetreatTask.entity';
import { RetreatPreRetreatTaskService } from '@/services/retreatPreRetreatTaskService';
import { createDefaultPreRetreatTaskTemplate, __TEST__ } from '@/data/preRetreatTaskSeeder';
import { v4 as uuidv4 } from 'uuid';

describe('RetreatPreRetreatTaskService — materialización y estados', () => {
	let testRetreat: any;
	let setId: string;
	let service: RetreatPreRetreatTaskService;

	const getDS = () => TestDataFactory['testDataSource'];

	beforeAll(async () => {
		await setupTestDatabase();
	});

	afterAll(async () => {
		await teardownTestDatabase();
	});

	beforeEach(async () => {
		const ds = getDS();
		await ds.getRepository(RetreatPreRetreatTask).createQueryBuilder().delete().execute();
		await ds.getRepository(PreRetreatTaskTemplate).createQueryBuilder().delete().execute();
		await ds.getRepository(PreRetreatTaskTemplateSet).createQueryBuilder().delete().execute();

		// startDate fijo para dueDates deterministas.
		testRetreat = await TestDataFactory.createTestRetreat({
			startDate: new Date('2026-09-18T12:00:00Z'),
		} as any);

		const setRepo = ds.getRepository(PreRetreatTaskTemplateSet);
		const set = await setRepo.save(
			setRepo.create({ id: uuidv4(), name: 'Test Pre-Retiro', isActive: true, isDefault: true }),
		);
		setId = set.id;

		const tplRepo = ds.getRepository(PreRetreatTaskTemplate);
		const snacks = await tplRepo.save(
			tplRepo.create({
				templateSetId: setId,
				name: 'Snacks',
				dueOffsetDays: 14,
				defaultOrder: 20,
				isActive: true,
			}),
		);
		await tplRepo.save([
			tplRepo.create({
				templateSetId: setId,
				parentId: snacks.id,
				name: 'Comprar snacks',
				defaultOrder: 10,
				isActive: true,
				// sin offset propio → hereda 14 del padre
			}),
			tplRepo.create({
				templateSetId: setId,
				parentId: snacks.id,
				name: 'Verificar cafeteras',
				dueOffsetDays: 7, // offset propio, NO hereda
				defaultOrder: 20,
				isActive: true,
			}),
			tplRepo.create({
				templateSetId: setId,
				name: 'Buscar parroquia',
				dueOffsetDays: 120,
				defaultOrder: 10,
				isActive: true,
			}),
			tplRepo.create({
				templateSetId: setId,
				name: 'Equipo de Logística',
				dueOffsetDays: null, // sin offset → sin dueDate
				defaultOrder: 30,
				isActive: true,
			}),
		]);

		service = new RetreatPreRetreatTaskService();
	});

	test('materializeFromTemplate crea raíces + hijos con parentId mapeado y dueDates correctas', async () => {
		const roots = await service.materializeFromTemplate(testRetreat.id, setId);

		expect(roots).toHaveLength(3);
		const byName = new Map(roots.map((r) => [r.name, r]));

		// 2026-09-18 − 120 = 2026-05-21; − 14 = 2026-09-04
		expect(byName.get('Buscar parroquia')?.dueDate).toBe('2026-05-21');
		expect(byName.get('Snacks')?.dueDate).toBe('2026-09-04');
		expect(byName.get('Equipo de Logística')?.dueDate).toBeNull();

		const snacks = byName.get('Snacks')!;
		expect(snacks.children).toHaveLength(2);
		const childByName = new Map(snacks.children!.map((c) => [c.name, c]));
		// hijo sin offset hereda el del padre (14) → misma dueDate
		expect(childByName.get('Comprar snacks')?.dueDate).toBe('2026-09-04');
		// hijo con offset propio (7) → 2026-09-11
		expect(childByName.get('Verificar cafeteras')?.dueDate).toBe('2026-09-11');
		// todos los hijos anclados al id de instancia del padre
		for (const c of snacks.children!) expect(c.parentId).toBe(snacks.id);

		expect(snacks.progress).toEqual({ done: 0, total: 2 });
	});

	test('clearExisting reemplaza; sin él, materializar de nuevo duplicaría (usar add-missing)', async () => {
		await service.materializeFromTemplate(testRetreat.id, setId);
		const again = await service.materializeFromTemplate(testRetreat.id, setId, true);
		expect(again).toHaveLength(3); // reemplazó, no acumuló
	});

	test('addMissingTemplateItems es idempotente: segunda corrida added=0', async () => {
		const first = await service.addMissingTemplateItems(testRetreat.id, setId);
		expect(first.added).toBe(5);
		expect(first.total).toBe(5);

		const second = await service.addMissingTemplateItems(testRetreat.id, setId);
		expect(second.added).toBe(0);
		expect(second.skipped).toBe(5);
	});

	test('addMissingTemplateItems agrega solo lo nuevo del template', async () => {
		await service.materializeFromTemplate(testRetreat.id, setId);

		const ds = getDS();
		const tplRepo = ds.getRepository(PreRetreatTaskTemplate);
		await tplRepo.save(
			tplRepo.create({
				templateSetId: setId,
				name: 'Flores',
				dueOffsetDays: 2,
				defaultOrder: 40,
				isActive: true,
			}),
		);

		const r = await service.addMissingTemplateItems(testRetreat.id, setId);
		expect(r.added).toBe(1);
		const roots = await service.listForRetreat(testRetreat.id);
		expect(roots.map((x) => x.name)).toContain('Flores');
		expect(roots.find((x) => x.name === 'Flores')?.dueDate).toBe('2026-09-16');
	});

	test('create rechaza profundidad 3 (padre que ya es sub-tarea)', async () => {
		const roots = await service.materializeFromTemplate(testRetreat.id, setId);
		const snacks = roots.find((r) => r.name === 'Snacks')!;
		const child = snacks.children![0];

		await expect(
			service.create(testRetreat.id, { name: 'Nieto inválido', parentId: child.id }),
		).rejects.toThrow(/dos niveles/);
	});

	test('create con dueOffsetDays y sin dueDate deriva la fecha del retiro', async () => {
		const task = await service.create(testRetreat.id, {
			name: 'Tarea manual',
			dueOffsetDays: 7,
		});
		expect(task.dueDate).toBe('2026-09-11');
	});

	test('setStatus done setea completedAt; volver a pending lo limpia', async () => {
		const task = await service.create(testRetreat.id, { name: 'Confirmar menús' });

		const done = await service.setStatus(task.id, 'done');
		expect(done.status).toBe('done');
		expect(done.completedAt).toBeTruthy();

		const reopened = await service.setStatus(task.id, 'pending');
		expect(reopened.status).toBe('pending');
		expect(reopened.completedAt).toBeNull();
	});

	test('update de parentId valida mismo retiro y que el padre sea raíz', async () => {
		const otherRetreat = await TestDataFactory.createTestRetreat({
			startDate: new Date('2026-10-01T12:00:00Z'),
		} as any);
		const foreign = await service.create(otherRetreat.id, { name: 'Tarea ajena' });
		const mine = await service.create(testRetreat.id, { name: 'Tarea propia' });

		await expect(service.update(mine.id, { parentId: foreign.id })).rejects.toThrow(
			/otro retiro/,
		);
	});

	test('el seeder real es idempotente contra la DB (segunda corrida no agrega)', async () => {
		const ds = getDS();
		await createDefaultPreRetreatTaskTemplate();
		const countAfterFirst = await ds.getRepository(PreRetreatTaskTemplate).count();
		expect(countAfterFirst).toBeGreaterThan(0);

		await createDefaultPreRetreatTaskTemplate();
		const countAfterSecond = await ds.getRepository(PreRetreatTaskTemplate).count();
		expect(countAfterSecond).toBe(countAfterFirst);

		// El seed completo quedó en DB: raíces + hijos
		const expectedTotal =
			__TEST__.PRE_RETIRO_EMAUS.length +
			__TEST__.PRE_RETIRO_EMAUS.reduce((acc, t) => acc + (t.children?.length ?? 0), 0);
		// count incluye también los templates del set de prueba de este describe
		const seeded = await ds
			.getRepository(PreRetreatTaskTemplate)
			.createQueryBuilder('t')
			.innerJoin(
				PreRetreatTaskTemplateSet,
				's',
				's.id = t.templateSetId AND s.name = :name',
				{ name: __TEST__.SET_NAME },
			)
			.getCount();
		expect(seeded).toBe(expectedTotal);
	});
});
