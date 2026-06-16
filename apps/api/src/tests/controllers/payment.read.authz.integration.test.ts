import { setupTestDatabase, teardownTestDatabase, clearTestData } from '../test-setup';
import { TestDataFactory } from '../test-utils/testDataFactory';
import { AppDataSource } from '@/data-source';
import { Payment } from '@/entities/payment.entity';
import { Retreat } from '@/entities/retreat.entity';
import { Participant } from '@/entities/participant.entity';
import { User } from '@/entities/user.entity';
import { PaymentController } from '@/controllers/paymentController';
import { authorizationService } from '@/middleware/authorization';

function mockRes() {
	const res: any = { statusCode: 200, body: undefined };
	res.status = (code: number) => {
		res.statusCode = code;
		return res;
	};
	res.json = (body: any) => {
		res.body = body;
		return res;
	};
	return res;
}

/**
 * Autorización de LECTURA de pagos (cierra el HIGH del security review CRM):
 * `payment:read`/`payment:list` son permisos globales; sin scope por retiro un
 * tesorero/coordinador de un retiro podía leer pagos de otros. Los handlers de
 * lectura ahora cortan/filtran por `hasRetreatAccess`.
 */
describe('PaymentController — autorización de LECTURA cross-retiro', () => {
	const controller = new PaymentController();
	let retreatA: Retreat;
	let retreatB: Retreat;
	let participant: Participant;
	let actor: User;

	beforeAll(async () => {
		await setupTestDatabase();
	});
	afterAll(async () => {
		await teardownTestDatabase();
	});

	beforeEach(async () => {
		await clearTestData();
		jest.restoreAllMocks();
		actor = await TestDataFactory.createTestUser();
		retreatA = await TestDataFactory.createTestRetreat();
		retreatB = await TestDataFactory.createTestRetreat();
		participant = await TestDataFactory.createTestParticipant(retreatA.id);
	});

	async function seedPayment(retreatId: string) {
		const repo = AppDataSource.getRepository(Payment);
		const p = repo.create({
			participantId: participant.id,
			retreatId,
			amount: 500,
			paymentDate: new Date('2026-06-01'),
			paymentMethod: 'cash',
			recordedBy: actor.id,
		} as any);
		return repo.save(p);
	}

	// El usuario solo tiene acceso al retiro A.
	function grantOnlyRetreatA() {
		jest
			.spyOn(authorizationService, 'hasRetreatAccess')
			.mockImplementation(async (_uid: string, rid: string) => rid === retreatA.id);
	}

	describe('getAllPayments', () => {
		it('no-superadmin sin retreatId → 400 (no vuelca todo el sistema)', async () => {
			jest.spyOn(authorizationService, 'hasRole').mockResolvedValue(false);
			const req: any = { query: {}, user: { id: actor.id } };
			const res = mockRes();
			await controller.getAllPayments(req, res);
			expect(res.statusCode).toBe(400);
		});

		it('no-superadmin con retreatId sin acceso → 403', async () => {
			jest.spyOn(authorizationService, 'hasRole').mockResolvedValue(false);
			grantOnlyRetreatA();
			const req: any = { query: { retreatId: retreatB.id }, user: { id: actor.id } };
			const res = mockRes();
			await controller.getAllPayments(req, res);
			expect(res.statusCode).toBe(403);
		});

		it('superadmin sin retreatId → 200 (bypass)', async () => {
			jest.spyOn(authorizationService, 'hasRole').mockResolvedValue(true);
			await seedPayment(retreatA.id);
			const req: any = { query: {}, user: { id: actor.id } };
			const res = mockRes();
			await controller.getAllPayments(req, res);
			expect(res.statusCode).toBe(200);
			expect(Array.isArray(res.body)).toBe(true);
		});
	});

	describe('getPaymentById', () => {
		it('responde 403 si el usuario no tiene acceso al retiro del pago', async () => {
			const payment = await seedPayment(retreatB.id);
			grantOnlyRetreatA();
			const req: any = { params: { id: (payment as any).id }, user: { id: actor.id } };
			const res = mockRes();
			await controller.getPaymentById(req, res);
			expect(res.statusCode).toBe(403);
		});

		it('responde 200 con acceso al retiro del pago', async () => {
			const payment = await seedPayment(retreatA.id);
			grantOnlyRetreatA();
			const req: any = { params: { id: (payment as any).id }, user: { id: actor.id } };
			const res = mockRes();
			await controller.getPaymentById(req, res);
			expect(res.statusCode).toBe(200);
		});
	});

	describe('getPaymentsByParticipant', () => {
		it('solo devuelve pagos de retiros accesibles (filtra cross-retiro)', async () => {
			await seedPayment(retreatA.id); // accesible
			await seedPayment(retreatB.id); // NO accesible
			grantOnlyRetreatA();
			const req: any = { params: { participantId: participant.id }, user: { id: actor.id } };
			const res = mockRes();
			await controller.getPaymentsByParticipant(req, res);
			expect(res.statusCode).toBe(200);
			expect(res.body).toHaveLength(1);
			expect(res.body[0].retreatId).toBe(retreatA.id);
		});
	});
});
