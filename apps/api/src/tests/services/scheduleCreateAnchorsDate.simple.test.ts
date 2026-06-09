// Regresión (2026-06-08): al crear un item manual del minuto a minuto, el
// coordinador elige un "Día N" + una hora, pero el <input type="datetime-local">
// manda también una FECHA (la de hoy) que no corresponde al Día elegido. Antes,
// create() guardaba ese startTime tal cual; con day=1 pero fecha de hoy, el item
// se hundía al fondo del grupo "Día 1" (cuya fecha real es retreat.startDate) y
// parecía "no creado".
//
// Fix: create() re-ancla la fecha al Día N usando retreat.startDate + la timezone
// del retiro (reusa computeItemDateRange, igual que materializeFromTemplate),
// conservando la hora de pared que el coordinador eligió.

import { setupTestDatabase, teardownTestDatabase } from '../test-setup';
import { TestDataFactory } from '../test-utils/testDataFactory';
import { RetreatScheduleItem } from '@/entities/retreatScheduleItem.entity';
import { RetreatScheduleService } from '@/services/retreatScheduleService';

describe('RetreatScheduleService.create — ancla la fecha al Día N elegido', () => {
	const getDS = () => TestDataFactory['testDataSource'];
	let service: RetreatScheduleService;

	beforeAll(async () => {
		await setupTestDatabase();
		service = new RetreatScheduleService();
	});

	afterAll(async () => {
		await teardownTestDatabase();
	});

	beforeEach(async () => {
		await getDS().getRepository(RetreatScheduleItem).clear();
	});

	it('reubica al Día 1 (CDMX) un item creado con la fecha de otro día', async () => {
		const ds = getDS();
		const retreat = await TestDataFactory.createTestRetreat({
			timezone: 'America/Mexico_City',
		} as any);
		// Día 1 del retiro = 5-jun-2026. SQL directo para evitar el shift de
		// guardar un JS Date en columna 'date' con runner en CDMX.
		await ds.query(`UPDATE retreat SET startDate = '2026-06-05' WHERE id = ?`, [
			retreat.id,
		]);

		// El coordinador eligió Día 1 + 18:00. El datetime-local mandó la fecha de
		// "hoy" (8-jun): 2026-06-08 18:00 CDMX = 2026-06-09T00:00:00Z.
		const created = await service.create(retreat.id, {
			name: 'Testimonio 1',
			type: 'testimonio',
			day: 1,
			startTime: new Date('2026-06-09T00:00:00.000Z'),
			durationMinutes: 50,
		} as any);

		// Debe anclarse al 5-jun 18:00 CDMX = 2026-06-06T00:00:00Z (NO al 8-jun).
		const iso =
			created.startTime instanceof Date
				? created.startTime.toISOString()
				: new Date(created.startTime).toISOString();
		expect(iso).toBe('2026-06-06T00:00:00.000Z');
		expect(created.day).toBe(1);
		expect(created.durationMinutes).toBe(50);
	});

	it('conserva el offset after-midnight: 00:30 sigue agrupado en Día 1 pero cae en la madrugada siguiente', async () => {
		const ds = getDS();
		const retreat = await TestDataFactory.createTestRetreat({
			timezone: 'America/Mexico_City',
		} as any);
		await ds.query(`UPDATE retreat SET startDate = '2026-06-05' WHERE id = ?`, [
			retreat.id,
		]);

		// 00:30 CDMX = 2026-06-05T06:30:00Z.
		const created = await service.create(retreat.id, {
			name: 'Vigilia',
			type: 'oracion',
			day: 1,
			startTime: new Date('2026-06-05T06:30:00.000Z'),
			durationMinutes: 30,
		} as any);

		// h<6 → cae en la madrugada del 6-jun (00:30 CDMX = 06:30Z) pero sigue Día 1.
		const iso =
			created.startTime instanceof Date
				? created.startTime.toISOString()
				: new Date(created.startTime).toISOString();
		expect(iso).toBe('2026-06-06T06:30:00.000Z');
		expect(created.day).toBe(1);
	});

	it('ancla el Día 2 a la fecha correcta (6-jun)', async () => {
		const ds = getDS();
		const retreat = await TestDataFactory.createTestRetreat({
			timezone: 'America/Mexico_City',
		} as any);
		await ds.query(`UPDATE retreat SET startDate = '2026-06-05' WHERE id = ?`, [
			retreat.id,
		]);

		// 09:00 CDMX = 15:00Z, fecha "hoy" irrelevante.
		const created = await service.create(retreat.id, {
			name: 'Charla mañana',
			type: 'charla',
			day: 2,
			startTime: new Date('2026-06-08T15:00:00.000Z'),
			durationMinutes: 45,
		} as any);

		// Día 2 = 6-jun, 09:00 CDMX = 2026-06-06T15:00:00Z.
		const iso =
			created.startTime instanceof Date
				? created.startTime.toISOString()
				: new Date(created.startTime).toISOString();
		expect(iso).toBe('2026-06-06T15:00:00.000Z');
		expect(created.day).toBe(2);
	});

	it('update: re-ancla cuando cambia el Día (mueve la hora al nuevo día)', async () => {
		const ds = getDS();
		const retreat = await TestDataFactory.createTestRetreat({
			timezone: 'America/Mexico_City',
		} as any);
		await ds.query(`UPDATE retreat SET startDate = '2026-06-05' WHERE id = ?`, [
			retreat.id,
		]);

		const created = await service.create(retreat.id, {
			name: 'Charla',
			type: 'charla',
			day: 1,
			startTime: new Date('2026-06-08T15:00:00.000Z'), // 09:00 CDMX
			durationMinutes: 45,
		} as any);
		// Día 1, 09:00 CDMX = 2026-06-05T15:00:00Z.
		expect(created.startTime.toISOString()).toBe('2026-06-05T15:00:00.000Z');

		// El coordinador la mueve al Día 3 sin tocar la hora.
		const updated = await service.update(created.id, { day: 3 } as any);
		// Día 3 = 7-jun, misma hora de pared 09:00 CDMX = 2026-06-07T15:00:00Z.
		expect(updated!.startTime.toISOString()).toBe('2026-06-07T15:00:00.000Z');
		expect(updated!.day).toBe(3);
	});

	it('update: re-ancla la nueva hora al Día existente (el form manda solo hora)', async () => {
		const ds = getDS();
		const retreat = await TestDataFactory.createTestRetreat({
			timezone: 'America/Mexico_City',
		} as any);
		await ds.query(`UPDATE retreat SET startDate = '2026-06-05' WHERE id = ?`, [
			retreat.id,
		]);

		const created = await service.create(retreat.id, {
			name: 'Charla',
			type: 'charla',
			day: 1,
			startTime: new Date('2026-06-05T15:00:00.000Z'), // 09:00 CDMX
			durationMinutes: 45,
		} as any);

		// El form construye el instante con la fecha de HOY + nueva hora (21:00
		// CDMX = 2026-06-09T03:00:00Z). Debe re-anclarse al Día 1 (5-jun) 21:00.
		const updated = await service.update(created.id, {
			day: 1,
			startTime: new Date('2026-06-09T03:00:00.000Z'),
		} as any);
		expect(updated!.startTime.toISOString()).toBe('2026-06-06T03:00:00.000Z');
		expect(updated!.day).toBe(1);
	});
});
