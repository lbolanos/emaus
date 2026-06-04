/**
 * Integration test (TypeORM real, vía testDataSource) para el campo `totalPaid`
 * que `getReceptionStats` agrega a cada caminante.
 *
 * Verifica que:
 *  - `totalPaid` suma todos los `payments.amount` del participante en el retiro.
 *  - Un caminante sin pagos reporta `totalPaid === 0`.
 *  - Solo se suman pagos del mismo retiro (no se filtran cruzados).
 *  - El campo aparece tanto en `pendingList` como en `arrivedList`.
 */

import { setupTestDatabase, teardownTestDatabase, clearTestData } from '../test-setup';
import { TestDataFactory } from '../test-utils/testDataFactory';
import { Payment } from '@/entities/payment.entity';
import { getReceptionStats, setParticipantCheckIn } from '@/services/participantService';

const getDS = () => (TestDataFactory as any)['testDataSource'];

async function addPayment(retreatId: string, participantId: string, amount: number) {
	const repo = getDS().getRepository(Payment);
	const payment = repo.create({
		participantId,
		retreatId,
		amount,
		paymentDate: new Date('2026-05-01'),
		paymentMethod: 'cash' as const,
	});
	await repo.save(payment);
}

describe('getReceptionStats - totalPaid', () => {
	beforeAll(async () => {
		await setupTestDatabase();
	});

	afterAll(async () => {
		await teardownTestDatabase();
	});

	beforeEach(async () => {
		await clearTestData();
	});

	it('suma todos los pagos del caminante en el retiro', async () => {
		const retreat = await TestDataFactory.createTestRetreat();
		const walker = await TestDataFactory.createTestParticipant(retreat.id, {
			firstName: 'Pagó',
			lastName: 'Dos veces',
		});

		await addPayment(retreat.id, walker.id, 500);
		await addPayment(retreat.id, walker.id, 250.5);

		const stats = await getReceptionStats(retreat.id);
		const entry = stats.pendingList.find((p) => p.participantId === walker.id);

		expect(entry).toBeDefined();
		expect(entry!.totalPaid).toBe(750.5);
	});

	it('reporta totalPaid === 0 cuando el caminante no tiene pagos', async () => {
		const retreat = await TestDataFactory.createTestRetreat();
		const walker = await TestDataFactory.createTestParticipant(retreat.id, {
			firstName: 'Sin',
			lastName: 'Pagos',
		});

		const stats = await getReceptionStats(retreat.id);
		const entry = stats.pendingList.find((p) => p.participantId === walker.id);

		expect(entry).toBeDefined();
		expect(entry!.totalPaid).toBe(0);
	});

	it('no suma pagos de otro retiro al mismo participante', async () => {
		const retreatA = await TestDataFactory.createTestRetreat();
		const retreatB = await TestDataFactory.createTestRetreat();
		const walker = await TestDataFactory.createTestParticipant(retreatA.id, {
			firstName: 'Multi',
			lastName: 'Retiro',
		});

		await addPayment(retreatA.id, walker.id, 300);
		// Pago registrado contra otro retiro: no debe contar en el retiro A.
		await addPayment(retreatB.id, walker.id, 999);

		const stats = await getReceptionStats(retreatA.id);
		const entry = stats.pendingList.find((p) => p.participantId === walker.id);

		expect(entry!.totalPaid).toBe(300);
	});

	it('expone totalPaid también en arrivedList tras el check-in', async () => {
		const retreat = await TestDataFactory.createTestRetreat();
		const walker = await TestDataFactory.createTestParticipant(retreat.id, {
			firstName: 'Ya',
			lastName: 'Llegó',
		});

		await addPayment(retreat.id, walker.id, 1200);
		await setParticipantCheckIn(walker.id, retreat.id, true);

		const stats = await getReceptionStats(retreat.id);
		const entry = stats.arrivedList.find((p) => p.participantId === walker.id);

		expect(entry).toBeDefined();
		expect(entry!.checkedIn).toBe(true);
		expect(entry!.totalPaid).toBe(1200);
	});
});
