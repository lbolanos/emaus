import { setupTestDatabase, teardownTestDatabase, clearTestData } from '../test-setup';
import { TestDataFactory } from '../test-utils/testDataFactory';
import { AppDataSource } from '@/data-source';
import { Participant } from '@/entities/participant.entity';
import { Retreat } from '@/entities/retreat.entity';
import { User } from '@/entities/user.entity';
import { CrmController } from '@/controllers/crmController';
import { crmService } from '@/services/crmService';
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
 * IDOR cross-retiro en CRM (cierra el HIGH del review): las rutas validan acceso
 * al :retreatId del path, pero el participantId llega aparte. Verifica que las
 * acciones rechacen participantes ajenos al retiro.
 */
describe('CRM — scope participante↔retiro', () => {
	const controller = new CrmController();
	let retreatA: Retreat;
	let retreatB: Retreat;
	let participantA: Participant; // pertenece a A
	let participantB: Participant; // pertenece a B
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
		// El usuario tiene acceso al retiro (la ruta ya lo valida); lo que probamos
		// es el vínculo participante↔retiro, independiente del acceso al retiro.
		jest.spyOn(authorizationService, 'hasRetreatAccess').mockResolvedValue(true);
		actor = await TestDataFactory.createTestUser();
		retreatA = await TestDataFactory.createTestRetreat();
		retreatB = await TestDataFactory.createTestRetreat();
		participantA = await TestDataFactory.createTestParticipant(retreatA.id);
		participantB = await TestDataFactory.createTestParticipant(retreatB.id);
	});

	describe('participantBelongsToRetreat (helper)', () => {
		it('true para participante del retiro, false para uno ajeno', async () => {
			expect(await crmService.participantBelongsToRetreat(participantA.id, retreatA.id)).toBe(true);
			expect(await crmService.participantBelongsToRetreat(participantB.id, retreatA.id)).toBe(false);
		});
	});

	describe('setDoNotContact', () => {
		it('404 si el participante no pertenece al retiro del path (no muta)', async () => {
			const req: any = {
				params: { retreatId: retreatA.id, participantId: participantB.id },
				body: { value: true },
				user: { id: actor.id },
			};
			const res = mockRes();
			await controller.setDoNotContact(req, res);
			expect(res.statusCode).toBe(404);
			const fresh = await AppDataSource.getRepository(Participant).findOneBy({ id: participantB.id });
			expect(fresh?.doNotContact).toBeFalsy();
		});

		it('200 y muta si el participante pertenece al retiro', async () => {
			const req: any = {
				params: { retreatId: retreatA.id, participantId: participantA.id },
				body: { value: true },
				user: { id: actor.id },
			};
			const res = mockRes();
			await controller.setDoNotContact(req, res);
			expect(res.statusCode).toBe(200);
			expect(res.body.doNotContact).toBe(true);
		});
	});

	describe('createTask', () => {
		it('404 si el participantId del body no pertenece al retiro', async () => {
			const req: any = {
				body: { retreatId: retreatA.id, participantId: participantB.id, title: 'Llamar' },
				user: { id: actor.id },
			};
			const res = mockRes();
			await controller.createTask(req, res);
			expect(res.statusCode).toBe(404);
		});

		it('201 con participante del retiro', async () => {
			const req: any = {
				body: { retreatId: retreatA.id, participantId: participantA.id, title: 'Llamar' },
				user: { id: actor.id },
			};
			const res = mockRes();
			await controller.createTask(req, res);
			expect(res.statusCode).toBe(201);
		});
	});
});
