import { setupTestDatabase, teardownTestDatabase, clearTestData } from '../test-setup';
import { TestDataFactory } from '../test-utils/testDataFactory';
import { InvitationController } from '@/controllers/invitationController';
import { createMockRequest, createMockResponse } from '../test-utils/authTestUtils';
import { User } from '@/entities/user.entity';
import { Retreat } from '@/entities/retreat.entity';
import { UserRetreat } from '@/entities/userRetreat.entity';

// Mock the authorizationService
jest.mock('@/middleware/authorization', () => ({
	authorizationService: {
		hasRetreatAccess: jest.fn().mockResolvedValue(true),
	},
}));

// Mock the mailer
jest.mock('@/services/userManagementMailer', () => ({
	UserManagementMailer: jest.fn().mockImplementation(() => ({
		sendUserInvitation: jest.fn().mockResolvedValue(true),
	})),
}));

describe('InvitationController', () => {
	let controller: InvitationController;
	let testUser: User;
	let testRetreat: Retreat;
	let testRole: any;

	beforeAll(async () => {
		await setupTestDatabase();
		controller = new InvitationController();
	});

	afterAll(async () => {
		await teardownTestDatabase();
	});

	beforeEach(async () => {
		await clearTestData();
		testUser = await TestDataFactory.createTestUser();
		testRetreat = await TestDataFactory.createTestRetreat();
		testRole = await TestDataFactory.createTestRole();
	});

	describe('inviteUsers', () => {
		it('should return 400 without invitations array', async () => {
			const req = createMockRequest(testUser, {}, {});
			const res = createMockResponse();

			await controller.inviteUsers(req, res);

			expect(res.status).toHaveBeenCalledWith(400);
			expect(res.json).toHaveBeenCalledWith(
				expect.objectContaining({
					error: expect.stringContaining('Invitations array is required'),
				}),
			);
		});

		it('should return 400 for more than 10 invitations', async () => {
			const invitations = Array.from({ length: 11 }, (_, i) => ({
				email: `test${i}@example.com`,
				roleId: testRole.id,
				retreatId: testRetreat.id,
			}));

			const req = createMockRequest(testUser, { invitations }, {});
			const res = createMockResponse();

			await controller.inviteUsers(req, res);

			expect(res.status).toHaveBeenCalledWith(400);
			expect(res.json).toHaveBeenCalledWith(
				expect.objectContaining({
					error: expect.stringContaining('Maximum 10 invitations'),
				}),
			);
		});

		it('should return 400 for missing required fields', async () => {
			const invitations = [
				{ email: 'test@example.com' }, // Missing roleId and retreatId
			];

			const req = createMockRequest(testUser, { invitations }, {});
			const res = createMockResponse();

			await controller.inviteUsers(req, res);

			expect(res.status).toHaveBeenCalledWith(400);
			expect(res.json).toHaveBeenCalledWith(
				expect.objectContaining({
					error: expect.stringContaining('must include'),
				}),
			);
		});

		it('should return 400 for invitations with null email', async () => {
			const invitations = [
				{
					email: null,
					roleId: testRole.id,
					retreatId: testRetreat.id,
				},
			];

			const req = createMockRequest(testUser, { invitations }, {});
			const res = createMockResponse();

			await controller.inviteUsers(req, res);

			expect(res.status).toHaveBeenCalledWith(400);
			expect(res.json).toHaveBeenCalledWith(
				expect.objectContaining({
					error: expect.stringContaining('must include'),
				}),
			);
		});

		it('should return success for valid invitations', async () => {
			const invitations = [
				{
					email: `test-${Date.now()}@example.com`,
					roleId: testRole.id,
					retreatId: testRetreat.id,
				},
			];

			const req = createMockRequest(testUser, { invitations }, {});
			const res = createMockResponse();

			await controller.inviteUsers(req, res);

			expect(res.json).toHaveBeenCalledWith(
				expect.objectContaining({
					message: expect.stringContaining('completed'),
					usersInvited: expect.any(Array),
				}),
			);
		});

		it('should handle mixed successful and failed invitations', async () => {
			const { v4: uuidv4 } = await import('uuid');
			const invitations = [
				{
					email: `valid-${Date.now()}@example.com`,
					roleId: testRole.id,
					retreatId: testRetreat.id,
				},
				{
					email: `test2@example.com`,
					roleId: testRole.id,
					retreatId: uuidv4(), // Invalid retreat
				},
			];

			const req = createMockRequest(testUser, { invitations }, {});
			const res = createMockResponse();

			await controller.inviteUsers(req, res);

			expect(res.json).toHaveBeenCalledWith(
				expect.objectContaining({
					usersInvited: expect.arrayContaining([
						expect.objectContaining({ success: true }),
						expect.objectContaining({ success: false }),
					]),
				}),
			);
		});
	});

	describe('acceptInvitation', () => {
		it('should return 400 for missing display name', async () => {
			const req = createMockRequest(
				{ id: 'user-id' },
				{ password: 'password123' },
				{ id: 'user-id' },
			);
			const res = createMockResponse();

			await controller.acceptInvitation(req, res);

			expect(res.status).toHaveBeenCalledWith(400);
			expect(res.json).toHaveBeenCalledWith(
				expect.objectContaining({
					error: expect.stringContaining('Display name and password are required'),
				}),
			);
		});

		it('should return 400 for missing password', async () => {
			const req = createMockRequest(
				{ id: 'user-id' },
				{ displayName: 'John Doe' },
				{ id: 'user-id' },
			);
			const res = createMockResponse();

			await controller.acceptInvitation(req, res);

			expect(res.status).toHaveBeenCalledWith(400);
			expect(res.json).toHaveBeenCalledWith(
				expect.objectContaining({
					error: expect.stringContaining('Display name and password are required'),
				}),
			);
		});

		it('should return 400 for password less than 6 characters', async () => {
			const req = createMockRequest(
				{ id: 'user-id' },
				{ displayName: 'John Doe', password: '12345' },
				{ id: 'user-id' },
			);
			const res = createMockResponse();

			await controller.acceptInvitation(req, res);

			expect(res.status).toHaveBeenCalledWith(400);
			expect(res.json).toHaveBeenCalledWith(
				expect.objectContaining({
					error: expect.stringContaining('at least 6 characters'),
				}),
			);
		});

		it('should return 400 for invalid invitation', async () => {
			const { v4: uuidv4 } = await import('uuid');
			const req = createMockRequest(
				{ id: uuidv4() }, // Non-existent user
				{ displayName: 'John Doe', password: 'password123' },
				{ id: 'user-id' },
			);
			const res = createMockResponse();

			await controller.acceptInvitation(req, res);

			expect(res.status).toHaveBeenCalledWith(400);
			expect(res.json).toHaveBeenCalledWith(
				expect.objectContaining({
					error: expect.any(String),
				}),
			);
		});

		it('should return success for valid acceptance', async () => {
			// Create a pending user
			const pendingUser = await TestDataFactory.createPendingUserWithInvitation(
				testRetreat.id,
				testRole.id,
			);

			const req = createMockRequest(
				{ id: pendingUser.id },
				{ displayName: 'Jane Doe', password: 'newPassword123' },
				{ id: pendingUser.id },
			);
			const res = createMockResponse();

			await controller.acceptInvitation(req, res);

			expect(res.json).toHaveBeenCalledWith(
				expect.objectContaining({
					message: expect.stringContaining('success'),
					user: expect.objectContaining({
						id: pendingUser.id,
						displayName: 'Jane Doe',
					}),
				}),
			);
		});
	});

	describe('getInvitationStatus', () => {
		it('should return status for valid token', async () => {
			const pendingUser = await TestDataFactory.createPendingUserWithInvitation(
				testRetreat.id,
				testRole.id,
			);

			const userRetreatRepo = TestDataFactory.getDataSource().getRepository(UserRetreat);
			const userRetreat = await userRetreatRepo.findOne({
				where: { userId: pendingUser.id },
			});

			const req = createMockRequest({}, {}, { token: userRetreat!.invitationToken });
			const res = createMockResponse();

			await controller.getInvitationStatus(req, res);

			expect(res.json).toHaveBeenCalledWith(
				expect.objectContaining({
					valid: true,
					user: expect.objectContaining({
						id: pendingUser.id,
					}),
				}),
			);
		});

		it('should return 400 for invalid token', async () => {
			const req = createMockRequest({}, {}, { token: 'invalid-token-12345' });
			const res = createMockResponse();

			await controller.getInvitationStatus(req, res);

			expect(res.status).toHaveBeenCalledWith(400);
			expect(res.json).toHaveBeenCalledWith(
				expect.objectContaining({
					error: expect.any(String),
				}),
			);
		});
	});

	describe('validateInvitationToken', () => {
		it('should return 400 for missing token', async () => {
			const req = createMockRequest({}, { token: null }, {});
			const res = createMockResponse();

			await controller.validateInvitationToken(req, res);

			expect(res.status).toHaveBeenCalledWith(400);
			expect(res.json).toHaveBeenCalledWith(
				expect.objectContaining({
					error: expect.stringContaining('Token is required'),
				}),
			);
		});

		it('should validate and return token details', async () => {
			const pendingUser = await TestDataFactory.createPendingUserWithInvitation(
				testRetreat.id,
				testRole.id,
			);

			const userRetreatRepo = TestDataFactory.getDataSource().getRepository(UserRetreat);
			const userRetreat = await userRetreatRepo.findOne({
				where: { userId: pendingUser.id },
			});

			const req = createMockRequest({}, { token: userRetreat!.invitationToken }, {});
			const res = createMockResponse();

			await controller.validateInvitationToken(req, res);

			expect(res.json).toHaveBeenCalledWith(
				expect.objectContaining({
					valid: true,
					user: expect.objectContaining({
						id: pendingUser.id,
					}),
				}),
			);
		});

		it('should return validation result for invalid token', async () => {
			const req = createMockRequest({}, { token: 'invalid-token-12345' }, {});
			const res = createMockResponse();

			await controller.validateInvitationToken(req, res);

			expect(res.json).toHaveBeenCalledWith(
				expect.objectContaining({
					valid: false,
				}),
			);
		});
	});
});
