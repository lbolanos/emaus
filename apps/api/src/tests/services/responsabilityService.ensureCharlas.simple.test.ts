// Tests para ensureCharlaResponsibilitiesFromTemplateSet
// Cubre: defaults solo crean operativas, charlas se generan al materializar,
// idempotencia, distintos sets con templates exclusivos.

import { setupTestDatabase, teardownTestDatabase } from '../test-setup';
import { TestDataFactory } from '../test-utils/testDataFactory';
import { Responsability, ResponsabilityType } from '@/entities/responsability.entity';
import { ScheduleTemplate } from '@/entities/scheduleTemplate.entity';
import { ScheduleTemplateSet } from '@/entities/scheduleTemplateSet.entity';
import {
	createDefaultResponsibilitiesForRetreat,
	ensureCharlaResponsibilitiesFromTemplateSet,
} from '@/services/responsabilityService';
import { v4 as uuidv4 } from 'uuid';

describe('ensureCharlaResponsibilitiesFromTemplateSet', () => {
	let testRetreat: any;
	let setA: ScheduleTemplateSet;
	let setB: ScheduleTemplateSet;

	const getDS = () => TestDataFactory['testDataSource'];

	beforeAll(async () => {
		await setupTestDatabase();
	});

	afterAll(async () => {
		await teardownTestDatabase();
	});

	beforeEach(async () => {
		const ds = getDS();
		await ds.getRepository(ScheduleTemplate).clear();
		await ds.getRepository(ScheduleTemplateSet).clear();
		await ds.getRepository(Responsability).clear();

		testRetreat = await TestDataFactory.createTestRetreat();

		const setRepo = ds.getRepository(ScheduleTemplateSet);
		setA = await setRepo.save(
			setRepo.create({
				id: uuidv4(),
				name: 'Set A — Test',
				isActive: true,
				isDefault: false,
			}),
		);
		setB = await setRepo.save(
			setRepo.create({
				id: uuidv4(),
				name: 'Set B — Test',
				isActive: true,
				isDefault: false,
			}),
		);

		const tplRepo = ds.getRepository(ScheduleTemplate);
		// Set A: 2 charlas + 1 testimonio + 1 logística (no charlista)
		await tplRepo.save([
			tplRepo.create({
				templateSetId: setA.id,
				name: 'Charla De la Rosa item',
				type: 'charla',
				responsabilityName: 'Charla: De la Rosa',
				defaultDay: 1,
				defaultOrder: 10,
				isActive: true,
			}),
			tplRepo.create({
				templateSetId: setA.id,
				name: 'Charla De la Confianza item',
				type: 'charla',
				responsabilityName: 'Charla: De la Confianza',
				defaultDay: 1,
				defaultOrder: 20,
				isActive: true,
			}),
			tplRepo.create({
				templateSetId: setA.id,
				name: 'Testimonio Conocerte item',
				type: 'testimonio',
				responsabilityName: 'Charla: Conocerte a Ti Mismo',
				defaultDay: 2,
				defaultOrder: 10,
				isActive: true,
			}),
			tplRepo.create({
				templateSetId: setA.id,
				name: 'Almuerzo del equipo',
				type: 'comida',
				responsabilityName: 'Comedor',
				defaultDay: 1,
				defaultOrder: 5,
				isActive: true,
			}),
		]);

		// Set B: 1 charla compartida con A + 1 exclusiva
		await tplRepo.save([
			tplRepo.create({
				templateSetId: setB.id,
				name: 'Charla De la Rosa item',
				type: 'charla',
				responsabilityName: 'Charla: De la Rosa',
				defaultDay: 1,
				defaultOrder: 10,
				isActive: true,
			}),
			tplRepo.create({
				templateSetId: setB.id,
				name: 'Charla Las Cargas item',
				type: 'charla',
				responsabilityName: 'Charla: Las Cargas que Llevamos',
				defaultDay: 1,
				defaultOrder: 30,
				isActive: true,
			}),
		]);
	});

	test('createDefaultResponsibilitiesForRetreat crea solo las 27 operativas (no charlas)', async () => {
		const ds = getDS();
		await createDefaultResponsibilitiesForRetreat(testRetreat, ds);

		const resps = await ds.getRepository(Responsability).find({
			where: { retreatId: testRetreat.id },
		});
		expect(resps).toHaveLength(27);
		// Ninguna debe tener type CHARLISTA — las charlas se generan después.
		const charlistas = resps.filter((r) => r.responsabilityType === ResponsabilityType.CHARLISTA);
		expect(charlistas).toHaveLength(0);
		// Algunas operativas conocidas deben estar.
		const names = new Set(resps.map((r) => r.name));
		expect(names.has('Comedor')).toBe(true);
		expect(names.has('Logistica')).toBe(true);
		expect(names.has('Campanero')).toBe(true);
	});

	test('ensureCharlas crea solo las charlas/testimonios faltantes del set', async () => {
		const ds = getDS();
		await createDefaultResponsibilitiesForRetreat(testRetreat, ds);

		const result = await ensureCharlaResponsibilitiesFromTemplateSet(testRetreat.id, setA.id, ds);

		// 3 nuevas (Rosa, Confianza, Conocerte). 'Comedor' del template no es
		// type charla/testimonio, así que NO se considera para crear charlistas.
		expect(result.created).toBe(3);
		expect(result.alreadyExisting).toBe(0);

		const resps = await ds.getRepository(Responsability).find({
			where: { retreatId: testRetreat.id },
		});
		expect(resps).toHaveLength(27 + 3);

		const charlistas = resps.filter((r) => r.responsabilityType === ResponsabilityType.CHARLISTA);
		expect(charlistas).toHaveLength(3);
		const charlistaNames = new Set(charlistas.map((c) => c.name));
		expect(charlistaNames.has('Charla: De la Rosa')).toBe(true);
		expect(charlistaNames.has('Charla: De la Confianza')).toBe(true);
		expect(charlistaNames.has('Charla: Conocerte a Ti Mismo')).toBe(true);
	});

	test('ensureCharlas asigna anexo en description cuando matchea getDefaultCharlas', async () => {
		const ds = getDS();
		await createDefaultResponsibilitiesForRetreat(testRetreat, ds);
		await ensureCharlaResponsibilitiesFromTemplateSet(testRetreat.id, setA.id, ds);

		const rosa = await ds
			.getRepository(Responsability)
			.findOne({ where: { retreatId: testRetreat.id, name: 'Charla: De la Rosa' } });
		expect(rosa?.description).toBe('A-2-1');

		const confianza = await ds
			.getRepository(Responsability)
			.findOne({ where: { retreatId: testRetreat.id, name: 'Charla: De la Confianza' } });
		expect(confianza?.description).toBe('A-2-17');
	});

	test('ensureCharlas es idempotente — segunda llamada no crea duplicados', async () => {
		const ds = getDS();
		await createDefaultResponsibilitiesForRetreat(testRetreat, ds);
		await ensureCharlaResponsibilitiesFromTemplateSet(testRetreat.id, setA.id, ds);

		const second = await ensureCharlaResponsibilitiesFromTemplateSet(
			testRetreat.id,
			setA.id,
			ds,
		);
		expect(second.created).toBe(0);
		expect(second.alreadyExisting).toBe(3);

		const resps = await ds.getRepository(Responsability).find({
			where: { retreatId: testRetreat.id },
		});
		expect(resps).toHaveLength(27 + 3);
	});

	test('cambiar de set agrega solo las exclusivas del nuevo set', async () => {
		const ds = getDS();
		await createDefaultResponsibilitiesForRetreat(testRetreat, ds);
		await ensureCharlaResponsibilitiesFromTemplateSet(testRetreat.id, setA.id, ds);

		const result = await ensureCharlaResponsibilitiesFromTemplateSet(
			testRetreat.id,
			setB.id,
			ds,
		);
		// setB: De la Rosa (compartida) + Las Cargas (exclusiva). Solo 1 nueva.
		expect(result.created).toBe(1);
		expect(result.alreadyExisting).toBe(1);

		const resps = await ds.getRepository(Responsability).find({
			where: { retreatId: testRetreat.id },
		});
		expect(resps).toHaveLength(27 + 4);
	});

	test('ensureCharlas sin templateSetId considera todos los templates activos', async () => {
		const ds = getDS();
		await createDefaultResponsibilitiesForRetreat(testRetreat, ds);

		const result = await ensureCharlaResponsibilitiesFromTemplateSet(testRetreat.id, undefined, ds);
		// setA: De la Rosa, De la Confianza, Conocerte. setB: De la Rosa (dup), Las Cargas.
		// Únicas: 4.
		expect(result.created).toBe(4);
	});

	test('ensureCharlas ignora templates con isActive=false', async () => {
		const ds = getDS();
		await createDefaultResponsibilitiesForRetreat(testRetreat, ds);

		// Desactivar todos los templates de setA
		await ds
			.getRepository(ScheduleTemplate)
			.update({ templateSetId: setA.id }, { isActive: false });

		const result = await ensureCharlaResponsibilitiesFromTemplateSet(testRetreat.id, setA.id, ds);
		expect(result.created).toBe(0);
	});

	test('ensureCharlas no toca Responsabilidades operativas con el mismo nombre', async () => {
		const ds = getDS();
		await createDefaultResponsibilitiesForRetreat(testRetreat, ds);

		// Inserto un template con responsabilityName que ya existe como operativa
		// (Comedor) pero con type=charla → NO debe duplicar.
		const tplRepo = ds.getRepository(ScheduleTemplate);
		await tplRepo.save(
			tplRepo.create({
				templateSetId: setA.id,
				name: 'Tramposo',
				type: 'charla',
				responsabilityName: 'Comedor',
				isActive: true,
			}),
		);

		await ensureCharlaResponsibilitiesFromTemplateSet(testRetreat.id, setA.id, ds);

		const comedores = await ds
			.getRepository(Responsability)
			.find({ where: { retreatId: testRetreat.id, name: 'Comedor' } });
		expect(comedores).toHaveLength(1);
	});
});
