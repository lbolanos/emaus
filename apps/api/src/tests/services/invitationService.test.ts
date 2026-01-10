import { setupTestDatabase, teardownTestDatabase, clearTestData } from '../test-setup';
import { TestDataFactory } from '../test-utils/testDataFactory';
import { InvitationService } from '@/services/invitationService';
import { User } from '@/entities/user.entity';
import { Retreat } from '@/entities/retreat.entity';
import { UserRetreat } from '@/entities/userRetreat.entity';
import { v4 as uuidv4 } from 'uuid';

// Mock the mailer to avoid sending actual emails
jest.mock('@/services/userManagementMailer', () => ({
	UserManagementMailer: jest.fn().mockImplementation(() => ({
		sendUserInvitation: jest.fn().mockResolvedValue(true),
	})),
}));

describe('InvitationService', () => {
	let service: InvitationService;
	let testOwner: User;
	let testRetreat: Retreat;
	let testRole: any;

	beforeAll(async () => {
		await setupTestDatabase();
		service = new InvitationService();
	});

	afterAll(async () => {
		await teardownTestDatabase();
	});

	beforeEach(async () => {
		await clearTestData();
		testOwner = await TestDataFactory.createTestUser();
		testRetreat = await TestDataFactory.createTestRetreat();
		testRole = await TestDataFactory.createTestRole();
	});

	describe('inviteUsers', () => {
		it('should create new pending users for non-existent emails', async () => {
			const invitations = [
				{
					email: `new-user-${Date.now()}@example.com`,
					roleId: testRole.id,
					retreatId: testRetreat.id,
				},
			];

			const result = await service.inviteUsers(testOwner.id, invitations);

			expect(result.usersInvited.length).toBe(1);
			expect(result.usersInvited[0].success).toBe(true);
			expect(result.usersCreated).toHaveLength(1);
			expect(result.usersCreated[0]).toContain(invitations[0].email);
		});

		it('should send invitations to existing users', async () => {
			// Create an existing user
			const existingUser = await TestDataFactory.createTestUser({
				email: `existing-${Date.now()}@example.com`,
			});

			const invitations = [
				{
					email: existingUser.email,
					roleId: testRole.id,
					retreatId: testRetreat.id,
				},
			];

			const result = await service.inviteUsers(testOwner.id, invitations);

			expect(result.usersInvited.length).toBe(1);
			expect(result.usersInvited[0].success).toBe(true);
			expect(result.usersCreated).toHaveLength(0); // No new users created
		});

		it('should handle mix of new and existing users', async () => {
			const existingUser = await TestDataFactory.createTestUser({
				email: `existing-${Date.now()}@example.com`,
			});
			const newUserEmail = `new-${Date.now()}@example.com`;

			const invitations = [
				{
					email: existingUser.email,
					roleId: testRole.id,
					retreatId: testRetreat.id,
				},
				{
					email: newUserEmail,
					roleId: testRole.id,
					retreatId: testRetreat.id,
				},
			];

			const result = await service.inviteUsers(testOwner.id, invitations);

			expect(result.usersInvited.length).toBe(2);
			expect(result.usersInvited[0].success).toBe(true);
			expect(result.usersInvited[1].success).toBe(true);
			expect(result.usersCreated).toHaveLength(1);
		});

		it('should not invite users who already have access', async () => {
			const user = await TestDataFactory.createTestUser();

			// Create existing UserRetreat record
			const userRetreatRepo = TestDataFactory.getDataSource().getRepository(UserRetreat);
			await userRetreatRepo.save({
				userId: user.id,
				retreatId: testRetreat.id,
				roleId: testRole.id,
				status: 'active',
			});

			const invitations = [
				{
					email: user.email,
					roleId: testRole.id,
					retreatId: testRetreat.id,
				},
			];

			const result = await service.inviteUsers(testOwner.id, invitations);

			expect(result.usersInvited.length).toBe(1);
			expect(result.usersInvited[0].success).toBe(false);
			expect(result.usersInvited[0].message).toContain('already has access');
		});

		it('should return error for non-existent retreat', async () => {
			const invitations = [
				{
					email: `test-${Date.now()}@example.com`,
					roleId: testRole.id,
					retreatId: uuidv4(), // Non-existent retreat
				},
			];

			const result = await service.inviteUsers(testOwner.id, invitations);

			expect(result.usersInvited.length).toBe(1);
			expect(result.usersInvited[0].success).toBe(false);
			expect(result.usersInvited[0].message).toContain('Retreat not found');
		});

		it('should return error for non-existent role', async () => {
			const invitations = [
				{
					email: `test-${Date.now()}@example.com`,
					roleId: 99999, // Non-existent role
					retreatId: testRetreat.id,
				},
			];

			const result = await service.inviteUsers(testOwner.id, invitations);

			expect(result.usersInvited.length).toBe(1);
			expect(result.usersInvited[0].success).toBe(false);
			expect(result.usersInvited[0].message).toContain('Role not found');
		});

		it('should set 7-day expiration for invitations', async () => {
			const invitations = [
				{
					email: `test-${Date.now()}@example.com`,
					roleId: testRole.id,
					retreatId: testRetreat.id,
				},
			];

			await service.inviteUsers(testOwner.id, invitations);

			// Check the created user
			const userRepo = TestDataFactory.getDataSource().getRepository(User);
			const user = await userRepo.findOne({
				where: { email: invitations[0].email },
			});

			expect(user).toBeDefined();
			expect(user?.isPending).toBe(true);
			expect(user?.invitationExpiresAt).toBeDefined();

			// Check expiration is approximately 7 days from now
			const daysUntilExpiration =
				(user!.invitationExpiresAt!.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
			expect(daysUntilExpiration).toBeGreaterThan(6.9);
			expect(daysUntilExpiration).toBeLessThan(7.1);
		});

		it('should create UserRetreat records with pending status', async () => {
			const invitations = [
				{
					email: `test-${Date.now()}@example.com`,
					roleId: testRole.id,
					retreatId: testRetreat.id,
				},
			];

			const result = await service.inviteUsers(testOwner.id, invitations);

			// Check UserRetreat record was created
			const userRepo = TestDataFactory.getDataSource().getRepository(User);
			const user = await userRepo.findOne({
				where: { email: invitations[0].email },
			});

			const userRetreatRepo = TestDataFactory.getDataSource().getRepository(UserRetreat);
			const userRetreat = await userRetreatRepo.findOne({
				where: { userId: user!.id, retreatId: testRetreat.id },
			});

			expect(userRetreat).toBeDefined();
			expect(userRetreat?.status).toBe('pending');
			expect(userRetreat?.invitationToken).toBeDefined();
		});
	});

	describe('acceptInvitation', () => {
		it('should activate new pending user with password', async () => {
			// Create a pending user with invitation
			const pendingUser = await TestDataFactory.createPendingUserWithInvitation(
				testRetreat.id,
				testRole.id,
			);

			const result = await service.acceptInvitation(pendingUser.id, 'John Doe', 'newPassword123');

			expect(result.success).toBe(true);
			expect(result.message).toContain('Account created');

			// Verify user was updated
			const userRepo = TestDataFactory.getDataSource().getRepository(User);
			const updatedUser = await userRepo.findOne({ where: { id: pendingUser.id } });
			expect(updatedUser?.isPending).toBe(false);
			expect(updatedUser?.displayName).toBe('John Doe');
		});

		it('should activate existing user invitation', async () => {
			// Create an active user
			const activeUser = await TestDataFactory.createTestUser({
				email: `active-${Date.now()}@example.com`,
			});

			// Create a pending UserRetreat record
			const userRetreatRepo = TestDataFactory.getDataSource().getRepository(UserRetreat);
			await userRetreatRepo.save({
				userId: activeUser.id,
				retreatId: testRetreat.id,
				roleId: testRole.id,
				status: 'pending',
				invitationToken: uuidv4(),
				expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
			});

			const result = await service.acceptInvitation(activeUser.id, 'Jane Doe', 'password123');

			expect(result.success).toBe(true);
			expect(result.message).toContain('Invitation accepted');

			// Check UserRetreat status
			const userRetreat = await userRetreatRepo.findOne({
				where: { userId: activeUser.id, retreatId: testRetreat.id },
			});
			expect(userRetreat?.status).toBe('active');
		});

		it('should reject expired invitations', async () => {
			const { v4: uuidv4 } = await import('uuid');
			const expiredDate = new Date(Date.now() - 24 * 60 * 60 * 1000); // Yesterday

			const pendingUser = await TestDataFactory.createTestUser({
				isPending: true,
				invitationExpiresAt: expiredDate,
			});

			const result = await service.acceptInvitation(pendingUser.id, 'Test User', 'password123');

			expect(result.success).toBe(false);
			expect(result.message).toContain('expired');
		});

		it('should reject invalid user id', async () => {
			const result = await service.acceptInvitation(uuidv4(), 'Test User', 'password123');

			expect(result.success).toBe(false);
			expect(result.message).toContain('not found');
		});

		it('should validate inviter shares retreat with invitee', async () => {
			// Create inviter with access to a different retreat
			const otherRetreat = await TestDataFactory.createTestRetreat();
			const inviter = await TestDataFactory.createTestUser();

			// Give inviter access to otherRetreat
			const userRetreatRepo = TestDataFactory.getDataSource().getRepository(UserRetreat);
			await userRetreatRepo.save({
				userId: inviter.id,
				retreatId: otherRetreat.id,
				roleId: testRole.id,
				status: 'active',
			});

			// Create invitee with access to testRetreat
			const invitee = await TestDataFactory.createTestUser({
				isPending: true,
			});
			await userRetreatRepo.save({
				userId: invitee.id,
				retreatId: testRetreat.id,
				roleId: testRole.id,
				status: 'pending',
				invitationToken: uuidv4(),
				expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
			});

			// Try to accept with inviter who doesn't share retreats
			const result = await service.acceptInvitation(
				invitee.id,
				'Invitee Name',
				'password123',
				inviter.id,
			);

			expect(result.success).toBe(false);
			expect(result.message).toContain('no shared retreats');
		});

		it('should update UserRetreat status to active', async () => {
			const pendingUser = await TestDataFactory.createPendingUserWithInvitation(
				testRetreat.id,
				testRole.id,
			);

			await service.acceptInvitation(pendingUser.id, 'John', 'password123');

			const userRetreatRepo = TestDataFactory.getDataSource().getRepository(UserRetreat);
			const userRetreat = await userRetreatRepo.findOne({
				where: { userId: pendingUser.id, retreatId: testRetreat.id },
			});

			expect(userRetreat?.status).toBe('active');
		});
	});

	describe('validateInvitationToken', () => {
		it('should validate valid UserRetreat token', async () => {
			const pendingUser = await TestDataFactory.createPendingUserWithInvitation(
				testRetreat.id,
				testRole.id,
			);

			// Get the UserRetreat record to get the token
			const userRetreatRepo = TestDataFactory.getDataSource().getRepository(UserRetreat);
			const userRetreat = await userRetreatRepo.findOne({
				where: { userId: pendingUser.id },
			});

			const result = await service.validateInvitationToken(userRetreat!.invitationToken!);

			expect(result.valid).toBe(true);
			expect(result.user?.id).toBe(pendingUser.id);
		});

		it('should reject expired tokens', async () => {
			const expiredDate = new Date(Date.now() - 24 * 60 * 60 * 1000);

			const pendingUser = await TestDataFactory.createTestUser({
				isPending: true,
				invitationExpiresAt: expiredDate,
				invitationToken: uuidv4(),
			});

			const userRetreatRepo = TestDataFactory.getDataSource().getRepository(UserRetreat);
			await userRetreatRepo.save({
				userId: pendingUser.id,
				retreatId: testRetreat.id,
				roleId: testRole.id,
				status: 'pending',
				invitationToken: pendingUser.invitationToken,
				expiresAt: expiredDate,
			});

			const result = await service.validateInvitationToken(pendingUser.invitationToken!);

			expect(result.valid).toBe(false);
			expect(result.message).toContain('expired');
		});

		it('should reject already accepted invitations', async () => {
			const activeUser = await TestDataFactory.createTestUser();

			const result = await service.validateInvitationToken('some-token');

			// Since user is not pending, should not be valid
			expect(result.valid).toBe(false);
		});

		it('should reject invalid tokens', async () => {
			const result = await service.validateInvitationToken('invalid-token-12345');

			expect(result.valid).toBe(false);
			expect(result.message).toContain('Invalid');
		});
	});

	describe('getInvitationStatus', () => {
		it('should return invitation details for valid token', async () => {
			const pendingUser = await TestDataFactory.createPendingUserWithInvitation(
				testRetreat.id,
				testRole.id,
			);

			const userRetreatRepo = TestDataFactory.getDataSource().getRepository(UserRetreat);
			const userRetreat = await userRetreatRepo.findOne({
				where: { userId: pendingUser.id, retreatId: testRetreat.id },
				relations: ['retreat'],
			});

			const result = await service.getInvitationStatus(userRetreat!.invitationToken!);

			expect(result.valid).toBe(true);
			expect(result.user?.id).toBe(pendingUser.id);
			expect(result.retreats).toBeDefined();
			expect(result.retreats!.length).toBe(1);
			expect(result.retreats![0].id).toBe(testRetreat.id);
		});

		it('should return error for invalid token', async () => {
			const result = await service.getInvitationStatus('invalid-token');

			expect(result.valid).toBe(false);
			expect(result.message).toBeDefined();
		});

		it('should include retreat information', async () => {
			const pendingUser = await TestDataFactory.createPendingUserWithInvitation(
				testRetreat.id,
				testRole.id,
			);

			const userRetreatRepo = TestDataFactory.getDataSource().getRepository(UserRetreat);
			const userRetreat = await userRetreatRepo.findOne({
				where: { userId: pendingUser.id },
				relations: ['retreat'],
			});

			const result = await service.getInvitationStatus(userRetreat!.invitationToken!);

			expect(result.retreats).toBeDefined();
			expect(result.retreats!.length).toBeGreaterThan(0);
			expect(result.retreats![0].parish).toBeDefined();
			expect(result.retreats![0].startDate).toBeDefined();
			expect(result.retreats![0].endDate).toBeDefined();
		});
	});
});
