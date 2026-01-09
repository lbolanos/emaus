import { setupTestDatabase, teardownTestDatabase, clearTestData } from '../test-setup';
import { TestDataFactory } from '../test-utils/testDataFactory';
import { User } from '@/entities/user.entity';
import { Community } from '@/entities/community.entity';
import { Retreat } from '@/entities/retreat.entity';
import { CommunityService } from '@/services/communityService';
import { MemberStateEnum } from '@repo/types';

describe('Community Service', () => {
	let testUser: User;
	let testCommunity: Community;
	let testRetreat: Retreat;
	let service: CommunityService;

	beforeAll(async () => {
		await setupTestDatabase();
		service = new CommunityService();
	});

	afterAll(async () => {
		await teardownTestDatabase();
	});

	beforeEach(async () => {
		await clearTestData();
		testUser = await TestDataFactory.createTestUser();
		testCommunity = await TestDataFactory.createTestCommunity(testUser.id);
		testRetreat = await TestDataFactory.createTestRetreat();
	});

	describe('createCommunity', () => {
		it('should create a community', async () => {
			const data = {
				name: 'New Community',
				address1: '123 Main St',
				city: 'Test City',
				state: 'TS',
				zipCode: '12345',
				country: 'Test Country',
			};
			const community = await service.createCommunity(data, testUser.id);
			expect(community).toBeDefined();
			expect(community.name).toBe(data.name);
			expect(community.createdBy).toBe(testUser.id);
		});
	});

	describe('getCommunities', () => {
		it('should return communities for a user', async () => {
			const communities = await service.getCommunities(testUser.id);
			expect(communities.length).toBeGreaterThan(0);
			expect(communities[0].id).toBe(testCommunity.id);
		});
	});

	describe('Member Management', () => {
		it('should import members from retreat', async () => {
			const p1 = await TestDataFactory.createTestParticipant(testRetreat.id);
			const p2 = await TestDataFactory.createTestParticipant(testRetreat.id);

			const result = await service.importFromRetreat(testCommunity.id, testRetreat.id, [
				p1.id,
				p2.id,
			]);

			expect(result.length).toBe(2);

			const members = await service.getMembers(testCommunity.id);
			expect(members.length).toBe(2);
		});

		it('should update member state', async () => {
			const p = await TestDataFactory.createTestParticipant(testRetreat.id);
			const member = await TestDataFactory.createTestCommunityMember(testCommunity.id, p.id);

			const updated = await service.updateMemberState(
				member.id,
				MemberStateEnum.Enum.far_from_location,
			);

			expect(updated?.state).toBe(MemberStateEnum.Enum.far_from_location);
		});
	});

	describe('Meeting & Attendance', () => {
		it('should create a meeting and record attendance', async () => {
			const p = await TestDataFactory.createTestParticipant(testRetreat.id);
			const member = await TestDataFactory.createTestCommunityMember(testCommunity.id, p.id);

			const meeting = await service.createMeeting(testCommunity.id, {
				title: 'First Meeting',
				startDate: new Date(),
				durationMinutes: 60,
			});

			expect(meeting).toBeDefined();

			await service.recordAttendance(meeting.id, [{ memberId: member.id, attended: true }]);

			const attendance = await service.getAttendance(meeting.id);
			expect(attendance.length).toBe(1);
			expect(attendance[0].attended).toBe(true);
		});
	});

	describe('Dashboard Stats', () => {
		it('should calculate dashboard stats', async () => {
			const p = await TestDataFactory.createTestParticipant(testRetreat.id);
			await TestDataFactory.createTestCommunityMember(testCommunity.id, p.id, {
				state: MemberStateEnum.Enum.active_member,
			});

			const stats = await service.getDashboardStats(testCommunity.id);

			expect(stats.memberCount).toBe(1);
			expect(Array.isArray(stats.memberStateDistribution)).toBe(true);
			expect(
				stats.memberStateDistribution.find((s: any) => s.state === 'active_member')?.count,
			).toBe(1);
		});
	});

	describe('Admin Logic', () => {
		it('should invite an admin', async () => {
			const invitation = await service.inviteAdmin(testCommunity.id, testUser.email, testUser.id);

			expect(invitation).toBeDefined();
			expect(invitation.status).toBe('pending');
			expect(invitation.invitationToken).toBeDefined();
		});
	});
});
