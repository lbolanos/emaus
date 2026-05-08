// Test de integración: al materializar el template, RetreatScheduleService
// debe auto-generar los SantisimoSlot que cubren el horario completo del
// santísimo (min/max de los items 'santisimo' del template) y, vía
// resolveSantisimoConflicts, marcar los slots overlapados con bloqueadores
// (`blocksSantisimoAttendance`) como mealWindow + auto-asignar angelitos
// (participantes 'partial_server' que NO estén en mesa).

import { setupTestDatabase, teardownTestDatabase } from '../test-setup';
import { TestDataFactory } from '../test-utils/testDataFactory';
import { ScheduleTemplate } from '@/entities/scheduleTemplate.entity';
import { ScheduleTemplateSet } from '@/entities/scheduleTemplateSet.entity';
import { RetreatScheduleItem } from '@/entities/retreatScheduleItem.entity';
import { SantisimoSlot } from '@/entities/santisimoSlot.entity';
import { SantisimoSignup } from '@/entities/santisimoSignup.entity';
import { Responsability } from '@/entities/responsability.entity';
import { RetreatParticipant } from '@/entities/retreatParticipant.entity';
import { RetreatScheduleService } from '@/services/retreatScheduleService';
import { createDefaultResponsibilitiesForRetreat } from '@/services/responsabilityService';
import { v4 as uuidv4 } from 'uuid';

