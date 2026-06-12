import { setupTestDatabase, teardownTestDatabase, clearTestData } from '../test-setup';
import { TestDataFactory } from '../test-utils/testDataFactory';
import { Retreat } from '@/entities/retreat.entity';
import { Participant } from '@/entities/participant.entity';
import { User } from '@/entities/user.entity';
import { ParticipantDebtController } from '@/controllers/participantDebtController';
import { authorizationService } from '@/middleware/authorization';
import { auditContext } from '@/utils/auditContext';

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
 * Reglas de negocio del ParticipantDebtController (cobros adicionales):
 *  - Solo servidores y angelitos pueden recibir deudas.
 *  - El concepto (description) es obligatorio al crear y al actualizar.
 *  - retreatId se infiere del participante si no viene en el body.
 */
describe('ParticipantDebtController — reglas de negocio', () => {
	const controller = new ParticipantDebtController();
	let retreat: Retreat;
	let actor: User;
	let server: Participant;
	let angelito: Participant;
	let walker: Participant;

	beforeAll(async () => {
		await setupTestDatabase();
	});

	afterAll(async () => {
		await teardownTestDatabase();
	});

	beforeEach(async () => {
		await clearTestData();
		jest.restoreAllMocks();
		// Estas pruebas cubren reglas de negocio, no autorización: se mockea el
		// acceso al retiro (la autorización se prueba en participantDebt.audit.integration).
		jest.spyOn(authorizationService, 'hasRetreatAccess').mockResolvedValue(true);
		actor = await TestDataFactory.createTestUser();
		retreat = await TestDataFactory.createTestRetreat();
		server = await TestDataFactory.createTestParticipant(retreat.id, { type: 'server' } as any);
		angelito = await TestDataFactory.createTestParticipant(retreat.id, {
			type: 'partial_server',
		} as any);
		walker = await TestDataFactory.createTestParticipant(retreat.id, { type: 'walker' } as any);
	});

	const createDebt = async (body: Record<string, any>) => {
		const req: any = { body, user: { id: actor.id } };
		const res = mockRes();
		await auditContext.run({ userId: actor.id, ip: '10.0.0.5' }, async () => {
			await controller.createDebt(req, res);
		});
		return res;
	};

	it('crea una deuda para un servidor (201)', async () => {
		const res = await createDebt({
			participantId: server.id,
			amount: 200,
			description: 'Camiseta extra',
			retreatId: retreat.id,
		});
		expect(res.statusCode).toBe(201);
		expect(Number(res.body.amount)).toBe(200);
		expect(res.body.description).toBe('Camiseta extra');
	});

	it('crea una deuda para un angelito (201)', async () => {
		const res = await createDebt({
			participantId: angelito.id,
			amount: 150,
			description: 'Comida extra',
			retreatId: retreat.id,
		});
		expect(res.statusCode).toBe(201);
	});

	it('rechaza una deuda para un caminante (400)', async () => {
		const res = await createDebt({
			participantId: walker.id,
			amount: 200,
			description: 'No permitido',
			retreatId: retreat.id,
		});
		expect(res.statusCode).toBe(400);
		expect(res.body.message).toMatch(/servidores o angelitos/i);
	});

	it('exige concepto al crear (400 si falta)', async () => {
		const res = await createDebt({
			participantId: server.id,
			amount: 200,
			retreatId: retreat.id,
		});
		expect(res.statusCode).toBe(400);
		expect(res.body.message).toMatch(/concepto/i);
	});

	it('exige concepto no vacío al crear (400 si es espacios)', async () => {
		const res = await createDebt({
			participantId: server.id,
			amount: 200,
			description: '   ',
			retreatId: retreat.id,
		});
		expect(res.statusCode).toBe(400);
	});

	it('infiere el retiro del participante si no viene retreatId', async () => {
		const res = await createDebt({
			participantId: server.id,
			amount: 99,
			description: 'Sin retreatId explícito',
		});
		expect(res.statusCode).toBe(201);
		expect(res.body.retreatId).toBe(retreat.id);
	});

	it('rechaza actualizar con concepto vacío (400)', async () => {
		const created = await createDebt({
			participantId: server.id,
			amount: 200,
			description: 'Original',
			retreatId: retreat.id,
		});
		const debtId = created.body.id;

		const req: any = { params: { id: debtId }, body: { description: '' }, user: { id: actor.id } };
		const res = mockRes();
		await auditContext.run({ userId: actor.id }, async () => {
			await controller.updateDebt(req, res);
		});
		expect(res.statusCode).toBe(400);
		expect(res.body.message).toMatch(/concepto/i);
	});
});
