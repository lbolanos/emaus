import { setupTestDatabase, teardownTestDatabase, clearTestData } from '../test-setup';
import { TestDataFactory } from '../test-utils/testDataFactory';
import { AppDataSource } from '@/data-source';
import { Payment } from '@/entities/payment.entity';
import { Retreat } from '@/entities/retreat.entity';
import { Participant } from '@/entities/participant.entity';
import { User } from '@/entities/user.entity';
import { PaymentController } from '@/controllers/paymentController';
import { authorizationService } from '@/middleware/authorization';

// Respuesta mínima de Express para invocar el controlador sin levantar el router.
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

describe('PaymentController — autorización cross-retiro (hasRetreatAccess)', () => {
	const controller = new PaymentController();
	let retreat: Retreat;
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
		retreat = await TestDataFactory.createTestRetreat();
		participant = await TestDataFactory.createTestParticipant(retreat.id);
	});

	const paymentBody = () => ({
		participantId: participant.id,
		amount: 300,
		paymentDate: '2026-06-01',
		paymentMethod: 'cash',
		retreatId: retreat.id,
	});

	async function createPayment() {
		jest.spyOn(authorizationService, 'hasRetreatAccess').mockResolvedValue(true);
		const req: any = { body: paymentBody(), user: { id: actor.id } };
		const res = mockRes();
		await controller.createPayment(req, res);
		jest.restoreAllMocks();
		return res;
	}

	it('createPayment responde 403 si el usuario no tiene acceso al retiro efectivo', async () => {
		jest.spyOn(authorizationService, 'hasRetreatAccess').mockResolvedValue(false);
		const req: any = { body: paymentBody(), user: { id: actor.id } };
		const res = mockRes();
		await controller.createPayment(req, res);
		expect(res.statusCode).toBe(403);
		expect(
			await AppDataSource.getRepository(Payment).count({ where: { retreatId: retreat.id } }),
		).toBe(0);
	});

	it('createPayment responde 201 con acceso al retiro', async () => {
		const res = await createPayment();
		expect(res.statusCode).toBe(201);
	});

	it('updatePayment responde 403 si el usuario no tiene acceso al retiro del pago', async () => {
		const created = await createPayment();
		jest.spyOn(authorizationService, 'hasRetreatAccess').mockResolvedValue(false);

		const req: any = {
			params: { id: created.body.id },
			body: { amount: 999 },
			user: { id: actor.id },
		};
		const res = mockRes();
		await controller.updatePayment(req, res);
		expect(res.statusCode).toBe(403);
	});

	it('deletePayment responde 403 si el usuario no tiene acceso al retiro del pago', async () => {
		const created = await createPayment();
		jest.spyOn(authorizationService, 'hasRetreatAccess').mockResolvedValue(false);

		const req: any = { params: { id: created.body.id }, user: { id: actor.id } };
		const res = mockRes();
		await controller.deletePayment(req, res);
		expect(res.statusCode).toBe(403);
		// El pago sigue existiendo: el delete fue bloqueado.
		expect(
			await AppDataSource.getRepository(Payment).findOne({ where: { id: created.body.id } }),
		).not.toBeNull();
	});
});
