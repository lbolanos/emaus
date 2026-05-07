/**
 * Regression tests for `requireCommunityAccess` middleware.
 *
 * Bug: a superadmin without a row in `community_admin` was getting 403 when
 * hitting `GET /communities/:id`, even though `getCommunities` already lets
 * superadmins see every community. The fix bypasses the admin lookup when
 * the caller is a superadmin, mirroring the service-level behavior.
 */
import { setupTestDatabase, teardownTestDatabase } from '../test-setup';
import { TestDataFactory } from '../test-utils/testDataFactory';
import { createMockRequest, createMockResponse } from '../test-utils/authTestUtils';

describe('requireCommunityAccess middleware', () => {
	let requireCommunityAccess: any;
	let superadminRole: any;
	let regularRole: any;

	beforeAll(async () => {
		await setupTestDatabase();
		const mod = await import('@/middleware/authorization');
		requireCommunityAccess = mod.requireCommunityAccess;
		// Roles persist across tests within this suite (no clearTestData
		// between cases). Each test creates users with unique UUIDs so they
		// don't collide.
		superadminRole = await TestDataFactory.createTestRole({ name: 'superadmin' });
		regularRole = await TestDataFactory.createTestRole({ name: 'admin' });
	});

	afterAll(async () => {
		await teardownTestDatabase();
	});

	async function assignRole(userId: string, roleId: number) {
		const { UserRole } = await import('@/entities/userRole.entity');
		const repo = TestDataFactory.getDataSource().getRepository(UserRole);
		await repo.save({ userId, roleId });
	}

	it('returns 401 when no user is attached to the request', async () => {
		const owner = await TestDataFactory.createTestUser();
		const community = await TestDataFactory.createTestCommunity(owner.id);
		const req = createMockRequest(null, {}, { id: community.id });
		const res = createMockResponse();
		const next = jest.fn();

		await requireCommunityAccess('id')(req, res, next);

		expect(res.status).toHaveBeenCalledWith(401);
		expect(next).not.toHaveBeenCalled();
	});

	it('returns 400 when the community id param is missing', async () => {
		const user = await TestDataFactory.createTestUser();
		const req = createMockRequest(user, {}, {});
		const res = createMockResponse();
		const next = jest.fn();

		await requireCommunityAccess('id')(req, res, next);

		expect(res.status).toHaveBeenCalledWith(400);
		expect(next).not.toHaveBeenCalled();
	});

	it('returns 403 when the user has no community_admin row and is not superadmin', async () => {
		const owner = await TestDataFactory.createTestUser();
		const community = await TestDataFactory.createTestCommunity(owner.id);
		const outsider = await TestDataFactory.createTestUser();
		await assignRole(outsider.id, regularRole.id);

		const req = createMockRequest(outsider, {}, { id: community.id });
		const res = createMockResponse();
		const next = jest.fn();

		await requireCommunityAccess('id')(req, res, next);

		expect(res.status).toHaveBeenCalledWith(403);
		expect(next).not.toHaveBeenCalled();
	});

	it('calls next() when the user is an active community admin', async () => {
		const owner = await TestDataFactory.createTestUser();
		const community = await TestDataFactory.createTestCommunity(owner.id);
		const adminUser = await TestDataFactory.createTestUser();
		await TestDataFactory.createTestCommunityAdmin(community.id, adminUser.id, {
			status: 'active',
			role: 'admin',
		});

		const req = createMockRequest(adminUser, {}, { id: community.id });
		const res = createMockResponse();
		const next = jest.fn();

		await requireCommunityAccess('id')(req, res, next);

		expect(next).toHaveBeenCalled();
		expect(req.communityAdmin).toBeTruthy();
	});

	// Regression for the original bug: a superadmin without a community_admin
	// row hits `GET /communities/:id` and now gets 200 instead of 403.
	it('bypasses the admin check when the user is a superadmin (regression)', async () => {
		const owner = await TestDataFactory.createTestUser();
		const community = await TestDataFactory.createTestCommunity(owner.id);
		const superadmin = await TestDataFactory.createTestUser();
		await assignRole(superadmin.id, superadminRole.id);
		// Note: NO community_admin row created for `superadmin`.

		const req = createMockRequest(superadmin, {}, { id: community.id });
		const res = createMockResponse();
		const next = jest.fn();

		await requireCommunityAccess('id')(req, res, next);

		expect(next).toHaveBeenCalled();
		expect(res.status).not.toHaveBeenCalledWith(403);
		// The middleware sets communityAdmin to null for the superadmin path
		// since there is no real row to attach.
		expect(req.communityAdmin).toBeNull();
	});

	it('respects the custom communityIdParam name', async () => {
		const owner = await TestDataFactory.createTestUser();
		const community = await TestDataFactory.createTestCommunity(owner.id);
		const superadmin = await TestDataFactory.createTestUser();
		await assignRole(superadmin.id, superadminRole.id);

		const req = createMockRequest(superadmin, {}, { communityId: community.id });
		const res = createMockResponse();
		const next = jest.fn();

		await requireCommunityAccess('communityId')(req, res, next);

		expect(next).toHaveBeenCalled();
	});

	it('does NOT bypass for revoked admins (status != "active")', async () => {
		const owner = await TestDataFactory.createTestUser();
		const community = await TestDataFactory.createTestCommunity(owner.id);
		const formerAdmin = await TestDataFactory.createTestUser();
		await TestDataFactory.createTestCommunityAdmin(community.id, formerAdmin.id, {
			status: 'revoked',
		});

		const req = createMockRequest(formerAdmin, {}, { id: community.id });
		const res = createMockResponse();
		const next = jest.fn();

		await requireCommunityAccess('id')(req, res, next);

		expect(res.status).toHaveBeenCalledWith(403);
		expect(next).not.toHaveBeenCalled();
	});
});
