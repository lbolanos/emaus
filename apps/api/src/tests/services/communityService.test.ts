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

	describe('createNextMeetingInstance', () => {
		it('should create next instance for weekly recurrence', async () => {
			// Use a future date
			const baseDate = new Date();
			baseDate.setDate(baseDate.getDate() + 7); // Next week

			const meeting = await service.createMeeting(testCommunity.id, {
				title: 'Weekly Meeting',
				startDate: baseDate,
				durationMinutes: 60,
				recurrenceFrequency: 'weekly',
			});

			const nextInstance = await service.createNextMeetingInstance(meeting.id);

			expect(nextInstance).toBeDefined();
			expect(nextInstance.parentMeetingId).toBe(meeting.id);
			expect(nextInstance.recurrenceFrequency).toBe('weekly'); // Kept for next instance
			expect(new Date(nextInstance.startDate).getTime()).toBeGreaterThan(new Date().getTime()); // Should be in future
		});

		it('should create next instance for monthly recurrence', async () => {
			// Use a future date
			const baseDate = new Date();
			baseDate.setMonth(baseDate.getMonth() + 1); // Next month

			const meeting = await service.createMeeting(testCommunity.id, {
				title: 'Monthly Meeting',
				startDate: baseDate,
				durationMinutes: 90,
				recurrenceFrequency: 'monthly',
			});

			const nextInstance = await service.createNextMeetingInstance(meeting.id);

			expect(nextInstance).toBeDefined();
			expect(nextInstance.durationMinutes).toBe(90); // Preserve duration
			expect(new Date(nextInstance.startDate).getTime()).toBeGreaterThan(new Date().getTime()); // Should be in future
		});

		it('should create next instance for daily recurrence', async () => {
			// Use a future date
			const baseDate = new Date();
			baseDate.setDate(baseDate.getDate() + 7); // Next week

			const meeting = await service.createMeeting(testCommunity.id, {
				title: 'Daily Meeting',
				startDate: baseDate,
				durationMinutes: 30,
				recurrenceFrequency: 'daily',
			});

			const nextInstance = await service.createNextMeetingInstance(meeting.id);

			expect(nextInstance).toBeDefined();
			expect(new Date(nextInstance.startDate).getTime()).toBeGreaterThan(new Date().getTime()); // Should be in future
		});

		it('should handle day-of-month overflow gracefully', async () => {
			// Use January 31st of next year
			const baseDate = new Date();
			baseDate.setFullYear(baseDate.getFullYear() + 1);
			baseDate.setMonth(0); // January
			baseDate.setDate(31);

			const meeting = await service.createMeeting(testCommunity.id, {
				title: 'End of Month Meeting',
				startDate: baseDate,
				durationMinutes: 60,
				recurrenceFrequency: 'monthly',
			});

			const nextInstance = await service.createNextMeetingInstance(meeting.id);

			expect(nextInstance).toBeDefined();
			// Should successfully create a next instance (may adjust day for shorter months)
			expect(new Date(nextInstance.startDate).getTime()).toBeGreaterThan(new Date().getTime());
		});

		it('should throw error for non-recurrence template', async () => {
			const meeting = await service.createMeeting(testCommunity.id, {
				title: 'One-time Meeting',
				startDate: new Date(),
				durationMinutes: 60,
				// No recurrenceFrequency set
			});

			await expect(service.createNextMeetingInstance(meeting.id)).rejects.toThrow();
		});

		it('should preserve duration from original meeting', async () => {
			const baseDate = new Date();
			baseDate.setDate(baseDate.getDate() + 7); // Next week

			const meeting = await service.createMeeting(testCommunity.id, {
				title: 'Long Weekly Meeting',
				startDate: baseDate,
				durationMinutes: 120,
				recurrenceFrequency: 'weekly',
			});

			const nextInstance = await service.createNextMeetingInstance(meeting.id);

			expect(nextInstance.durationMinutes).toBe(120);
		});

		it('should set parentMeetingId correctly', async () => {
			const baseDate = new Date();
			baseDate.setDate(baseDate.getDate() + 7); // Next week

			const meeting = await service.createMeeting(testCommunity.id, {
				title: 'Parent Meeting',
				startDate: baseDate,
				durationMinutes: 60,
				recurrenceFrequency: 'weekly',
			});

			const nextInstance = await service.createNextMeetingInstance(meeting.id);

			expect(nextInstance.parentMeetingId).toBe(meeting.id);
			expect(nextInstance.id).not.toBe(meeting.id);
		});
	});

	describe('getMembers - Attendance Rate', () => {
		it('should return 0% for members with no attendance', async () => {
			const p = await TestDataFactory.createTestParticipant(testRetreat.id);
			await TestDataFactory.createTestCommunityMember(testCommunity.id, p.id);

			const members = await service.getMembers(testCommunity.id);

			expect(members.length).toBe(1);
			expect(members[0].lastMeetingsAttendanceRate).toBe(0);
			expect(members[0].lastMeetingsFrequency).toBe('none');
		});

		it('should return 100% for members attending all meetings', async () => {
			const p = await TestDataFactory.createTestParticipant(testRetreat.id);
			const member = await TestDataFactory.createTestCommunityMember(testCommunity.id, p.id);

			// Create 3 meetings
			const meeting1 = await service.createMeeting(testCommunity.id, {
				title: 'Meeting 1',
				startDate: new Date(),
				durationMinutes: 60,
			});
			const meeting2 = await service.createMeeting(testCommunity.id, {
				title: 'Meeting 2',
				startDate: new Date(),
				durationMinutes: 60,
			});
			const meeting3 = await service.createMeeting(testCommunity.id, {
				title: 'Meeting 3',
				startDate: new Date(),
				durationMinutes: 60,
			});

			// Attend all meetings
			await service.recordAttendance(meeting1.id, [{ memberId: member.id, attended: true }]);
			await service.recordAttendance(meeting2.id, [{ memberId: member.id, attended: true }]);
			await service.recordAttendance(meeting3.id, [{ memberId: member.id, attended: true }]);

			const members = await service.getMembers(testCommunity.id);

			expect(members[0].lastMeetingsAttendanceRate).toBe(100);
			expect(members[0].lastMeetingsFrequency).toBe('high');
		});

		it('should calculate rate for members with partial attendance', async () => {
			const p = await TestDataFactory.createTestParticipant(testRetreat.id);
			const member = await TestDataFactory.createTestCommunityMember(testCommunity.id, p.id);

			// Create 4 meetings
			const meetings = [];
			for (let i = 0; i < 4; i++) {
				const meeting = await service.createMeeting(testCommunity.id, {
					title: `Meeting ${i}`,
					startDate: new Date(),
					durationMinutes: 60,
				});
				meetings.push(meeting);
			}

			// Attend 2 out of 4 meetings
			await service.recordAttendance(meetings[0].id, [{ memberId: member.id, attended: true }]);
			await service.recordAttendance(meetings[1].id, [{ memberId: member.id, attended: false }]);
			await service.recordAttendance(meetings[2].id, [{ memberId: member.id, attended: true }]);
			await service.recordAttendance(meetings[3].id, [{ memberId: member.id, attended: false }]);

			const members = await service.getMembers(testCommunity.id);

			expect(members[0].lastMeetingsAttendanceRate).toBe(50);
			expect(members[0].lastMeetingsFrequency).toBe('medium');
		});

		it('should categorize high frequency (>=75%)', async () => {
			const p = await TestDataFactory.createTestParticipant(testRetreat.id);
			const member = await TestDataFactory.createTestCommunityMember(testCommunity.id, p.id);

			// Create 4 meetings
			const meetings = [];
			for (let i = 0; i < 4; i++) {
				const meeting = await service.createMeeting(testCommunity.id, {
					title: `Meeting ${i}`,
					startDate: new Date(),
					durationMinutes: 60,
				});
				meetings.push(meeting);
			}

			// Attend 3 out of 4 (75%)
			await service.recordAttendance(meetings[0].id, [{ memberId: member.id, attended: true }]);
			await service.recordAttendance(meetings[1].id, [{ memberId: member.id, attended: true }]);
			await service.recordAttendance(meetings[2].id, [{ memberId: member.id, attended: true }]);
			await service.recordAttendance(meetings[3].id, [{ memberId: member.id, attended: false }]);

			const members = await service.getMembers(testCommunity.id);

			expect(members[0].lastMeetingsFrequency).toBe('high');
		});

		it('should categorize medium frequency (25-74%)', async () => {
			const p = await TestDataFactory.createTestParticipant(testRetreat.id);
			const member = await TestDataFactory.createTestCommunityMember(testCommunity.id, p.id);

			// Create 4 meetings
			const meetings = [];
			for (let i = 0; i < 4; i++) {
				const meeting = await service.createMeeting(testCommunity.id, {
					title: `Meeting ${i}`,
					startDate: new Date(),
					durationMinutes: 60,
				});
				meetings.push(meeting);
			}

			// Attend 2 out of 4 (50%)
			await service.recordAttendance(meetings[0].id, [{ memberId: member.id, attended: true }]);
			await service.recordAttendance(meetings[1].id, [{ memberId: member.id, attended: true }]);
			await service.recordAttendance(meetings[2].id, [{ memberId: member.id, attended: false }]);
			await service.recordAttendance(meetings[3].id, [{ memberId: member.id, attended: false }]);

			const members = await service.getMembers(testCommunity.id);

			expect(members[0].lastMeetingsFrequency).toBe('medium');
		});

		it('should categorize low frequency (1-24%)', async () => {
			const p = await TestDataFactory.createTestParticipant(testRetreat.id);
			const member = await TestDataFactory.createTestCommunityMember(testCommunity.id, p.id);

			// Create 5 meetings
			const meetings = [];
			for (let i = 0; i < 5; i++) {
				const meeting = await service.createMeeting(testCommunity.id, {
					title: `Meeting ${i}`,
					startDate: new Date(),
					durationMinutes: 60,
				});
				meetings.push(meeting);
			}

			// Attend 1 out of 5 (20%)
			await service.recordAttendance(meetings[0].id, [{ memberId: member.id, attended: true }]);
			await service.recordAttendance(meetings[1].id, [{ memberId: member.id, attended: false }]);
			await service.recordAttendance(meetings[2].id, [{ memberId: member.id, attended: false }]);
			await service.recordAttendance(meetings[3].id, [{ memberId: member.id, attended: false }]);
			await service.recordAttendance(meetings[4].id, [{ memberId: member.id, attended: false }]);

			const members = await service.getMembers(testCommunity.id);

			expect(members[0].lastMeetingsFrequency).toBe('low');
		});

		it('should categorize none frequency (0%)', async () => {
			const p = await TestDataFactory.createTestParticipant(testRetreat.id);
			await TestDataFactory.createTestCommunityMember(testCommunity.id, p.id);

			// Create meetings but don't attend
			await service.createMeeting(testCommunity.id, {
				title: 'Meeting 1',
				startDate: new Date(),
				durationMinutes: 60,
			});

			const members = await service.getMembers(testCommunity.id);

			expect(members[0].lastMeetingsFrequency).toBe('none');
		});

		it('should sort by attendance rate descending', async () => {
			const p1 = await TestDataFactory.createTestParticipant(testRetreat.id);
			const p2 = await TestDataFactory.createTestParticipant(testRetreat.id);
			const p3 = await TestDataFactory.createTestParticipant(testRetreat.id);
			const m1 = await TestDataFactory.createTestCommunityMember(testCommunity.id, p1.id);
			const m2 = await TestDataFactory.createTestCommunityMember(testCommunity.id, p2.id);
			const m3 = await TestDataFactory.createTestCommunityMember(testCommunity.id, p3.id);

			const meeting = await service.createMeeting(testCommunity.id, {
				title: 'Meeting',
				startDate: new Date(),
				durationMinutes: 60,
			});

			// m1 attends, m2 and m3 don't
			await service.recordAttendance(meeting.id, [
				{ memberId: m1.id, attended: true },
				{ memberId: m2.id, attended: false },
				{ memberId: m3.id, attended: false },
			]);

			const members = await service.getMembers(testCommunity.id);

			// Should be sorted: m1 (100%), then m2 and m3 (0%)
			expect(members[0].id).toBe(m1.id);
			expect(members[0].lastMeetingsAttendanceRate).toBe(100);
		});
	});

	describe('getPublicAttendanceData', () => {
		it('should return data for valid community and meeting', async () => {
			const p1 = await TestDataFactory.createTestParticipant(testRetreat.id, {
				firstName: 'Juan',
				lastName: 'Perez',
			});
			const p2 = await TestDataFactory.createTestParticipant(testRetreat.id, {
				firstName: 'Maria',
				lastName: 'Garcia',
			});
			const m1 = await TestDataFactory.createTestCommunityMember(testCommunity.id, p1.id);
			const m2 = await TestDataFactory.createTestCommunityMember(testCommunity.id, p2.id);

			const meeting = await service.createMeeting(testCommunity.id, {
				title: 'Public Meeting',
				startDate: new Date(),
				durationMinutes: 60,
			});

			await service.recordAttendance(meeting.id, [
				{ memberId: m1.id, attended: true },
				{ memberId: m2.id, attended: false },
			]);

			const data = await service.getPublicAttendanceData(testCommunity.id, meeting.id);

			expect(data).toBeDefined();
			expect(data.meetingId).toBe(meeting.id);
			expect(data.meetingTitle).toBe('Public Meeting');
			expect(data.communityId).toBe(testCommunity.id);
			expect(data.members.length).toBe(2);

			// Find Juan and Maria by name (order not guaranteed)
			const juan = data.members.find((m: any) => m.participant.firstName === 'Juan');
			const maria = data.members.find((m: any) => m.participant.firstName === 'Maria');

			expect(juan).toBeDefined();
			expect(juan.participant.lastName).toBe('Perez');
			expect(juan.attended).toBe(true);

			expect(maria).toBeDefined();
			expect(maria.participant.lastName).toBe('Garcia');
			expect(maria.attended).toBe(false);
		});

		it('should return null for non-existent community', async () => {
			const meeting = await service.createMeeting(testCommunity.id, {
				title: 'Meeting',
				startDate: new Date(),
				durationMinutes: 60,
			});

			const data = await service.getPublicAttendanceData('non-community-id', meeting.id);

			expect(data).toBeNull();
		});

		it('should return null for non-existent meeting', async () => {
			const data = await service.getPublicAttendanceData(testCommunity.id, 'non-meeting-id');

			expect(data).toBeNull();
		});

		it('should include all members with attendance status', async () => {
			const participants = await Promise.all([
				TestDataFactory.createTestParticipant(testRetreat.id),
				TestDataFactory.createTestParticipant(testRetreat.id),
				TestDataFactory.createTestParticipant(testRetreat.id),
			]);

			const members = await Promise.all(
				participants.map((p) => TestDataFactory.createTestCommunityMember(testCommunity.id, p.id)),
			);

			const meeting = await service.createMeeting(testCommunity.id, {
				title: 'Meeting',
				startDate: new Date(),
				durationMinutes: 60,
			});

			await service.recordAttendance(meeting.id, [
				{ memberId: members[0].id, attended: true },
				{ memberId: members[1].id, attended: false },
				{ memberId: members[2].id, attended: true },
			]);

			const data = await service.getPublicAttendanceData(testCommunity.id, meeting.id);

			expect(data.members.length).toBe(3);
			expect(data.members.every((m: any) => 'attended' in m)).toBe(true);
		});
	});

	describe('importFromRetreat - Edge Cases', () => {
		it('should return existing members for already imported participants', async () => {
			const p1 = await TestDataFactory.createTestParticipant(testRetreat.id);
			const p2 = await TestDataFactory.createTestParticipant(testRetreat.id);

			// Import p1 first
			await service.importFromRetreat(testCommunity.id, testRetreat.id, [p1.id]);

			// Try to import both - should return both (p1 existing, p2 new)
			const result = await service.importFromRetreat(testCommunity.id, testRetreat.id, [
				p1.id,
				p2.id,
			]);

			expect(result.length).toBe(2); // Both returned
			expect(result[0].participantId).toBe(p1.id);
			expect(result[1].participantId).toBe(p2.id);
		});

		it('should handle empty participant list', async () => {
			const result = await service.importFromRetreat(testCommunity.id, testRetreat.id, []);

			expect(result.length).toBe(0);
		});

		it('should not validate retreat existence', async () => {
			// The service doesn't validate retreatId, it just tries to add members
			const p = await TestDataFactory.createTestParticipant(testRetreat.id);

			// This will work because retreatId isn't validated against participant's retreat
			const result = await service.importFromRetreat(testCommunity.id, 'any-retreat-id', [p.id]);

			expect(result.length).toBe(1);
		});

		it('should set initial state to active_member', async () => {
			const p = await TestDataFactory.createTestParticipant(testRetreat.id);

			await service.importFromRetreat(testCommunity.id, testRetreat.id, [p.id]);

			const members = await service.getMembers(testCommunity.id);
			expect(members[0].state).toBe('active_member');
		});

		it('should handle non-existent participants with foreign key error', async () => {
			// This will cause a foreign key constraint error
			// The service doesn't handle this gracefully, so we expect it to fail
			await expect(
				service.importFromRetreat(testCommunity.id, testRetreat.id, ['non-existent-id']),
			).rejects.toThrow();
		});
	});
});