describe('RetreatScheduleService.materializeFromTemplate — auto-generación de SantisimoSlots', () => {
	let testRetreat: any;
	let setId: string;
	let service: RetreatScheduleService;

	const getDS = () => (TestDataFactory as any)['testDataSource'];

	beforeAll(async () => {
		await setupTestDatabase();
	});

	afterAll(async () => {
		await teardownTestDatabase();
	});

	beforeEach(async () => {
		const ds = getDS();
		await ds.getRepository(SantisimoSignup).clear();
		await ds.getRepository(SantisimoSlot).clear();
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
				name: 'Test Set santísimo',
				isActive: true,
				isDefault: false,
			}),
		);
		setId = set.id;

		service = new RetreatScheduleService();
	});

	test('auto-genera slots de 60 min cubriendo min/max de los items santisimo', async () => {
		const ds = getDS();
		const tplRepo = ds.getRepository(ScheduleTemplate);

		// Vigilia día 1: 00:00 → 06:00 (6h = 6 slots de 60 min).
		await tplRepo.save([
			tplRepo.create({
				templateSetId: setId,
				name: 'Vigilia y Adoración',
				type: 'santisimo',
				defaultDay: 1,
				defaultOrder: 10,
				defaultStartTime: '00:00',
				defaultDurationMinutes: 360,
				isActive: true,
			}),
		]);

		const baseDate = new Date('2026-06-01T00:00:00Z');
		await service.materializeFromTemplate(testRetreat.id, baseDate, false, setId);

		const slots = await ds
			.getRepository(SantisimoSlot)
			.find({ where: { retreatId: testRetreat.id }, order: { startTime: 'ASC' } });
		expect(slots).toHaveLength(6);
		const first = new Date(slots[0].startTime).getTime();
		const last = new Date(slots[5].endTime).getTime();
		expect(last - first).toBe(6 * 60 * 60 * 1000);
	});

	test('regenerateSantisimoSlotsFromSchedule descarta items santísimo viejos con timestamps incorrectos (caso San Agustín)', async () => {
		const ds = getDS();
		const tplRepo = ds.getRepository(ScheduleTemplate);
		const itemRepo = ds.getRepository(RetreatScheduleItem);
		const slotRepo = ds.getRepository(SantisimoSlot);

		// Aseguro que la casa del retiro esté en CDMX.
		const houseRepo = ds.getRepository((await import('@/entities/house.entity')).House);
		const retreatRepo = ds.getRepository((await import('@/entities/retreat.entity')).Retreat);
		const retreatRow = await retreatRepo.findOne({
			where: { id: testRetreat.id },
			relations: ['house'],
		});
		await houseRepo.update(retreatRow!.house.id, { timezone: 'America/Mexico_City' });
		// `startDate` se actualiza con SQL directo para evitar el shift de
		// timezone que TypeORM aplica al guardar Date → columna 'date' en SQLite.
		await ds.query(
			`UPDATE retreat SET startDate = '2026-06-05', timezone = NULL WHERE id = ?`,
			[testRetreat.id],
		);

		// Template santísimo: Exposición a las 16:00 hora local del retiro.
		const tpl = await tplRepo.save(
			tplRepo.create({
				templateSetId: setId,
				name: 'Exposición del Santísimo',
				type: 'santisimo',
				defaultDay: 1,
				defaultOrder: 40,
				defaultStartTime: '16:00',
				defaultDurationMinutes: 60,
				isActive: true,
			}),
		);

		// Materializo correctamente (ya con timezone): item queda a 22:00 UTC = 16:00 CDMX.
		await service.materializeFromTemplate(testRetreat.id, new Date('2026-06-05'), false, setId);

		const itemsAfterMaterialize = await itemRepo.find({
			where: { retreatId: testRetreat.id, type: 'santisimo' },
		});
		expect(itemsAfterMaterialize).toHaveLength(1);
		expect(new Date(itemsAfterMaterialize[0].startTime).toISOString())
			.toBe('2026-06-05T22:00:00.000Z');

		// Simulo el bug pre-fix: insertar manualmente un item santísimo "viejo"
		// con startTime 16:00 UTC (= 10:00 AM en CDMX, exactamente lo que vio
		// el usuario en San Agustín).
		await itemRepo.save(
			itemRepo.create({
				retreatId: testRetreat.id,
				scheduleTemplateId: tpl.id,
				name: 'Exposición del Santísimo',
				type: 'santisimo',
				day: 1,
				startTime: new Date('2026-06-05T16:00:00.000Z'),
				endTime: new Date('2026-06-05T17:00:00.000Z'),
				durationMinutes: 60,
				orderInDay: 40,
				status: 'pending',
				blocksSantisimoAttendance: false,
			}),
		);

		const allItems = await itemRepo.find({ where: { retreatId: testRetreat.id, type: 'santisimo' } });
		expect(allItems).toHaveLength(2);

		// Inserto slots viejos directamente (simula el estado real de San Agustín:
		// slots existentes apuntando a 16:00 UTC = 10:00 AM CDMX).
		await slotRepo.delete({ retreatId: testRetreat.id });
		await slotRepo.save([
			slotRepo.create({
				retreatId: testRetreat.id,
				startTime: new Date('2026-06-05T16:00:00.000Z'),
				endTime: new Date('2026-06-05T17:00:00.000Z'),
				capacity: 1,
				isDisabled: false,
			}),
			slotRepo.create({
				retreatId: testRetreat.id,
				startTime: new Date('2026-06-05T17:00:00.000Z'),
				endTime: new Date('2026-06-05T18:00:00.000Z'),
				capacity: 1,
				isDisabled: false,
			}),
		]);
		const slotsBefore = await slotRepo.find({ where: { retreatId: testRetreat.id }, order: { startTime: 'ASC' } });
		expect(new Date(slotsBefore[0].startTime).toISOString()).toBe('2026-06-05T16:00:00.000Z');

		// Llamo al botón "Borrar todo y regenerar".
		const result = await service.regenerateSantisimoSlotsFromSchedule(testRetreat.id);

		// Verifico:
		// 1. El item santísimo VIEJO fue eliminado, solo queda el correcto del template.
		const itemsAfter = await itemRepo.find({
			where: { retreatId: testRetreat.id, type: 'santisimo' },
			order: { startTime: 'ASC' },
		});
		expect(itemsAfter).toHaveLength(1);
		expect(new Date(itemsAfter[0].startTime).toISOString())
			.toBe('2026-06-05T22:00:00.000Z');

		// 2. Los slots regenerados arrancan en 22:00 UTC (= 16:00 CDMX), NO en 16:00 UTC.
		const slotsAfter = await slotRepo.find({
			where: { retreatId: testRetreat.id },
			order: { startTime: 'ASC' },
		});
		expect(slotsAfter.length).toBeGreaterThan(0);
		expect(new Date(slotsAfter[0].startTime).toISOString())
			.toBe('2026-06-05T22:00:00.000Z');

		// 3. Conteos del summary del UI.
		expect(result.replacedItems).toBe(1);
		expect(result.created).toBe(slotsAfter.length);
	});

	test('regenerateSantisimoSlotsFromSchedule deduplica items con el mismo scheduleTemplateId (caso comidas duplicadas)', async () => {
		const ds = getDS();
		const tplRepo = ds.getRepository(ScheduleTemplate);
		const itemRepo = ds.getRepository(RetreatScheduleItem);
		const slotRepo = ds.getRepository(SantisimoSlot);

		const houseRepo = ds.getRepository((await import('@/entities/house.entity')).House);
		const retreatRepo = ds.getRepository((await import('@/entities/retreat.entity')).Retreat);
		const retreatRow = await retreatRepo.findOne({
			where: { id: testRetreat.id },
			relations: ['house'],
		});
		await houseRepo.update(retreatRow!.house.id, { timezone: 'America/Mexico_City' });
		await ds.query(
			`UPDATE retreat SET startDate = '2026-06-05', timezone = NULL WHERE id = ?`,
			[testRetreat.id],
		);

		// Template: santísimo + comida bloqueante.
		const tplSantisimo = await tplRepo.save(
			tplRepo.create({
				templateSetId: setId,
				name: 'Exposición del Santísimo',
				type: 'santisimo',
				defaultDay: 1,
				defaultStartTime: '16:00',
				defaultDurationMinutes: 60,
				isActive: true,
			}),
		);
		const tplComida = await tplRepo.save(
			tplRepo.create({
				templateSetId: setId,
				name: 'Desayuno',
				type: 'comida',
				defaultDay: 2,
				defaultStartTime: '08:20',
				defaultDurationMinutes: 50,
				blocksSantisimoAttendance: true,
				isActive: true,
			}),
		);

		// Materializo correctamente (CDMX): comida queda a 14:20 UTC = 08:20 local.
		await service.materializeFromTemplate(testRetreat.id, new Date('2026-06-05'), false, setId);

		// Inserto el duplicado VIEJO de la comida (bug pre-fix): 08:20 UTC = 02:20 AM CDMX.
		// Espero 1ms entre inserts para garantizar que createdAt sea distinto y el
		// "más reciente" (el correcto) gane.
		await new Promise((r) => setTimeout(r, 5));
		await itemRepo.save(
			itemRepo.create({
				retreatId: testRetreat.id,
				scheduleTemplateId: tplComida.id,
				name: 'Desayuno',
				type: 'comida',
				day: 2,
				startTime: new Date('2026-06-06T08:20:00.000Z'), // viejo
				endTime: new Date('2026-06-06T09:10:00.000Z'),
				durationMinutes: 50,
				orderInDay: 1,
				status: 'pending',
				blocksSantisimoAttendance: true,
			}),
		);

		// Ordeno: el correcto debería ser el más reciente. Re-guardo el correcto
		// para que su createdAt > el viejo.
		const correctItem = await itemRepo.findOne({
			where: {
				retreatId: testRetreat.id,
				scheduleTemplateId: tplComida.id,
				startTime: new Date('2026-06-06T14:20:00.000Z'),
			},
		});
		expect(correctItem).not.toBeNull();
		await new Promise((r) => setTimeout(r, 5));
		// Forzar createdAt mayor con una nueva inserción del item correcto.
		await itemRepo.delete(correctItem!.id);
		await itemRepo.save(
			itemRepo.create({
				retreatId: testRetreat.id,
				scheduleTemplateId: tplComida.id,
				name: 'Desayuno',
				type: 'comida',
				day: 2,
				startTime: new Date('2026-06-06T14:20:00.000Z'), // correcto
				endTime: new Date('2026-06-06T15:10:00.000Z'),
				durationMinutes: 50,
				orderInDay: 1,
				status: 'pending',
				blocksSantisimoAttendance: true,
			}),
		);

		const dupesBefore = await itemRepo.find({
			where: { retreatId: testRetreat.id, scheduleTemplateId: tplComida.id },
		});
		expect(dupesBefore).toHaveLength(2);

		const result = await service.regenerateSantisimoSlotsFromSchedule(testRetreat.id);

		// Re-materializa todo el template → los duplicados desaparecen y queda
		// 1 solo item de comida con el timestamp correcto (14:20 UTC = 8:20 CDMX).
		const comidaItemsAfter = await itemRepo.find({
			where: { retreatId: testRetreat.id, scheduleTemplateId: tplComida.id },
		});
		expect(comidaItemsAfter).toHaveLength(1);
		expect(new Date(comidaItemsAfter[0].startTime).toISOString())
			.toBe('2026-06-06T14:20:00.000Z');

		// Se eliminaron AL MENOS los 2 items duplicados de comida + 1 santísimo
		// (los del template existentes antes del regenerate).
		expect(result.removedTemplateItems).toBeGreaterThanOrEqual(2);
	});

	test('regenerateSantisimoSlotsFromSchedule preserva items manuales (sin scheduleTemplateId)', async () => {
		const ds = getDS();
		const tplRepo = ds.getRepository(ScheduleTemplate);
		const itemRepo = ds.getRepository(RetreatScheduleItem);

		const houseRepo = ds.getRepository((await import('@/entities/house.entity')).House);
		const retreatRepo = ds.getRepository((await import('@/entities/retreat.entity')).Retreat);
		const retreatRow = await retreatRepo.findOne({
			where: { id: testRetreat.id },
			relations: ['house'],
		});
		await houseRepo.update(retreatRow!.house.id, { timezone: 'America/Mexico_City' });
		await ds.query(
			`UPDATE retreat SET startDate = '2026-06-05', timezone = NULL WHERE id = ?`,
			[testRetreat.id],
		);

		// Template normal: 1 santísimo + 1 charla.
		await tplRepo.save([
			tplRepo.create({
				templateSetId: setId,
				name: 'Exposición del Santísimo',
				type: 'santisimo',
				defaultDay: 1,
				defaultStartTime: '16:00',
				defaultDurationMinutes: 60,
				isActive: true,
			}),
			tplRepo.create({
				templateSetId: setId,
				name: 'Charla original',
				type: 'charla',
				defaultDay: 1,
				defaultStartTime: '20:00',
				defaultDurationMinutes: 45,
				isActive: true,
			}),
		]);

		await service.materializeFromTemplate(testRetreat.id, new Date('2026-06-05'), false, setId);

		// El admin agrega un item manual extra (sin templateId).
		const manualItem = await itemRepo.save(
			itemRepo.create({
				retreatId: testRetreat.id,
				scheduleTemplateId: null,
				name: 'Anuncio del coordinador',
				type: 'logistica',
				day: 1,
				startTime: new Date('2026-06-05T20:30:00.000Z'),
				endTime: new Date('2026-06-05T20:35:00.000Z'),
				durationMinutes: 5,
				orderInDay: 999,
				status: 'pending',
				blocksSantisimoAttendance: false,
			}),
		);
		expect(manualItem.id).toBeDefined();

		// Verifica estado pre-regenerate: 2 items del template + 1 manual.
		const allBefore = await itemRepo.find({ where: { retreatId: testRetreat.id } });
		expect(allBefore).toHaveLength(3);

		await service.regenerateSantisimoSlotsFromSchedule(testRetreat.id);

		// El item manual sigue presente con sus campos intactos.
		const manualAfter = await itemRepo.findOne({ where: { id: manualItem.id } });
		expect(manualAfter).not.toBeNull();
		expect(manualAfter!.name).toBe('Anuncio del coordinador');
		expect(manualAfter!.scheduleTemplateId).toBeNull();
		expect(new Date(manualAfter!.startTime).toISOString())
			.toBe('2026-06-05T20:30:00.000Z');

		// Y los items del template fueron re-materializados (mismas 2, no duplicados).
		const templateItemsAfter = await itemRepo
			.createQueryBuilder('it')
			.where('it.retreatId = :retreatId', { retreatId: testRetreat.id })
			.andWhere('it.scheduleTemplateId IS NOT NULL')
			.getMany();
		expect(templateItemsAfter).toHaveLength(2);
	});

	test('idempotente: re-materializar no duplica slots ni borra signups previos', async () => {
		const ds = getDS();
		const tplRepo = ds.getRepository(ScheduleTemplate);

		await tplRepo.save([
			tplRepo.create({
				templateSetId: setId,
				name: 'Vigilia',
				type: 'santisimo',
				defaultDay: 1,
				defaultOrder: 10,
				defaultStartTime: '00:00',
				defaultDurationMinutes: 180,
				isActive: true,
			}),
		]);

		const baseDate = new Date('2026-06-01T00:00:00Z');
		await service.materializeFromTemplate(testRetreat.id, baseDate, false, setId);

		// Inserta un signup en el primer slot para verificar que sobrevive.
		const slotRepo = ds.getRepository(SantisimoSlot);
		const sigRepo = ds.getRepository(SantisimoSignup);
		const slots = await slotRepo.find({ where: { retreatId: testRetreat.id }, order: { startTime: 'ASC' } });
		const sig = await sigRepo.save(
			sigRepo.create({
				slotId: slots[0].id,
				name: 'Pre-existente',
				phone: null,
				email: null,
				userId: null,
				cancelToken: null,
				isAngelito: false,
				autoAssigned: false,
			}),
		);

		// Re-materialize con clearExisting=true (borra y recrea schedule items, pero NO los slots).
		await service.materializeFromTemplate(testRetreat.id, baseDate, true, setId);

		const slotsAfter = await slotRepo.find({ where: { retreatId: testRetreat.id } });
		expect(slotsAfter).toHaveLength(3);

		const sigStill = await sigRepo.findOne({ where: { id: sig.id } });
		expect(sigStill).not.toBeNull();
	});

	test('auto-asigna angelitos (partial_server sin mesa) a slots mealWindow', async () => {
		const ds = getDS();
		const tplRepo = ds.getRepository(ScheduleTemplate);

		// Vigilia (3h, 3 slots) + Cena de 1h adentro de la ventana (mealWindow para 1 slot).
		await tplRepo.save([
			tplRepo.create({
				templateSetId: setId,
				name: 'Vigilia',
				type: 'santisimo',
				defaultDay: 1,
				defaultOrder: 10,
				defaultStartTime: '00:00',
				defaultDurationMinutes: 180,
				isActive: true,
			}),
			tplRepo.create({
				templateSetId: setId,
				name: 'Cena (bloqueadora)',
				type: 'comida',
				defaultDay: 1,
				defaultOrder: 20,
				defaultStartTime: '01:00',
				defaultDurationMinutes: 60,
				blocksSantisimoAttendance: true,
				isActive: true,
			}),
		]);

		// 2 angelitos sin mesa
		await TestDataFactory.createTestParticipant(testRetreat.id, {
			firstName: 'Angel A',
			type: 'partial_server',
		} as any);
		await TestDataFactory.createTestParticipant(testRetreat.id, {
			firstName: 'Angel B',
			type: 'partial_server',
		} as any);

		const baseDate = new Date('2026-06-01T00:00:00Z');
		await service.materializeFromTemplate(testRetreat.id, baseDate, false, setId);

		const slots = await ds
			.getRepository(SantisimoSlot)
			.find({ where: { retreatId: testRetreat.id }, relations: ['signups'], order: { startTime: 'ASC' } });
		expect(slots).toHaveLength(3);

		const mealSlots = slots.filter((s: any) => s.mealWindow);
		expect(mealSlots.length).toBeGreaterThanOrEqual(1);

		// El slot que overlapa con la cena (01:00 → 02:00) debe tener un angelito asignado.
		for (const ms of mealSlots) {
			const auto = (ms.signups ?? []).filter((s: any) => s.isAngelito && s.autoAssigned);
			expect(auto.length).toBeGreaterThanOrEqual(1);
		}
	});

	test('servidor en mesa NO se asigna a un mealWindow slot', async () => {
		const ds = getDS();
		const tplRepo = ds.getRepository(ScheduleTemplate);

		// Una mesa para asociar al servidor.
		const tables = await TestDataFactory.createTestTables(testRetreat.id, 1);
		const tableId = tables[0].id;

		await tplRepo.save([
			tplRepo.create({
				templateSetId: setId,
				name: 'Vigilia',
				type: 'santisimo',
				defaultDay: 1,
				defaultOrder: 10,
				defaultStartTime: '00:00',
				defaultDurationMinutes: 120,
				isActive: true,
			}),
			tplRepo.create({
				templateSetId: setId,
				name: 'Cena',
				type: 'comida',
				defaultDay: 1,
				defaultOrder: 20,
				defaultStartTime: '00:00',
				defaultDurationMinutes: 60,
				blocksSantisimoAttendance: true,
				isActive: true,
			}),
		]);

		// Servidor partial_server PERO con mesa (no debe asignarse).
		const inTable = await TestDataFactory.createTestParticipant(testRetreat.id, {
			firstName: 'Servidor en Mesa',
			type: 'partial_server',
			tableId,
		} as any);

		const baseDate = new Date('2026-06-01T00:00:00Z');
		await service.materializeFromTemplate(testRetreat.id, baseDate, false, setId);

		const slots = await ds
			.getRepository(SantisimoSlot)
			.find({ where: { retreatId: testRetreat.id }, relations: ['signups'], order: { startTime: 'ASC' } });

		// El primer slot (00:00 → 01:00) debe ser mealWindow y NO contener al servidor en mesa.
		const meal = slots.find((s: any) => s.mealWindow);
		expect(meal).toBeDefined();
		const sigs = meal!.signups ?? [];
		expect(sigs.find((s: any) => s.participantId === inTable.id)).toBeUndefined();
	});

	test('sin items santisimo en el set → no crea slots, sin error', async () => {
		const ds = getDS();
		const tplRepo = ds.getRepository(ScheduleTemplate);

		await tplRepo.save([
			tplRepo.create({
				templateSetId: setId,
				name: 'Solo cena',
				type: 'comida',
				defaultDay: 1,
				defaultOrder: 10,
				defaultStartTime: '19:00',
				defaultDurationMinutes: 60,
				isActive: true,
			}),
		]);

		const baseDate = new Date('2026-06-01T00:00:00Z');
		await expect(
			service.materializeFromTemplate(testRetreat.id, baseDate, false, setId),
		).resolves.toBeDefined();

		const slots = await ds.getRepository(SantisimoSlot).find({ where: { retreatId: testRetreat.id } });
		expect(slots).toHaveLength(0);
	});

	test('reparte angelitos distintos entre slots de comida (no asigna el mismo a todos)', async () => {
		const ds = getDS();
		const tplRepo = ds.getRepository(ScheduleTemplate);

		// Vigilia de 4h con 4 comidas no-overlapadas adentro → 4 mealWindow slots.
		await tplRepo.save([
			tplRepo.create({
				templateSetId: setId,
				name: 'Vigilia',
				type: 'santisimo',
				defaultDay: 1,
				defaultOrder: 5,
				defaultStartTime: '00:00',
				defaultDurationMinutes: 240,
				isActive: true,
			}),
			tplRepo.create({
				templateSetId: setId,
				name: 'Comida 1',
				type: 'comida',
				defaultDay: 1,
				defaultOrder: 10,
				defaultStartTime: '00:00',
				defaultDurationMinutes: 30,
				blocksSantisimoAttendance: true,
				isActive: true,
			}),
			tplRepo.create({
				templateSetId: setId,
				name: 'Comida 2',
				type: 'comida',
				defaultDay: 1,
				defaultOrder: 20,
				defaultStartTime: '01:00',
				defaultDurationMinutes: 30,
				blocksSantisimoAttendance: true,
				isActive: true,
			}),
			tplRepo.create({
				templateSetId: setId,
				name: 'Comida 3',
				type: 'comida',
				defaultDay: 1,
				defaultOrder: 30,
				defaultStartTime: '02:00',
				defaultDurationMinutes: 30,
				blocksSantisimoAttendance: true,
				isActive: true,
			}),
			tplRepo.create({
				templateSetId: setId,
				name: 'Comida 4',
				type: 'comida',
				defaultDay: 1,
				defaultOrder: 40,
				defaultStartTime: '03:00',
				defaultDurationMinutes: 30,
				blocksSantisimoAttendance: true,
				isActive: true,
			}),
		]);

		// 4 angelitos sin mesa (suficientes para un por slot).
		for (let i = 0; i < 4; i++) {
			await TestDataFactory.createTestParticipant(testRetreat.id, {
				firstName: `Angel ${i}`,
				type: 'partial_server',
			} as any);
		}

		const baseDate = new Date('2026-06-01T00:00:00Z');
		await service.materializeFromTemplate(testRetreat.id, baseDate, false, setId);

		const slots = await ds
			.getRepository(SantisimoSlot)
			.find({ where: { retreatId: testRetreat.id }, relations: ['signups'], order: { startTime: 'ASC' } });
		const meal = slots.filter((s: any) => s.mealWindow);
		expect(meal.length).toBeGreaterThanOrEqual(4);

		const assignedPids = meal
			.flatMap((s: any) => (s.signups ?? []).filter((sig: any) => sig.isAngelito && sig.autoAssigned))
			.map((sig: any) => sig.participantId);
		expect(assignedPids.length).toBeGreaterThanOrEqual(4);

		const distinct = new Set(assignedPids);
		// Con 4 angelitos disponibles y 4 slots, esperamos al menos 2 distintos
		// (idealmente 4). El bug original asignaba 1 al de todos.
		expect(distinct.size).toBeGreaterThanOrEqual(2);
	});

	test('rebalance: si todos los slots ya tienen al mismo angelito, redistribuye al re-llamar', async () => {
		const ds = getDS();
		const tplRepo = ds.getRepository(ScheduleTemplate);

		// 3 comidas no-overlapadas dentro de una vigilia → 3 mealWindow slots.
		await tplRepo.save([
			tplRepo.create({
				templateSetId: setId,
				name: 'Vigilia',
				type: 'santisimo',
				defaultDay: 1,
				defaultOrder: 5,
				defaultStartTime: '00:00',
				defaultDurationMinutes: 180,
				isActive: true,
			}),
			tplRepo.create({
				templateSetId: setId,
				name: 'Comida 1',
				type: 'comida',
				defaultDay: 1,
				defaultOrder: 10,
				defaultStartTime: '00:00',
				defaultDurationMinutes: 30,
				blocksSantisimoAttendance: true,
				isActive: true,
			}),
			tplRepo.create({
				templateSetId: setId,
				name: 'Comida 2',
				type: 'comida',
				defaultDay: 1,
				defaultOrder: 20,
				defaultStartTime: '01:00',
				defaultDurationMinutes: 30,
				blocksSantisimoAttendance: true,
				isActive: true,
			}),
			tplRepo.create({
				templateSetId: setId,
				name: 'Comida 3',
				type: 'comida',
				defaultDay: 1,
				defaultOrder: 30,
				defaultStartTime: '02:00',
				defaultDurationMinutes: 30,
				blocksSantisimoAttendance: true,
				isActive: true,
			}),
		]);

		const baseDate = new Date('2026-06-01T00:00:00Z');
		// Materializa SIN angelitos creados todavía → slots quedan vacíos en mealWindow.
		await service.materializeFromTemplate(testRetreat.id, baseDate, false, setId);

		// Ahora simula el bug del campo: forzar manualmente que TODOS los meal slots
		// tengan al mismo angelito asignado (con autoAssigned=true). Esto reproduce
		// el estado "Eduardo en todos los slots".
		const angelA = await TestDataFactory.createTestParticipant(testRetreat.id, {
			firstName: 'Angel A',
			type: 'partial_server',
		} as any);
		await TestDataFactory.createTestParticipant(testRetreat.id, {
			firstName: 'Angel B',
			type: 'partial_server',
		} as any);
		await TestDataFactory.createTestParticipant(testRetreat.id, {
			firstName: 'Angel C',
			type: 'partial_server',
		} as any);

		const slotRepo = ds.getRepository(SantisimoSlot);
		const sigRepo = ds.getRepository(SantisimoSignup);
		const meal = await slotRepo.find({ where: { retreatId: testRetreat.id, mealWindow: true } });
		expect(meal.length).toBe(3);
		// Borra signups previos y mete a Angel A en todos.
		for (const s of meal) {
			await sigRepo.delete({ slotId: s.id });
			await sigRepo.save(
				sigRepo.create({
					slotId: s.id,
					participantId: angelA.id,
					name: 'Angel A',
					phone: null,
					email: null,
					userId: null,
					cancelToken: null,
					ipAddress: null,
					isAngelito: true,
					autoAssigned: true,
				}),
			);
		}

		// Re-corre auto-asignación. Debe rebalancear.
		await service.resolveSantisimoConflicts(testRetreat.id);

		const after = await slotRepo.find({
			where: { retreatId: testRetreat.id, mealWindow: true },
			relations: ['signups'],
		});
		const assignedNames = after
			.flatMap((s: any) => (s.signups ?? []).filter((sig: any) => sig.isAngelito))
			.map((sig: any) => sig.name);
		const distinct = new Set(assignedNames);
		// Con 3 angelitos disponibles y 3 slots, el rebalance debe usar al menos 2 distintos.
		expect(distinct.size).toBeGreaterThanOrEqual(2);
	});

	test('addMissingTemplateItems crea slots cuando agrega items santisimo nuevos', async () => {
		const ds = getDS();
		const tplRepo = ds.getRepository(ScheduleTemplate);

		// Materializar primero un set sin items santisimo.
		await tplRepo.save([
			tplRepo.create({
				templateSetId: setId,
				name: 'Cena',
				type: 'comida',
				defaultDay: 1,
				defaultOrder: 10,
				defaultStartTime: '19:00',
				defaultDurationMinutes: 60,
				isActive: true,
			}),
		]);

		const baseDate = new Date('2026-06-01T00:00:00Z');
		await service.materializeFromTemplate(testRetreat.id, baseDate, false, setId);
		const slotsBefore = await ds
			.getRepository(SantisimoSlot)
			.find({ where: { retreatId: testRetreat.id } });
		expect(slotsBefore).toHaveLength(0);

		// Ahora agregar al template un item santisimo nuevo y correr addMissingTemplateItems.
		await tplRepo.save(
			tplRepo.create({
				templateSetId: setId,
				name: 'Vigilia añadida',
				type: 'santisimo',
				defaultDay: 1,
				defaultOrder: 50,
				defaultStartTime: '00:00',
				defaultDurationMinutes: 120,
				isActive: true,
			}),
		);

		const result = await service.addMissingTemplateItems(testRetreat.id, baseDate, setId);
		expect(result.added).toBe(1);

		const slotsAfter = await ds
			.getRepository(SantisimoSlot)
			.find({ where: { retreatId: testRetreat.id } });
		expect(slotsAfter).toHaveLength(2);
	});
});
