/**
 * Integration test (TypeORM real, vía testDataSource) para el filtro de
 * angelitos disponibles en santísimo.
 *
 * Prueba la matriz mealWindow × ignoreAvailability sobre datos persistidos
 * en SQLite, exercising el SQL real de:
 *   - participantAvailabilityService.replaceAll
 *   - participantAvailabilityService.getByParticipants
 *   - listEligibleServersForSlot (vía httpMocks-like invocation)
 */

import { setupTestDatabase, teardownTestDatabase } from '../test-setup';
import { TestDataFactory } from '../test-utils/testDataFactory';
import { SantisimoSlot } from '@/entities/santisimoSlot.entity';
import { ParticipantAvailability } from '@/entities/participantAvailability.entity';
import { participantAvailabilityService } from '@/services/participantAvailabilityService';
import { listEligibleServersForSlot } from '@/controllers/participantAvailabilityController';
import { v4 as uuidv4 } from 'uuid';

const getDS = () => (TestDataFactory as any)['testDataSource'];

// httpMocks ligero — el controller usa req.params/req.query/req.user/res.json/res.status
function mkReqRes(retreatId: string, slotId: string, ignoreAvailability?: boolean) {
	const req: any = {
		params: { retreatId, slotId },
		query: ignoreAvailability ? { ignoreAvailability: 'true' } : {},
		user: { id: 'admin-user-stub' },
	};
	let statusCode = 200;
	let payload: any = null;
	const res: any = {
		status(code: number) {
			statusCode = code;
			return res;
		},
		json(data: any) {
			payload = data;
			return res;
		},
	};
	return { req, res, getStatus: () => statusCode, getPayload: () => payload };
}

// Stub authorization para que checkRetreatAccess pase en tests.
jest.mock('@/middleware/authorization', () => ({
	authorizationService: {
		hasRetreatAccess: async () => true,
	},
}));

