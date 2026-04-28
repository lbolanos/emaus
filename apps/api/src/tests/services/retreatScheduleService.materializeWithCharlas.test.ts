// Test de integración: materializeFromTemplate y addMissingTemplateItems
// ahora invocan ensureCharlaResponsibilitiesFromTemplateSet antes de
// construir el respIndex, así los items recién creados quedan vinculados
// a las Responsabilidades de charla en el mismo paso.

import { setupTestDatabase, teardownTestDatabase } from '../test-setup';
import { TestDataFactory } from '../test-utils/testDataFactory';
import { Responsability, ResponsabilityType } from '@/entities/responsability.entity';
import { ScheduleTemplate } from '@/entities/scheduleTemplate.entity';
import { ScheduleTemplateSet } from '@/entities/scheduleTemplateSet.entity';
import { RetreatScheduleItem } from '@/entities/retreatScheduleItem.entity';
import { RetreatScheduleService } from '@/services/retreatScheduleService';
import { createDefaultResponsibilitiesForRetreat } from '@/services/responsabilityService';
import { v4 as uuidv4 } from 'uuid';

describe('RetreatScheduleService.materializeFromTemplate — auto-creación de charlas', () => {
	let testRetreat: any;
	let setId: string;
	let service: RetreatScheduleService;

	const getDS = () => TestDataFactory['testDataSource'];

	beforeAll(async () => {
		await setupTestDatabase();
	});

	afterAll(async () => {
		await teardownTestDatabase();
	});

	beforeEach(async () => {
		const ds = getDS();
		await ds.getRepository(RetreatScheduleItem).clear();
		await ds.getRepository(ScheduleTemplate).clear();
		await ds.getRepository(ScheduleTemplateSet).clear();
		await ds.getRepository(Responsability).clear();

		testRetreat = await TestDataFactory.createTestRetreat();
		await createDefaultResponsibilitiesForRetreat(testRetreat, ds);

		const setRepo = ds.getRepository(ScheduleTemplateSet);
		const set = await setRepo.save(
			setRepo.create({
				id: uuidv4(),
				name: 'Test Set',
				isActive: true,
				isDefault: false,
			}),
		);
		setId = set.id;

		const tplRepo = ds.getRepository(ScheduleTemplate);
		await tplRepo.save([
			tplRepo.create({
				templateSetId: setId,
				name: 'Charla: De la Rosa item',
				type: 'charla',
				responsabilityName: 'Charla: De la Rosa',
				defaultDay: 1,
				defaultOrder: 10,
				defaultStartTime: '21:07',
				defaultDurationMinutes: 8,
				isActive: true,
			}),
			tplRepo.create({
				templateSetId: setId,
				name: 'Testimonio Conocerte',
				type: 'testimonio',
				responsabilityName: 'Charla: Conocerte a Ti Mismo',
				defaultDay: 1,
				defaultOrder: 20,
				defaultStartTime: '21:40',
				defaultDurationMinutes: 50,
				isActive: true,
			}),
			tplRepo.create({
				templateSetId: setId,
				name: 'Cena',
				type: 'comida',
				responsabilityName: 'Comedor',
				defaultDay: 1,
				defaultOrder: 5,
				defaultStartTime: '19:00',
				defaultDurationMinutes: 30,
				isActive: true,
			}),
		]);

		// Instancia el service DESPUÉS del setup para que los repos privados
		// se construyan con el AppDataSource ya re-cableado al testDataSource.
		service = new RetreatScheduleService();
	});

	test('materializeFromTemplate crea las charlas del set y vincula los items', async () => {
		const ds = getDS();

		const before = await ds.getRepository(Responsability).find({
			where: { retreatId: testRetreat.id },
		});
		expect(before).toHaveLength(27); // solo operativas

		const baseDate = new Date('2026-06-01T00:00:00Z');
		const items = await service.materializeFromTemplate(testRetreat.id, baseDate, false, setId);

		expect(items).toHaveLength(3);

		const after = await ds.getRepository(Responsability).find({
			where: { retreatId: testRetreat.id },
		});
		// 27 operativas + 2 charlas (Comedor ya existía como operativa).
		expect(after).toHaveLength(29);

		const charlistas = after.filter((r) => r.responsabilityType === ResponsabilityType.CHARLISTA);
		expect(charlistas).toHaveLength(2);
		const charlistaNames = new Set(charlistas.map((c) => c.name));
		expect(charlistaNames.has('Charla: De la Rosa')).toBe(true);
		expect(charlistaNames.has('Charla: Conocerte a Ti Mismo')).toBe(true);

		// Todos los items deben tener responsabilityId asignado (match exacto por nombre).
		const linked = items.filter((i) => i.responsabilityId);
		expect(linked).toHaveLength(3);

		// El item de "Cena" se vincula a la operativa "Comedor", no a una charlista.
		const cena = items.find((i) => i.name === 'Cena');
		const comedor = after.find((r) => r.name === 'Comedor');
		expect(cena?.responsabilityId).toBe(comedor?.id);

		// El item de Charla se vincula a la charlista recién creada.
		const charla = items.find((i) => i.name === 'Charla: De la Rosa item');
		const rosa = after.find((r) => r.name === 'Charla: De la Rosa');
		expect(charla?.responsabilityId).toBe(rosa?.id);
		expect(rosa?.description).toBe('A-2-1'); // anexo enriquecido desde getDefaultCharlas
	});

	test('materializar dos veces el mismo set es idempotente (no duplica charlas)', async () => {
		const ds = getDS();
		const baseDate = new Date('2026-06-01T00:00:00Z');

		await service.materializeFromTemplate(testRetreat.id, baseDate, true, setId);
		await service.materializeFromTemplate(testRetreat.id, baseDate, true, setId);

		const resps = await ds.getRepository(Responsability).find({
			where: { retreatId: testRetreat.id },
		});
		expect(resps).toHaveLength(29);
	});

	test('addMissingTemplateItems también crea las charlas faltantes', async () => {
		const ds = getDS();
		const baseDate = new Date('2026-06-01T00:00:00Z');

		// Primero materializa SIN el set (no hace nada porque no hay templates "globales")
		// y luego usamos addMissingTemplateItems para incrementalmente traer el set.
		const result = await service.addMissingTemplateItems(testRetreat.id, baseDate, setId);
		expect(result.added).toBe(3);

		const resps = await ds.getRepository(Responsability).find({
			where: { retreatId: testRetreat.id },
		});
		expect(resps).toHaveLength(29);

		// Segunda llamada: no agrega ni items ni charlas duplicadas.
		const second = await service.addMissingTemplateItems(testRetreat.id, baseDate, setId);
		expect(second.added).toBe(0);
		expect(second.skipped).toBe(3);

		const respsAfter = await ds.getRepository(Responsability).find({
			where: { retreatId: testRetreat.id },
		});
		expect(respsAfter).toHaveLength(29);
	});
});
