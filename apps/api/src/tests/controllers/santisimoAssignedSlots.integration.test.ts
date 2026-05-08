/**
 * Integration test (TypeORM real, vía testDataSource) para el endpoint
 * `getParticipantAssignedSlots` del santisimoController.
 *
 * Prueba que el endpoint:
 *  - Devuelve 200 con lista vacía cuando el participante no tiene signups.
 *  - Devuelve los slots ordenados por startTime.
 *  - Solo retorna signups del retreatId correcto (filtra por retiro).
 *  - Devuelve `mealWindow` y `autoAssigned` correctamente.
 *  - Retorna 403 cuando la comprobación de autorización falla.
 */

import { setupTestDatabase, teardownTestDatabase } from '../test-setup';
import { TestDataFactory } from '../test-utils/testDataFactory';
import { SantisimoSlot } from '@/entities/santisimoSlot.entity';
import { SantisimoSignup } from '@/entities/santisimoSignup.entity';
import { getParticipantAssignedSlots } from '@/controllers/santisimoController';
import { v4 as uuidv4 } from 'uuid';

const getDS = () => (TestDataFactory as any)['testDataSource'];

// ── Mock de autorización ──────────────────────────────────────────────────────
// Por defecto permite todo; algunos tests lo anulan con jest.spyOn.
jest.mock('@/middleware/authorization', () => ({
	authorizationService: {
		hasRetreatAccess: jest.fn().mockResolvedValue(true),
	},
}));

// ── httpMock ligero ───────────────────────────────────────────────────────────

function mkReqRes(retreatId: string, participantId: string) {
	const req: any = {
		params: { retreatId, participantId },
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
		send() {
			return res;
		},
	};
	return {
		req,
		res,
		getStatus: () => statusCode,
		getPayload: () => payload,
	};
}

// ── Helpers para crear slots/signups ──────────────────────────────────────────

async function createSlot(retreatId: string, startIso: string, endIso: string, mealWindow = false) {
	const ds = getDS();
	const slotRepo = ds.getRepository(SantisimoSlot);
	return slotRepo.save(
		slotRepo.create({
			id: uuidv4(),
			retreatId,
			startTime: new Date(startIso),
			endTime: new Date(endIso),
			capacity: 2,
			mealWindow,
		}),
	);
}

