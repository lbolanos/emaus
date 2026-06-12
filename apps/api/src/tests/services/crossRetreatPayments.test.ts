import { setupTestDatabase, teardownTestDatabase, clearTestData } from '../test-setup';
import { TestDataFactory } from '../test-utils/testDataFactory';
import { AppDataSource } from '@/data-source';
import { Payment } from '@/entities/payment.entity';
import { ParticipantDebt } from '@/entities/participantDebt.entity';
import { RetreatParticipant } from '@/entities/retreatParticipant.entity';
import { Retreat } from '@/entities/retreat.entity';
import * as participantService from '@/services/participantService';

/**
 * Bug 2026-06-10: un pago/deuda registrado en un retiro aparecía sumado en TODOS
 * los retiros del participante (los participantes son globales y multi-retiro):
 *  - la relación debts no estaba scoped al retiro en findAllParticipants;
 *  - findParticipantById cargaba payments/debts de todos los retiros;
 *  - computeCharges usaba participant.retreat (primario), no el de contexto.
 * Estos tests fijan el comportamiento per-retiro de findParticipantById.
 * (findAllParticipants usa createQueryBuilder con la clase decorada, que el
 * harness de tests no soporta — se verificó vía API real.)
 */
describe('Paz y salvo per-retiro — pagos/deudas no cruzan retiros', () => {
	beforeAll(async () => {
		await setupTestDatabase();
	});

	afterAll(async () => {
		await teardownTestDatabase();
	});

	beforeEach(async () => {
		await clearTestData();
	});

	const setupTwoRetreats = async () => {
		const retreatA = await TestDataFactory.createTestRetreat();
		const retreatB = await TestDataFactory.createTestRetreat();
		const p = await TestDataFactory.createTestParticipant(retreatA.id, {
			type: 'server',
		} as any);
		// Inscribirlo también en B (multi-retiro)
		await AppDataSource.getRepository(RetreatParticipant).save({
			participantId: p.id,
			retreatId: retreatB.id,
			roleInRetreat: 'server',
			type: 'server',
		});
		// Pago y deuda SOLO en A
		await AppDataSource.getRepository(Payment).save({
			participantId: p.id,
			retreatId: retreatA.id,
			amount: 500,
			paymentDate: new Date(),
			paymentMethod: 'cash',
		});
		await AppDataSource.getRepository(ParticipantDebt).save({
			participantId: p.id,
			retreatId: retreatA.id,
			amount: 200,
			description: 'Tamal',
		});
		return { retreatA, retreatB, p };
	};

	it('findParticipantById con contexto A incluye el pago y la deuda de A', async () => {
		const { retreatA, p } = await setupTwoRetreats();
		const inA = await participantService.findParticipantById(p.id, true, retreatA.id);
		expect(inA!.totalPaid).toBe(500);
		expect(inA!.totalDebt).toBe(200);
	});

	it('findParticipantById con contexto B NO ve el pago ni la deuda de A', async () => {
		const { retreatB, p } = await setupTwoRetreats();
		const inB = await participantService.findParticipantById(p.id, true, retreatB.id);
		expect(inB!.totalPaid).toBe(0);
		expect(inB!.totalDebt).toBe(0);
		expect(inB!.chargeBreakdown.debts).toBe(0);
	});

	it('el monto esperado usa el retiro de contexto, no el primario', async () => {
		const { retreatA, retreatB, p } = await setupTwoRetreats();
		// Cobros distintos por retiro (server usa serverFeeAmount)
		await AppDataSource.getRepository(Retreat).update(retreatA.id, {
			serverFeeAmount: 1000,
		} as any);
		await AppDataSource.getRepository(Retreat).update(retreatB.id, {
			serverFeeAmount: 9999,
		} as any);

		const inB = await participantService.findParticipantById(p.id, true, retreatB.id);
		// El participante primario apunta a A, pero el contexto es B → 9999.
		expect(inB!.retreat!.id).toBe(retreatB.id);
		expect(inB!.chargeBreakdown.retreatFee).toBe(9999);
	});
});