describe('listEligibleServersForSlot (integration: real TypeORM)', () => {
	let retreat: any;
	let slotMeal: SantisimoSlot;
	let slotAdore: SantisimoSlot;

	beforeAll(async () => {
		await setupTestDatabase();
	});
	afterAll(async () => {
		await teardownTestDatabase();
	});

	beforeEach(async () => {
		const ds = getDS();
		await ds.getRepository(ParticipantAvailability).clear();
		await ds.getRepository(SantisimoSlot).clear();

		retreat = await TestDataFactory.createTestRetreat({
			startDate: new Date('2026-06-05T00:00:00.000Z'),
			endDate: new Date('2026-06-07T00:00:00.000Z'),
		});

		const slotRepo = ds.getRepository(SantisimoSlot);
		// Slot meal: vie 13:00-14:00 UTC
		slotMeal = await slotRepo.save(
			slotRepo.create({
				id: uuidv4(),
				retreatId: retreat.id,
				startTime: new Date('2026-06-05T13:00:00.000Z'),
				endTime: new Date('2026-06-05T14:00:00.000Z'),
				capacity: 1,
				mealWindow: true,
			}),
		);
		// Slot no-meal: vie 22:00-23:00 UTC
		slotAdore = await slotRepo.save(
			slotRepo.create({
				id: uuidv4(),
				retreatId: retreat.id,
				startTime: new Date('2026-06-05T22:00:00.000Z'),
				endTime: new Date('2026-06-05T23:00:00.000Z'),
				capacity: 1,
				mealWindow: false,
			}),
		);
	});

	it('mealWindow + filter ON: excluye servers regulares y angelitos fuera de horario', async () => {
		const server1 = await TestDataFactory.createTestParticipant(retreat.id, { type: 'server' } as any);
		const angelitoCubre = await TestDataFactory.createTestParticipant(retreat.id, {
			type: 'partial_server',
		} as any);
		const angelitoNoCubre = await TestDataFactory.createTestParticipant(retreat.id, {
			type: 'partial_server',
		} as any);
		const angelitoLegacy = await TestDataFactory.createTestParticipant(retreat.id, {
			type: 'partial_server',
		} as any);

		await participantAvailabilityService.replaceAll(retreat.id, angelitoCubre.id, [
			{ startTime: '2026-06-05T08:00:00.000Z', endTime: '2026-06-05T18:00:00.000Z' },
		]);
		await participantAvailabilityService.replaceAll(retreat.id, angelitoNoCubre.id, [
			{ startTime: '2026-06-06T08:00:00.000Z', endTime: '2026-06-06T18:00:00.000Z' },
		]);
		// angelitoLegacy: 0 bloques

		const { req, res, getPayload } = mkReqRes(retreat.id, slotMeal.id);
		await listEligibleServersForSlot(req, res);
		const ids = (getPayload() as any[]).map((p) => p.id);

		expect(ids).toContain(angelitoCubre.id);
		expect(ids).toContain(angelitoLegacy.id);
		expect(ids).not.toContain(angelitoNoCubre.id);
		expect(ids).not.toContain(server1.id); // server regular excluido en mealWindow
	});

	it('mealWindow + filter OFF (ignoreAvailability=true): incluye TODOS', async () => {
		const server = await TestDataFactory.createTestParticipant(retreat.id, { type: 'server' } as any);
		const angelitoNoCubre = await TestDataFactory.createTestParticipant(retreat.id, {
			type: 'partial_server',
		} as any);
		await participantAvailabilityService.replaceAll(retreat.id, angelitoNoCubre.id, [
			{ startTime: '2026-06-06T08:00:00.000Z', endTime: '2026-06-06T18:00:00.000Z' },
		]);

		const { req, res, getPayload } = mkReqRes(retreat.id, slotMeal.id, true);
		await listEligibleServersForSlot(req, res);
		const ids = (getPayload() as any[]).map((p) => p.id);

		expect(ids).toContain(server.id);
		expect(ids).toContain(angelitoNoCubre.id);
	});

	it('non-mealWindow slot: incluye servers, filtra angelitos por horario (default)', async () => {
		const server = await TestDataFactory.createTestParticipant(retreat.id, { type: 'server' } as any);
		const angelitoNoCubre = await TestDataFactory.createTestParticipant(retreat.id, {
			type: 'partial_server',
		} as any);
		await participantAvailabilityService.replaceAll(retreat.id, angelitoNoCubre.id, [
			{ startTime: '2026-06-05T08:00:00.000Z', endTime: '2026-06-05T12:00:00.000Z' },
		]);

		const { req, res, getPayload } = mkReqRes(retreat.id, slotAdore.id);
		await listEligibleServersForSlot(req, res);
		const ids = (getPayload() as any[]).map((p) => p.id);

		// server siempre pasa
		expect(ids).toContain(server.id);
		// angelito con bloques que NO cubren el slot vie 22-23 → excluido
		expect(ids).not.toContain(angelitoNoCubre.id);
	});

	it('replaceAll rechaza bloques solapados', async () => {
		const angelito = await TestDataFactory.createTestParticipant(retreat.id, {
			type: 'partial_server',
		} as any);
		await expect(
			participantAvailabilityService.replaceAll(retreat.id, angelito.id, [
				{ startTime: '2026-06-05T08:00:00.000Z', endTime: '2026-06-05T14:00:00.000Z' },
				{ startTime: '2026-06-05T12:00:00.000Z', endTime: '2026-06-05T16:00:00.000Z' },
			]),
		).rejects.toThrow(/overlap/i);
	});

	it('replaceAll es idempotente: nuevo set borra el anterior', async () => {
		const angelito = await TestDataFactory.createTestParticipant(retreat.id, {
			type: 'partial_server',
		} as any);

		await participantAvailabilityService.replaceAll(retreat.id, angelito.id, [
			{ startTime: '2026-06-05T08:00:00.000Z', endTime: '2026-06-05T12:00:00.000Z' },
			{ startTime: '2026-06-05T14:00:00.000Z', endTime: '2026-06-05T18:00:00.000Z' },
		]);
		const first = await participantAvailabilityService.getByParticipant(retreat.id, angelito.id);
		expect(first).toHaveLength(2);

		await participantAvailabilityService.replaceAll(retreat.id, angelito.id, [
			{ startTime: '2026-06-06T08:00:00.000Z', endTime: '2026-06-06T18:00:00.000Z' },
		]);
		const second = await participantAvailabilityService.getByParticipant(retreat.id, angelito.id);
		expect(second).toHaveLength(1);
		expect(second[0].startTime.toISOString()).toBe('2026-06-06T08:00:00.000Z');
	});

	it('angelito en mesa (tableId IS NOT NULL) NUNCA aparece, ni con filter OFF', async () => {
		const tables = await TestDataFactory.createTestTables(retreat.id, 1);
		const angelitoEnMesa = await TestDataFactory.createTestParticipant(retreat.id, {
			type: 'partial_server',
			tableId: tables[0].id,
		} as any);

		const { req, res, getPayload } = mkReqRes(retreat.id, slotMeal.id, true);
		await listEligibleServersForSlot(req, res);
		const ids = (getPayload() as any[]).map((p) => p.id);
		expect(ids).not.toContain(angelitoEnMesa.id);
	});
});