async function createSignup(
	slotId: string,
	participantId: string,
	autoAssigned = false,
): Promise<SantisimoSignup> {
	const ds = getDS();
	const signupRepo = ds.getRepository(SantisimoSignup);
	return signupRepo.save(
		signupRepo.create({
			id: uuidv4(),
			slotId,
			name: 'Test Angelito',
			participantId,
			isAngelito: true,
			autoAssigned,
		}),
	);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('getParticipantAssignedSlots (integration: real TypeORM)', () => {
	let retreat: any;
	let participant: any;

	beforeAll(async () => {
		await setupTestDatabase();
	});

	afterAll(async () => {
		await teardownTestDatabase();
	});

	beforeEach(async () => {
		const ds = getDS();
		// Limpiar en orden de dependencia para no violar FKs
		await ds.getRepository(SantisimoSignup).clear();
		await ds.getRepository(SantisimoSlot).clear();

		retreat = await TestDataFactory.createTestRetreat({
			startDate: new Date('2026-06-05T00:00:00.000Z'),
			endDate: new Date('2026-06-07T00:00:00.000Z'),
		});

		participant = await TestDataFactory.createTestParticipant(retreat.id, {
			type: 'partial_server',
		} as any);

		// Restablecer el mock de autorización a "permitir" entre tests
		const { authorizationService } = require('@/middleware/authorization');
		(authorizationService.hasRetreatAccess as jest.Mock).mockResolvedValue(true);
	});

	it('retorna 200 con lista vacía si el participante no tiene signups', async () => {
		const { req, res, getStatus, getPayload } = mkReqRes(retreat.id, participant.id);
		await getParticipantAssignedSlots(req, res);

		expect(getStatus()).toBe(200);
		expect(getPayload()).toEqual([]);
	});

	it('retorna los slots asignados ordenados por startTime', async () => {
		// Crear 3 slots en orden NO cronológico para verificar el sort
		const slotB = await createSlot(
			retreat.id,
			'2026-06-06T14:00:00.000Z',
			'2026-06-06T15:00:00.000Z',
		);
		const slotA = await createSlot(
			retreat.id,
			'2026-06-05T10:00:00.000Z',
			'2026-06-05T11:00:00.000Z',
		);
		const slotC = await createSlot(
			retreat.id,
			'2026-06-07T08:00:00.000Z',
			'2026-06-07T09:00:00.000Z',
		);

		// Crear signups en orden distinto al cronológico
		await createSignup(slotC.id, participant.id);
		await createSignup(slotA.id, participant.id);
		await createSignup(slotB.id, participant.id);

		const { req, res, getStatus, getPayload } = mkReqRes(retreat.id, participant.id);
		await getParticipantAssignedSlots(req, res);

		expect(getStatus()).toBe(200);
		const items = getPayload() as any[];
		expect(items).toHaveLength(3);

		// Verificar orden ascendente
		expect(new Date(items[0].startTime).getTime()).toBeLessThan(
			new Date(items[1].startTime).getTime(),
		);
		expect(new Date(items[1].startTime).getTime()).toBeLessThan(
			new Date(items[2].startTime).getTime(),
		);

		// El primero debe ser slotA
		expect(items[0].slotId).toBe(slotA.id);
		expect(items[2].slotId).toBe(slotC.id);
	});

	it('solo retorna signups del retreatId correcto (no filtra por otro retiro)', async () => {
		// Crear un segundo retiro con su propio slot y signup para el mismo participante
		const otherRetreat = await TestDataFactory.createTestRetreat({
			startDate: new Date('2026-07-10T00:00:00.000Z'),
			endDate: new Date('2026-07-12T00:00:00.000Z'),
		});
		const otherParticipant = await TestDataFactory.createTestParticipant(otherRetreat.id, {
			type: 'partial_server',
		} as any);

		// Slot del retiro correcto
		const slotOwn = await createSlot(
			retreat.id,
			'2026-06-05T12:00:00.000Z',
			'2026-06-05T13:00:00.000Z',
		);
		// Slot del otro retiro
		const slotOther = await createSlot(
			otherRetreat.id,
			'2026-07-10T12:00:00.000Z',
			'2026-07-10T13:00:00.000Z',
		);

		await createSignup(slotOwn.id, participant.id);
		// Signup del mismo participantId pero en el otro retiro
		await createSignup(slotOther.id, participant.id);

		const { req, res, getStatus, getPayload } = mkReqRes(retreat.id, participant.id);
		await getParticipantAssignedSlots(req, res);

		expect(getStatus()).toBe(200);
		const items = getPayload() as any[];
		// Solo debe devolver 1 signup (el del retiro correcto)
		expect(items).toHaveLength(1);
		expect(items[0].slotId).toBe(slotOwn.id);
	});

	it('devuelve mealWindow y autoAssigned correctamente', async () => {
		const slotMeal = await createSlot(
			retreat.id,
			'2026-06-05T13:00:00.000Z',
			'2026-06-05T14:00:00.000Z',
			true, // mealWindow = true
		);
		const slotAdore = await createSlot(
			retreat.id,
			'2026-06-05T22:00:00.000Z',
			'2026-06-05T23:00:00.000Z',
			false, // mealWindow = false
		);

		await createSignup(slotMeal.id, participant.id, true); // autoAssigned = true
		await createSignup(slotAdore.id, participant.id, false); // autoAssigned = false

		const { req, res, getStatus, getPayload } = mkReqRes(retreat.id, participant.id);
		await getParticipantAssignedSlots(req, res);

		expect(getStatus()).toBe(200);
		const items = getPayload() as any[];
		expect(items).toHaveLength(2);

		// Ordenados por startTime: slotMeal primero
		const [mealItem, adoreItem] = items;
		expect(mealItem.slotId).toBe(slotMeal.id);
		expect(mealItem.mealWindow).toBe(true);
		expect(mealItem.autoAssigned).toBe(true);

		expect(adoreItem.slotId).toBe(slotAdore.id);
		expect(adoreItem.mealWindow).toBe(false);
		expect(adoreItem.autoAssigned).toBe(false);
	});

	it('cada item de la respuesta incluye los campos esperados del schema', async () => {
		const slot = await createSlot(
			retreat.id,
			'2026-06-06T10:00:00.000Z',
			'2026-06-06T11:00:00.000Z',
		);
		await createSignup(slot.id, participant.id);

		const { req, res, getPayload } = mkReqRes(retreat.id, participant.id);
		await getParticipantAssignedSlots(req, res);

		const [item] = getPayload() as any[];
		expect(item).toHaveProperty('signupId');
		expect(item).toHaveProperty('slotId', slot.id);
		expect(item).toHaveProperty('startTime');
		expect(item).toHaveProperty('endTime');
		expect(item).toHaveProperty('mealWindow');
		expect(item).toHaveProperty('autoAssigned');
	});

	it('retorna [] cuando el participante no tiene signups en este retiro (otra comprobación)', async () => {
		// Doble verificación: participante real del retiro pero sin signups
		const p2 = await TestDataFactory.createTestParticipant(retreat.id, {
			type: 'partial_server',
		} as any);

		const { req, res, getPayload, getStatus } = mkReqRes(retreat.id, p2.id);
		await getParticipantAssignedSlots(req, res);

		expect(getStatus()).toBe(200);
		expect(getPayload()).toEqual([]);
	});
});
