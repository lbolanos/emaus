import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import * as api from '@/services/api';

// Mock the api service named exports
vi.mock('@/services/api', () => ({
	getCommunities: vi.fn(),
	getCommunityById: vi.fn(),
	getCommunityMembers: vi.fn(),
	updateCommunityMemberState: vi.fn(),
	getCommunityDashboardStats: vi.fn(),
	createCommunity: vi.fn(),
	updateCommunity: vi.fn(),
	deleteCommunity: vi.fn(),
	importMembersFromRetreat: vi.fn(),
	getParticipantsByRetreat: vi.fn(),
	removeCommunityMember: vi.fn(),
	getCommunityMeetings: vi.fn(),
	createCommunityMeeting: vi.fn(),
	getCommunityAttendance: vi.fn(),
	recordCommunityAttendance: vi.fn(),
	getCommunityAdmins: vi.fn(),
	getCommunityInvitationStatus: vi.fn(),
	acceptCommunityInvitation: vi.fn(),
	inviteCommunityAdmin: vi.fn(),
	revokeCommunityAdmin: vi.fn(),
}));

// Mock @repo/ui useToast
vi.mock('@repo/ui', () => ({
	useToast: () => ({
		toast: vi.fn(),
	}),
}));

describe('CommunityStore', () => {
	let store: any;
	let useCommunityStore: any;

	const mockCommunities = [
		{ id: 'comm-1', name: 'Community 1', address1: 'Addr 1' },
		{ id: 'comm-2', name: 'Community 2', address1: 'Addr 2' },
	];

	beforeEach(async () => {
		setActivePinia(createPinia());
		const communityStoreModule = await import('../communityStore');
		useCommunityStore = communityStoreModule.useCommunityStore;
		store = useCommunityStore();
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe('Initial State', () => {
		it('should initialize with empty state', () => {
			expect(store.communities).toEqual([]);
			expect(store.loading).toBe(false);
			expect(store.currentCommunity).toBeNull();
		});
	});

	describe('Fetch Communities', () => {
		it('should fetch communities successfully', async () => {
			(api.getCommunities as any).mockResolvedValue(mockCommunities);

			await store.fetchCommunities();

			expect(api.getCommunities).toHaveBeenCalled();
			expect(store.communities).toEqual(mockCommunities);
			expect(store.loading).toBe(false);
		});
	});

	describe('Community Selection', () => {
		it('should fetch a single community and set as current', async () => {
			const community = mockCommunities[0];
			(api.getCommunityById as any).mockResolvedValue(community);

			await store.fetchCommunity('comm-1');

			expect(api.getCommunityById).toHaveBeenCalledWith('comm-1');
			expect(store.currentCommunity).toEqual(community);
		});
	});

	describe('Member Management', () => {
		it('should fetch community members', async () => {
			const mockMembers = [{ id: 'm1', participant: { firstName: 'John' } }];
			(api.getCommunityMembers as any).mockResolvedValue(mockMembers);

			await store.fetchMembers('comm-1');

			expect(api.getCommunityMembers).toHaveBeenCalledWith('comm-1', undefined);
			expect(store.members).toEqual(mockMembers);
		});

		it('should update member state', async () => {
			const updatedMember = { id: 'm1', state: 'active_member' };
			(api.updateCommunityMemberState as any).mockResolvedValue(updatedMember);

			store.members = [{ id: 'm1', state: 'no_answer' }];
			await store.updateMemberState('comm-1', 'm1', 'active_member');

			expect(api.updateCommunityMemberState).toHaveBeenCalledWith('comm-1', 'm1', 'active_member');
			expect(store.members[0].state).toBe('active_member');
		});
	});

	describe('Dashboard Data', () => {
		it('should fetch dashboard stats', async () => {
			const mockStats = { memberCount: 10, meetingCount: 5 };
			(api.getCommunityDashboardStats as any).mockResolvedValue(mockStats);

			await store.fetchDashboardStats('comm-1');

			expect(api.getCommunityDashboardStats).toHaveBeenCalledWith('comm-1');
			expect(store.stats).toEqual(mockStats);
		});
	});

	describe('Admin Management', () => {
		it('should fetch community admins', async () => {
			const mockAdmins = [
				{
					id: 'admin-1',
					userId: 'user-1',
					communityId: 'comm-1',
					role: 'admin',
					status: 'active',
					user: { id: 'user-1', displayName: 'Admin User', email: 'admin@example.com' },
				},
				{
					id: 'admin-2',
					userId: 'user-2',
					communityId: 'comm-1',
					role: 'admin',
					status: 'pending',
					invitationToken: 'token-123',
					user: { id: 'user-2', displayName: 'Pending User', email: 'pending@example.com' },
				},
			];
			(api.getCommunityAdmins as any).mockResolvedValue(mockAdmins);

			await store.fetchAdmins('comm-1');

			expect(api.getCommunityAdmins).toHaveBeenCalledWith('comm-1');
			expect(store.admins).toEqual(mockAdmins);
		});

		it('should invite admin to community', async () => {
			const mockInvitation = {
				id: 'admin-2',
				userId: 'user-2',
				communityId: 'comm-1',
				role: 'admin',
				status: 'pending',
				invitationToken: 'token-abc123',
				invitationExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
				user: { id: 'user-2', displayName: 'New Admin', email: 'newadmin@example.com' },
			};
			(api.inviteCommunityAdmin as any).mockResolvedValue(mockInvitation);

			const result = await store.inviteAdmin('comm-1', 'newadmin@example.com');

			expect(api.inviteCommunityAdmin).toHaveBeenCalledWith('comm-1', 'newadmin@example.com');
			expect(result).toEqual(mockInvitation);
			expect(store.admins).toContainEqual(mockInvitation);
		});

		it('should revoke admin access', async () => {
			const mockAdmins = [
				{
					id: 'admin-1',
					userId: 'user-1',
					communityId: 'comm-1',
					role: 'admin',
					status: 'active',
					user: { id: 'user-1', displayName: 'Admin User', email: 'admin@example.com' },
				},
			];
			(api.getCommunityAdmins as any).mockResolvedValue(mockAdmins);
			(api.revokeCommunityAdmin as any).mockResolvedValue(undefined);

			store.admins = [...mockAdmins];
			await store.revokeAdmin('comm-1', 'user-1');

			expect(api.revokeCommunityAdmin).toHaveBeenCalledWith('comm-1', 'user-1');
			expect(store.admins).not.toContainEqual(mockAdmins[0]);
		});

		it('should handle invite admin error gracefully', async () => {
			const mockError = new Error('User not found');
			(api.inviteCommunityAdmin as any).mockRejectedValue(mockError);

			await expect(store.inviteAdmin('comm-1', 'nonexistent@example.com')).rejects.toThrow(
				'User not found',
			);
			expect(api.inviteCommunityAdmin).toHaveBeenCalledWith('comm-1', 'nonexistent@example.com');
		});
	});

	describe('Invitation Validation', () => {
		it('should get community invitation status', async () => {
			const mockStatus = {
				valid: true,
				community: { id: 'comm-1', name: 'Test Community' },
				user: { id: 'user-1', email: 'invited@example.com' },
				invitationExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
			};
			(api.getCommunityInvitationStatus as any).mockResolvedValue({ data: mockStatus });

			const result = await api.getCommunityInvitationStatus('token-abc123');

			expect(api.getCommunityInvitationStatus).toHaveBeenCalledWith('token-abc123');
			expect(result.data).toEqual(mockStatus);
		});

		it('should accept community invitation', async () => {
			const mockAcceptedAdmin = {
				id: 'admin-1',
				userId: 'user-1',
				communityId: 'comm-1',
				role: 'admin',
				status: 'active',
				acceptedAt: new Date(),
				user: { id: 'user-1', displayName: 'Admin User', email: 'admin@example.com' },
			};
			(api.acceptCommunityInvitation as any).mockResolvedValue(mockAcceptedAdmin);

			const result = await api.acceptCommunityInvitation('token-abc123');

			expect(api.acceptCommunityInvitation).toHaveBeenCalledWith('token-abc123');
			expect(result).toEqual(mockAcceptedAdmin);
		});
	});
});
