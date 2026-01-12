import { setupTestDatabase, teardownTestDatabase, clearTestData } from '../test-setup';
import { TestDataFactory } from '../test-utils/testDataFactory';
import { createMockRequest, createMockResponse } from '../test-utils/authTestUtils';
import { User } from '@/entities/user.entity';
import { Community } from '@/entities/community.entity';
import { Participant } from '@/entities/participant.entity';
import { MessageTemplate } from '@/entities/messageTemplate.entity';

describe('CommunityCommunicationController', () => {
	let testUser: User;
	let testCommunity: Community;
	let testRetreat: any;
	let testParticipant: Participant;
	let testMember: any;
	let CommunityCommunicationController: any;

	beforeAll(async () => {
		await setupTestDatabase();
		// Import controller AFTER database setup so service uses test data source
		const module = await import('@/controllers/communityCommunicationController');
		CommunityCommunicationController = new module.CommunityCommunicationController();
	});

	afterAll(async () => {
		await teardownTestDatabase();
	});

	beforeEach(async () => {
		await clearTestData();
		testUser = await TestDataFactory.createTestUser();
		testCommunity = await TestDataFactory.createTestCommunity(testUser.id);
		testRetreat = await TestDataFactory.createTestRetreat();
		testParticipant = await TestDataFactory.createTestParticipant(testRetreat.id);
		testMember = await TestDataFactory.createTestCommunityMember(
			testCommunity.id,
			testParticipant.id,
		);
	});

	describe('getMemberCommunications', () => {
		it('should get communications for a community member', async () => {
			// First create a communication
			const createReq = createMockRequest(
				testUser,
				{
					communityMemberId: testMember.id,
					communityId: testCommunity.id,
					messageType: 'email',
					recipientContact: 'test@example.com',
					messageContent: 'Test message content',
				},
				{},
			);
			const createRes = createMockResponse();
			await CommunityCommunicationController.createCommunication(createReq, createRes);

			// Now get the communications
			const req = createMockRequest(
				testUser,
				{},
				{ memberId: testMember.id },
				{ communityId: testCommunity.id },
			);
			const reqWithQuery = { ...req, query: { communityId: testCommunity.id } };
			const res = createMockResponse();

			await CommunityCommunicationController.getMemberCommunications(reqWithQuery, res);

			expect(res.json).toHaveBeenCalled();
			const response = res.json.mock.calls[0][0];
			expect(response.communications).toBeDefined();
			expect(Array.isArray(response.communications)).toBe(true);
		});

		it('should return 404 for non-existent member', async () => {
			const req = createMockRequest(
				testUser,
				{},
				{ memberId: 'non-existent-member' },
				{ communityId: testCommunity.id },
			);
			const reqWithQuery = { ...req, query: { communityId: testCommunity.id } };
			const res = createMockResponse();

			await CommunityCommunicationController.getMemberCommunications(reqWithQuery, res);

			expect(res.status).toHaveBeenCalledWith(404);
			expect(res.json).toHaveBeenCalledWith({
				error: 'Miembro de comunidad no encontrado',
			});
		});

		it('should support pagination', async () => {
			const req = createMockRequest(
				testUser,
				{},
				{ memberId: testMember.id },
				{ communityId: testCommunity.id, limit: '10', offset: '0' },
			);
			const reqWithQuery = {
				...req,
				query: { communityId: testCommunity.id, limit: '10', offset: '0' },
			};
			const res = createMockResponse();

			await CommunityCommunicationController.getMemberCommunications(reqWithQuery, res);

			expect(res.json).toHaveBeenCalled();
			const response = res.json.mock.calls[0][0];
			expect(response.limit).toBe(10);
			expect(response.offset).toBe(0);
		});
	});

	describe('getCommunityCommunications', () => {
		it('should get all communications for a community', async () => {
			const req = createMockRequest(testUser, {}, { communityId: testCommunity.id });
			const reqWithQuery = { ...req, query: {} };
			const res = createMockResponse();

			await CommunityCommunicationController.getCommunityCommunications(reqWithQuery, res);

			expect(res.json).toHaveBeenCalled();
			const response = res.json.mock.calls[0][0];
			expect(response.communications).toBeDefined();
			expect(Array.isArray(response.communications)).toBe(true);
		});

		it('should filter by message type', async () => {
			const req = createMockRequest(testUser, {}, { communityId: testCommunity.id });
			const reqWithQuery = { ...req, query: { messageType: 'email' } };
			const res = createMockResponse();

			await CommunityCommunicationController.getCommunityCommunications(reqWithQuery, res);

			expect(res.json).toHaveBeenCalled();
		});

		it('should filter by member', async () => {
			const req = createMockRequest(testUser, {}, { communityId: testCommunity.id });
			const reqWithQuery = { ...req, query: { memberId: testParticipant.id } };
			const res = createMockResponse();

			await CommunityCommunicationController.getCommunityCommunications(reqWithQuery, res);

			expect(res.json).toHaveBeenCalled();
		});
	});

	describe('createCommunication', () => {
		it('should create a new communication record', async () => {
			const req = createMockRequest(testUser, {
				communityMemberId: testMember.id,
				communityId: testCommunity.id,
				messageType: 'email',
				recipientContact: 'test@example.com',
				messageContent: 'Test message content',
			});
			const res = createMockResponse();

			await CommunityCommunicationController.createCommunication(req, res);

			expect(res.status).toHaveBeenCalledWith(201);
			expect(res.json).toHaveBeenCalled();
			const response = res.json.mock.calls[0][0];
			expect(response.communityMemberId).toBe(testMember.id);
		});

		it('should create communication with template reference', async () => {
			const template = await TestDataFactory.createTestMessageTemplates(testRetreat.id);
			const templateWithScope = Object.assign(template[0], {
				scope: 'community' as const,
				communityId: testCommunity.id,
				retreatId: null,
			});
			// Update template to have community scope
			const dataSource = TestDataFactory.getDataSource();
			await dataSource
				.getRepository(MessageTemplate)
				.update({ id: template[0].id }, templateWithScope);

			const req = createMockRequest(testUser, {
				communityMemberId: testMember.id,
				communityId: testCommunity.id,
				messageType: 'email',
				recipientContact: 'test@example.com',
				messageContent: 'Test message content',
				templateId: template[0].id,
			});
			const res = createMockResponse();

			await CommunityCommunicationController.createCommunication(req, res);

			expect(res.status).toHaveBeenCalledWith(201);
			expect(res.json).toHaveBeenCalled();
		});

		it('should return 400 for invalid data', async () => {
			const req = createMockRequest(testUser, {
				communityMemberId: testMember.id,
				// Missing required fields
			});
			const res = createMockResponse();

			await CommunityCommunicationController.createCommunication(req, res);

			expect(res.status).toHaveBeenCalledWith(400);
			expect(res.json).toHaveBeenCalledWith({
				error: 'Datos inválidos',
				details: 'Faltan campos requeridos',
			});
		});

		it('should return 404 for non-existent member', async () => {
			const req = createMockRequest(testUser, {
				communityMemberId: 'non-existent-member',
				communityId: testCommunity.id,
				messageType: 'email',
				recipientContact: 'test@example.com',
				messageContent: 'Test message content',
			});
			const res = createMockResponse();

			await CommunityCommunicationController.createCommunication(req, res);

			expect(res.status).toHaveBeenCalledWith(404);
			expect(res.json).toHaveBeenCalledWith({
				error: 'Miembro de comunidad no encontrado',
			});
		});

		it('should return 404 for non-existent template', async () => {
			const req = createMockRequest(testUser, {
				communityMemberId: testMember.id,
				communityId: testCommunity.id,
				messageType: 'email',
				recipientContact: 'test@example.com',
				messageContent: 'Test message content',
				templateId: 'non-existent-template',
			});
			const res = createMockResponse();

			await CommunityCommunicationController.createCommunication(req, res);

			expect(res.status).toHaveBeenCalledWith(404);
			expect(res.json).toHaveBeenCalledWith({
				error: 'Plantilla no encontrada',
			});
		});
	});

	describe('getCommunityCommunicationStats', () => {
		it('should get communication statistics for a community', async () => {
			// Create some communications first
			const createReq1 = createMockRequest(
				testUser,
				{
					communityMemberId: testMember.id,
					communityId: testCommunity.id,
					messageType: 'email',
					recipientContact: 'test1@example.com',
					messageContent: 'Test message 1',
				},
				{},
			);
			const createRes1 = createMockResponse();
			await CommunityCommunicationController.createCommunication(createReq1, createRes1);

			const createReq2 = createMockRequest(
				testUser,
				{
					communityMemberId: testMember.id,
					communityId: testCommunity.id,
					messageType: 'whatsapp',
					recipientContact: '1234567890',
					messageContent: 'Test message 2',
				},
				{},
			);
			const createRes2 = createMockResponse();
			await CommunityCommunicationController.createCommunication(createReq2, createRes2);

			const req = createMockRequest(testUser, {}, { communityId: testCommunity.id });
			const res = createMockResponse();

			await CommunityCommunicationController.getCommunityCommunicationStats(req, res);

			expect(res.json).toHaveBeenCalled();
			const response = res.json.mock.calls[0][0];
			expect(response.totalCommunications).toBeGreaterThanOrEqual(2);
			expect(response.emailCount).toBeGreaterThanOrEqual(1);
			expect(response.whatsappCount).toBeGreaterThanOrEqual(1);
			expect(response.uniqueMembersCount).toBeGreaterThanOrEqual(1);
		});
	});

	describe('deleteCommunication', () => {
		it('should delete a communication record', async () => {
			// First create a communication
			const createReq = createMockRequest(
				testUser,
				{
					communityMemberId: testMember.id,
					communityId: testCommunity.id,
					messageType: 'email',
					recipientContact: 'test@example.com',
					messageContent: 'Test message content',
				},
				{},
			);
			const createRes = createMockResponse();
			await CommunityCommunicationController.createCommunication(createReq, createRes);

			const communicationId = createRes.json.mock.calls[0][0].id;

			// Now delete it
			const req = createMockRequest(testUser, {}, { id: communicationId });
			const res = createMockResponse();

			await CommunityCommunicationController.deleteCommunication(req, res);

			expect(res.json).toHaveBeenCalledWith({
				message: 'Comunicación eliminada exitosamente',
			});
		});

		it('should return 404 for non-existent communication', async () => {
			const req = createMockRequest(testUser, {}, { id: 'non-existent-communication' });
			const res = createMockResponse();

			await CommunityCommunicationController.deleteCommunication(req, res);

			expect(res.status).toHaveBeenCalledWith(404);
			expect(res.json).toHaveBeenCalledWith({
				error: 'Comunicación no encontrada',
			});
		});
	});

	describe('sendEmailViaBackend', () => {
		it('should send email and create communication record', async () => {
			// Mock EmailService to avoid actual email sending
			const emailServiceMock = {
				sendEmail: jest.fn().mockResolvedValue(true),
			};
			(CommunityCommunicationController as any).emailService = emailServiceMock;

			const req = createMockRequest(testUser, {
				to: 'recipient@example.com',
				subject: 'Test Subject',
				html: '<p>Test HTML content</p>',
				text: 'Test text content',
				communityMemberId: testMember.id,
				communityId: testCommunity.id,
			});
			const res = createMockResponse();

			await CommunityCommunicationController.sendEmailViaBackend(req, res);

			expect(emailServiceMock.sendEmail).toHaveBeenCalledWith({
				to: 'recipient@example.com',
				subject: 'Test Subject',
				html: '<p>Test HTML content</p>',
				text: 'Test text content',
			});
			expect(res.status).toHaveBeenCalledWith(200);
			expect(res.json).toHaveBeenCalledWith(
				expect.objectContaining({
					success: true,
					message: 'Correo electrónico enviado exitosamente',
				}),
			);
		});

		it('should return 400 for missing required fields', async () => {
			const req = createMockRequest(testUser, {
				to: 'test@example.com',
				// Missing subject, html, communityMemberId, communityId
			});
			const res = createMockResponse();

			await CommunityCommunicationController.sendEmailViaBackend(req, res);

			expect(res.status).toHaveBeenCalledWith(400);
			expect(res.json).toHaveBeenCalledWith({
				error: 'Datos inválidos',
				details: 'Faltan campos requeridos: to, subject, html, communityMemberId, communityId',
			});
		});

		it('should return 404 for non-existent member', async () => {
			const req = createMockRequest(testUser, {
				to: 'test@example.com',
				subject: 'Test Subject',
				html: '<p>Test</p>',
				communityMemberId: 'non-existent-member',
				communityId: testCommunity.id,
			});
			const res = createMockResponse();

			await CommunityCommunicationController.sendEmailViaBackend(req, res);

			expect(res.status).toHaveBeenCalledWith(404);
			expect(res.json).toHaveBeenCalledWith({
				error: 'Miembro de comunidad no encontrado',
			});
		});
	});

	describe('Scope Discriminator', () => {
		it('should correctly set scope to community for all communications', async () => {
			const req = createMockRequest(testUser, {
				communityMemberId: testMember.id,
				communityId: testCommunity.id,
				messageType: 'email',
				recipientContact: 'test@example.com',
				messageContent: 'Test message content',
			});
			const res = createMockResponse();

			await CommunityCommunicationController.createCommunication(req, res);

			expect(res.status).toHaveBeenCalledWith(201);
			const response = res.json.mock.calls[0][0];
			expect(response.scope).toBe('community');
			expect(response.communityId).toBe(testCommunity.id);
		});

		it('should filter communications by scope correctly', async () => {
			// Create a community communication
			const createReq = createMockRequest(
				testUser,
				{
					communityMemberId: testMember.id,
					communityId: testCommunity.id,
					messageType: 'email',
					recipientContact: 'test@example.com',
					messageContent: 'Community message',
				},
				{},
			);
			const createRes = createMockResponse();
			await CommunityCommunicationController.createCommunication(createReq, createRes);

			// Get community communications (should only return community-scoped)
			const req = createMockRequest(testUser, {}, { communityId: testCommunity.id });
			const reqWithQuery = { ...req, query: {} };
			const res = createMockResponse();

			await CommunityCommunicationController.getCommunityCommunications(reqWithQuery, res);

			expect(res.json).toHaveBeenCalled();
			const response = res.json.mock.calls[0][0];
			// All communications should have scope 'community'
			response.communications.forEach((comm: any) => {
				expect(comm.scope).toBe('community');
			});
		});
	});
});
