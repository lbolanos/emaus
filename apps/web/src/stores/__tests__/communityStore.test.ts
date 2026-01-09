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
});
