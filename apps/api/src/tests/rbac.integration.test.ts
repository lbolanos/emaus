import { AppDataSource } from '../data-source';
import { User } from '../entities/user.entity';
import { Retreat } from '../entities/retreat.entity';
import { Role } from '../entities/role.entity';
import { UserRetreat } from '../entities/userRetreat.entity';
import { retreatRoleService } from '../services/retreatRoleService';
import { roleRequestService } from '../services/roleRequestService';
import { permissionOverrideService } from '../services/permissionOverrideService';
import { authorizationService } from '../middleware/authorization';
import { AuditService } from '../services/auditService';

describe('RBAC Integration Tests', () => {
	let testUser: User;
	let testRetreat: Retreat;
	let adminRole: Role;
	let serverRole: Role;
	let auditService: AuditService;

	beforeAll(async () => {
		// Initialize test database
		await AppDataSource.initialize();
		auditService = new AuditService(AppDataSource);

		// Create test user
		const userRepository = AppDataSource.getRepository(User);
		testUser = userRepository.create({
			email: 'test@example.com',
			displayName: 'Test User',
			password: 'hashedpassword',
		});
		await userRepository.save(testUser);

		// Create test retreat
		const retreatRepository = AppDataSource.getRepository(Retreat);
		testRetreat = retreatRepository.create({
			parish: 'Test Parish',
			startDate: new Date(),
			endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
			houseId: 'test-house-id',
			createdBy: testUser.id,
		});
		await retreatRepository.save(testRetreat);

		// Create test roles
		const roleRepository = AppDataSource.getRepository(Role);
		adminRole = roleRepository.create({
			name: 'admin',
			description: 'Administrator role',
		});
		await roleRepository.save(adminRole);

		serverRole = roleRepository.create({
			name: 'servidor',
			description: 'Server role',
		});
		await roleRepository.save(serverRole);
	});

	afterAll(async () => {
		await AppDataSource.destroy();
	});

	describe('Retreat Role Management', () => {
		test('should assign role to user in retreat', async () => {
			const userRetreat = await retreatRoleService.inviteUserToRetreat(
				testRetreat.id,
				testUser.email,
				'servidor',
				testUser.id,
			);

			expect(userRetreat).toBeTruthy();
			expect(userRetreat.userId).toBe(testUser.id);
			expect(userRetreat.retreatId).toBe(testRetreat.id);
			expect(userRetreat.roleId).toBe(serverRole.id);
			expect(userRetreat.status).toBe('active');
		});

		test('should check retreat access', async () => {
			const hasAccess = await authorizationService.hasRetreatAccess(testUser.id, testRetreat.id);
			expect(hasAccess).toBe(true);
		});

		test('should check retreat role', async () => {
			const hasRole = await authorizationService.hasRetreatRole(
				testUser.id,
				testRetreat.id,
				'servidor',
			);
			expect(hasRole).toBe(true);
		});

		test('should remove user from retreat', async () => {
			const result = await retreatRoleService.removeUserFromRetreat(
				testRetreat.id,
				testUser.id,
				testUser.id,
			);

			expect(result).toBe(true);

			const hasAccess = await authorizationService.hasRetreatAccess(testUser.id, testRetreat.id);
			expect(hasAccess).toBe(false);
		});
	});

	describe('Role Request System', () => {
		test('should create role request', async () => {
			const roleRequest = await roleRequestService.createRoleRequest(
				testUser.id,
				testRetreat.id,
				'tesorero',
			);

			expect(roleRequest).toBeTruthy();
			expect(roleRequest.userId).toBe(testUser.id);
			expect(roleRequest.retreatId).toBe(testRetreat.id);
			expect(roleRequest.requestedRole).toBe('tesorero');
			expect(roleRequest.status).toBe('pending');
		});

		test('should get active request for user', async () => {
			const activeRequest = await roleRequestService.getActiveRequest(testUser.id, testRetreat.id);
			expect(activeRequest).toBeTruthy();
			expect(activeRequest?.status).toBe('pending');
		});

		test('should prevent duplicate requests', async () => {
			await expect(
				roleRequestService.createRoleRequest(testUser.id, testRetreat.id, 'tesorero'),
			).rejects.toThrow('You already have a pending role request for this retreat');
		});

		test('should approve role request', async () => {
			const activeRequest = await roleRequestService.getActiveRequest(testUser.id, testRetreat.id);
			if (!activeRequest) throw new Error('No active request found');

			// First assign the admin role to testUser so they can approve
			await retreatRoleService.inviteUserToRetreat(
				testRetreat.id,
				testUser.email,
				'admin',
				testUser.id,
			);

			const approvedRequest = await roleRequestService.approveRoleRequest(
				activeRequest.id,
				testUser.id,
			);

			expect(approvedRequest.status).toBe('approved');
			expect(approvedRequest.approvedBy).toBe(testUser.id);
		});
	});

	describe('Permission Override System', () => {
		test('should set permission override', async () => {
			const overrides = [
				{
					resource: 'participants',
					operation: 'delete',
					granted: true,
					reason: 'Temporary admin access',
				},
			];

			await permissionOverrideService.setPermissionOverride(
				testUser.id,
				testRetreat.id,
				overrides,
				testUser.id,
				'Granting temporary delete permissions',
			);

			const retrievedOverrides = await permissionOverrideService.getPermissionOverrides(
				testUser.id,
				testRetreat.id,
			);

			expect(retrievedOverrides).toHaveLength(1);
			expect(retrievedOverrides[0].resource).toBe('participants');
			expect(retrievedOverrides[0].operation).toBe('delete');
			expect(retrievedOverrides[0].granted).toBe(true);
		});

		test('should apply permission overrides', async () => {
			const basePermissions = ['participants:read', 'participants:create'];
			const finalPermissions = await permissionOverrideService.applyPermissionOverrides(
				basePermissions,
				testUser.id,
				testRetreat.id,
			);

			expect(finalPermissions).toContain('participants:delete');
		});

		test('should clear permission overrides', async () => {
			await permissionOverrideService.clearPermissionOverrides(
				testUser.id,
				testRetreat.id,
				testUser.id,
			);

			const clearedOverrides = await permissionOverrideService.getPermissionOverrides(
				testUser.id,
				testRetreat.id,
			);

			expect(clearedOverrides).toHaveLength(0);
		});
	});

	describe('Audit Logging', () => {
		test('should log role assignment', async () => {
			// Assign a role
			await retreatRoleService.inviteUserToRetreat(
				testRetreat.id,
				testUser.email,
				'logística',
				testUser.id,
			);

			// Check audit logs
			const { logs } = await auditService.getAuditLogs({
				retreatId: testRetreat.id,
				actionType: 'role_assigned' as any,
				limit: 10,
			});

			expect(logs.length).toBeGreaterThan(0);
			const roleAssignmentLog = logs.find(
				(log) => log.actionType === 'role_assigned' && log.targetUserId === testUser.id,
			);
			expect(roleAssignmentLog).toBeTruthy();
		});

		test('should log role request creation', async () => {
			// Create a new role request
			await roleRequestService.createRoleRequest(
				testUser.id,
				testRetreat.id,
				'palancas',
				'Need access for logistics',
			);

			// Check audit logs
			const { logs } = await auditService.getAuditLogs({
				retreatId: testRetreat.id,
				actionType: 'role_request_created' as any,
				limit: 10,
			});

			const requestLog = logs.find(
				(log) => log.actionType === 'role_request_created' && log.targetUserId === testUser.id,
			);
			expect(requestLog).toBeTruthy();
		});

		test('should log permission override changes', async () => {
			// Set permission override
			const overrides = [
				{
					resource: 'inventory',
					operation: 'manage',
					granted: true,
					reason: 'Inventory management access',
				},
			];

			await permissionOverrideService.setPermissionOverride(
				testUser.id,
				testRetreat.id,
				overrides,
				testUser.id,
				'Inventory management',
			);

			// Check audit logs
			const { logs } = await auditService.getAuditLogs({
				retreatId: testRetreat.id,
				actionType: 'permission_override_added' as any,
				limit: 10,
			});

			const overrideLog = logs.find(
				(log) => log.actionType === 'permission_override_added' && log.targetUserId === testUser.id,
			);
			expect(overrideLog).toBeTruthy();
		});

		test('should get audit statistics', async () => {
			const stats = await auditService.getAuditLogs({
				retreatId: testRetreat.id,
				limit: 100,
			});

			expect(stats.logs.length).toBeGreaterThan(0);
			expect(stats.total).toBeGreaterThan(0);
		});
	});

	describe('Error Handling', () => {
		test('should handle non-existent user', async () => {
			await expect(
				retreatRoleService.inviteUserToRetreat(
					testRetreat.id,
					'nonexistent@example.com',
					'servidor',
					testUser.id,
				),
			).rejects.toThrow('User not found');
		});

		test('should handle non-existent role', async () => {
			await expect(
				retreatRoleService.inviteUserToRetreat(
					testRetreat.id,
					testUser.email,
					'nonexistent_role',
					testUser.id,
				),
			).rejects.toThrow('Role not found');
		});

		test('should handle unauthorized access', async () => {
			const otherUser = AppDataSource.getRepository(User).create({
				email: 'other@example.com',
				displayName: 'Other User',
				password: 'hashedpassword',
			});
			await AppDataSource.getRepository(User).save(otherUser);

			await expect(
				retreatRoleService.inviteUserToRetreat(
					testRetreat.id,
					otherUser.email,
					'servidor',
					otherUser.id,
				),
			).rejects.toThrow('Only retreat creator can invite users');
		});
	});
});
