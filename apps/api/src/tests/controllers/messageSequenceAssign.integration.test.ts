import { setupTestDatabase, teardownTestDatabase, clearTestData } from '../test-setup';
import { TestDataFactory } from '../test-utils/testDataFactory';
import { AppDataSource } from '@/data-source';
import { ScheduledMessage } from '@/entities/scheduledMessage.entity';
import { MessageSequenceController } from '@/controllers/messageSequenceController';
import { messageSequenceService } from '@/services/messageSequenceService';
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
 * L1 del security review: `assign` no debe (a) mutar antes de autorizar al
 * llamante, ni (b) aceptar un `userId` responsable sin acceso al retiro.
 */
describe('MessageSequenceController.assign — autorización', () => {
	const controller = new MessageSequenceController();
	const CALLER = 'caller-user-id';
	const OUTSIDER = 'outsider-user-id';
	let retreatId: string;
	let smId: string;

	beforeAll(async () => {
		await setupTestDatabase();
	});
	afterAll(async () => {
		await teardownTestDatabase();
	});

	beforeEach(async () => {
		await clearTestData();
		jest.restoreAllMocks();
		const retreat = await TestDataFactory.createTestRetreat();
		retreatId = retreat.id;
		const participant = await TestDataFactory.createTestParticipant(retreatId, { type: 'walker' } as any);
		const seq = await messageSequenceService.createSequence({
			name: 'S',
			retreatId,
			trigger: 'participant_created',
			audience: 'walker',
			steps: [
				{ stepOrder: 0, offsetDays: 0, sendHour: 9, templateType: 'WALKER_WELCOME', channel: 'email' } as any,
			],
		});
		const smRepo = AppDataSource.getRepository(ScheduledMessage);
		const sm = await smRepo.save(
			smRepo.create({
				sequenceId: seq.id,
				stepId: seq.steps![0].id,
				participantId: participant.id,
				retreatId,
				channel: 'email',
				templateType: 'WALKER_WELCOME',
				scheduledFor: new Date(),
				status: 'pending',
			}),
		);
		smId = sm.id;
	});

	const call = async (userId: string | null) => {
		const req: any = { params: { id: smId }, body: { userId }, user: { id: CALLER } };
		const res = mockRes();
		await controller.assign(req, res);
		return res;
	};

	it('403 si el llamante no tiene acceso al retiro (y no muta)', async () => {
		jest.spyOn(authorizationService, 'hasRetreatAccess').mockResolvedValue(false);
		const res = await call(CALLER);
		expect(res.statusCode).toBe(403);
		const sm = await AppDataSource.getRepository(ScheduledMessage).findOneBy({ id: smId });
		expect(sm?.assignedTo).toBeFalsy();
	});

	it('400 si el userId asignado no tiene acceso al retiro', async () => {
		jest
			.spyOn(authorizationService, 'hasRetreatAccess')
			.mockImplementation(async (uid: string) => uid === CALLER);
		const res = await call(OUTSIDER);
		expect(res.statusCode).toBe(400);
		const sm = await AppDataSource.getRepository(ScheduledMessage).findOneBy({ id: smId });
		expect(sm?.assignedTo).toBeFalsy();
	});

	it('200 al desasignar (userId null) con acceso del llamante', async () => {
		jest.spyOn(authorizationService, 'hasRetreatAccess').mockResolvedValue(true);
		const res = await call(null);
		expect(res.statusCode).toBe(200);
	});

	it('200 al asignar un userId con acceso al retiro', async () => {
		jest.spyOn(authorizationService, 'hasRetreatAccess').mockResolvedValue(true);
		const res = await call(CALLER);
		expect(res.statusCode).toBe(200);
		const sm = await AppDataSource.getRepository(ScheduledMessage).findOneBy({ id: smId });
		expect(sm?.assignedTo).toBe(CALLER);
	});
});
