import { setupTestDatabase, teardownTestDatabase, clearTestData } from '../test-setup';
import { TestDataFactory } from '../test-utils/testDataFactory';
import { AppDataSource } from '@/data-source';
import { ParticipantDebt } from '@/entities/participantDebt.entity';
import { Retreat } from '@/entities/retreat.entity';
import { Participant } from '@/entities/participant.entity';
import { User } from '@/entities/user.entity';
import { ParticipantDebtController } from '@/controllers/participantDebtController';
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
 * Autorización de LECTURA de deudas por participante (cierra el HIGH del review):
 * la ruta exige `payment:read` (global); el handler debe filtrar a los retiros
 * accesibles para no exponer deudas de otros retiros.
 */
describe('ParticipantDebtController — LECTURA por participante cross-retiro', () => {
	const controller = new ParticipantDebtController();
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
		participant = await TestDataFactory.createTestParticipant(retreatA.id, { type: 'server' } as any);
	});

	async function seedDebt(retreatId: string, amount: number) {
		const repo = AppDataSource.getRepository(ParticipantDebt);
		const d = repo.create({
			participantId: participant.id,
			retreatId,
			amount,
			description: 'Camiseta extra',
			recordedBy: actor.id,
		} as any);
		return repo.save(d);
	}

	it('solo devuelve deudas de retiros accesibles', async () => {
		await seedDebt(retreatA.id, 100); // accesible
		await seedDebt(retreatB.id, 999); // NO accesible
		jest
			.spyOn(authorizationService, 'hasRetreatAccess')
			.mockImplementation(async (_uid: string, rid: string) => rid === retreatA.id);

		const req: any = { params: { participantId: participant.id }, user: { id: actor.id } };
		const res = mockRes();
		await controller.getDebtsByParticipant(req, res);

		expect(res.statusCode).toBe(200);
		expect(res.body).toHaveLength(1);
		expect(res.body[0].retreatId).toBe(retreatA.id);
		expect(Number(res.body[0].amount)).toBe(100);
	});

	it('devuelve lista vacía si no hay acceso a ningún retiro', async () => {
		await seedDebt(retreatA.id, 100);
		await seedDebt(retreatB.id, 999);
		jest.spyOn(authorizationService, 'hasRetreatAccess').mockResolvedValue(false);

		const req: any = { params: { participantId: participant.id }, user: { id: actor.id } };
		const res = mockRes();
		await controller.getDebtsByParticipant(req, res);

		expect(res.statusCode).toBe(200);
		expect(res.body).toHaveLength(0);
	});
});
