/**
 * Authorization regression tests for ParticipantCommunicationController.
 *
 * The route file gates POST/DELETE/email-send with
 * `requirePermission('participant:update')`, but that's a GLOBAL permission
 * — having it for one retreat doesn't entitle you to act on another. The
 * controller now adds a per-retreat check (`callerHasRetreatAccess`) so a
 * coordinator of retreat A cannot read history, create records or abuse
 * the SMTP server for retreat B.
 */
import { setupTestDatabase, teardownTestDatabase, clearTestData } from '../test-setup';
import { TestDataFactory } from '../test-utils/testDataFactory';
import { createMockRequest, createMockResponse } from '../test-utils/authTestUtils';
import { User } from '@/entities/user.entity';

describe('ParticipantCommunicationController — authorization', () => {
	let ParticipantCommunicationController: any;
	let owner: User;
	let outsider: User;
	let retreatA: any;
	let retreatB: any;
	let participantA: any;

	beforeAll(async () => {
		await setupTestDatabase();
		const mod = await import('@/controllers/participantCommunicationController');
		ParticipantCommunicationController = new mod.ParticipantCommunicationController();
	});

	afterAll(async () => {
		await teardownTestDatabase();
	});

	beforeEach(async () => {
		await clearTestData();
		owner = await TestDataFactory.createTestUser();
		outsider = await TestDataFactory.createTestUser();
		retreatA = await TestDataFactory.createTestRetreat();
		retreatB = await TestDataFactory.createTestRetreat();
		participantA = await TestDataFactory.createTestParticipant(retreatA.id);

		// Give `owner` access to retreatA, but NOT to retreatB.
		const { UserRetreat } = await import('@/entities/userRetreat.entity');
		const userRetreatRepo = TestDataFactory.getDataSource().getRepository(UserRetreat);
		const role = await TestDataFactory.createTestRole({
			name: `coordinator-${Date.now()}`,
		});
		await userRetreatRepo.save({ userId: owner.id, retreatId: retreatA.id, roleId: role.id });
	});

	it('getParticipantCommunications: 403 when caller lacks retreat access', async () => {
		const req = createMockRequest(outsider, {}, { participantId: participantA.id });
		(req as any).query = { retreatId: retreatA.id };
		const res = createMockResponse();

		await ParticipantCommunicationController.getParticipantCommunications(req, res);

		expect(res.status).toHaveBeenCalledWith(403);
	});

	it('createCommunication: 403 when caller has access to a different retreat', async () => {
		// owner has access to retreatA but body says retreatB.
		const req = createMockRequest(owner, {
			participantId: participantA.id,
			retreatId: retreatB.id,
			messageType: 'whatsapp',
			recipientContact: '+50212345678',
			messageContent: 'cross-retreat write',
		});
		const res = createMockResponse();

		await ParticipantCommunicationController.createCommunication(req, res);

		expect(res.status).toHaveBeenCalledWith(403);
	});

	it('createCommunication: 400 when participant does not belong to the claimed retreat', async () => {
		// owner has access to retreatA. Participant belongs to retreatA, body
		// says retreatB. Even if the caller had access to retreatB, the
		// participant/retreat mismatch must be rejected.
		// Give owner access to retreatB too for this scenario.
		const { UserRetreat } = await import('@/entities/userRetreat.entity');
		const userRetreatRepo = TestDataFactory.getDataSource().getRepository(UserRetreat);
		const role = await TestDataFactory.createTestRole({
			name: `coord-b-${Date.now()}`,
		});
		await userRetreatRepo.save({ userId: owner.id, retreatId: retreatB.id, roleId: role.id });

		const req = createMockRequest(owner, {
			participantId: participantA.id, // belongs to retreatA
			retreatId: retreatB.id,
			messageType: 'whatsapp',
			recipientContact: '+50212345678',
			messageContent: 'mismatched retreat',
		});
		const res = createMockResponse();

		await ParticipantCommunicationController.createCommunication(req, res);

		expect(res.status).toHaveBeenCalledWith(400);
	});

	it('sendEmailViaBackend: 403 prevents SMTP abuse from outsiders', async () => {
		const emailServiceMock = { sendEmail: jest.fn().mockResolvedValue(true) };
		(ParticipantCommunicationController as any).emailService = emailServiceMock;

		const req = createMockRequest(outsider, {
			to: 'victim@example.com',
			subject: 'Phish',
			html: '<p>...</p>',
			participantId: participantA.id,
			retreatId: retreatA.id,
		});
		const res = createMockResponse();

		await ParticipantCommunicationController.sendEmailViaBackend(req, res);

		expect(res.status).toHaveBeenCalledWith(403);
		expect(emailServiceMock.sendEmail).not.toHaveBeenCalled();
	});

	it('deleteCommunication: 403 when caller lacks access to the record retreat', async () => {
		// Owner creates a record in retreatA
		const createReq = createMockRequest(owner, {
			participantId: participantA.id,
			retreatId: retreatA.id,
			messageType: 'whatsapp',
			recipientContact: '+50212345678',
			messageContent: 'hello',
		});
		const createRes = createMockResponse();
		await ParticipantCommunicationController.createCommunication(createReq, createRes);
		const recordId = createRes.json.mock.calls[0][0].id;

		// Outsider tries to delete it
		const req = createMockRequest(outsider, {}, { id: recordId });
		const res = createMockResponse();
		await ParticipantCommunicationController.deleteCommunication(req, res);

		expect(res.status).toHaveBeenCalledWith(403);
	});

	it('createCommunication: 201 when caller has access AND participant belongs to retreat', async () => {
		const req = createMockRequest(owner, {
			participantId: participantA.id,
			retreatId: retreatA.id,
			messageType: 'whatsapp',
			recipientContact: '+50212345678',
			messageContent: 'legitimate message',
		});
		const res = createMockResponse();

		await ParticipantCommunicationController.createCommunication(req, res);

		expect(res.status).toHaveBeenCalledWith(201);
	});
});
