import { setupTestDatabase, teardownTestDatabase, clearTestData } from '../test-setup';
import { TestDataFactory } from '../test-utils/testDataFactory';
import { User } from '@/entities/user.entity';
import { Community } from '@/entities/community.entity';
import { Retreat } from '@/entities/retreat.entity';
import { CommunityService } from '@/services/communityService';
import { MemberStateEnum } from '@repo/types';
import { AppDataSource } from '@/data-source';
import { CommunityAdmin } from '@/entities/communityAdmin.entity';

// Mock EmailService antes de cargar el servicio. Factory sin referencias externas
// (regla del proyecto con ESM experimental — ver test-setup.ts).
// Usamos globalThis.__sentEmails como bus observable porque jest.requireMock
// puede tener contextos distintos con ESM y el mock.calls puede no exponerse.
jest.mock('@/services/emailService', () => ({
	EmailService: jest.fn(() => ({
		sendEmail: jest.fn(async (data: any) => {
			(globalThis as any).__sentEmails ||= [];
			(globalThis as any).__sentEmails.push(data);
			return true;
		}),
		isSmtpConfigured: jest.fn().mockReturnValue(true),
	})),
}));

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

		it('should include memberCount in communities', async () => {
			// Create some members for the test community
			const p1 = await TestDataFactory.createTestParticipant(testRetreat.id);
			const p2 = await TestDataFactory.createTestParticipant(testRetreat.id);
			await TestDataFactory.createTestCommunityMember(testCommunity.id, p1.id);
			await TestDataFactory.createTestCommunityMember(testCommunity.id, p2.id);

			const communities = await service.getCommunities(testUser.id);
			expect(communities.length).toBeGreaterThan(0);
			expect(communities[0].memberCount).toBe(2);
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

			const { meeting: nextInstance } = await service.createNextMeetingInstance(meeting.id);

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

			const { meeting: nextInstance } = await service.createNextMeetingInstance(meeting.id);

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

			const { meeting: nextInstance } = await service.createNextMeetingInstance(meeting.id);

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

			const { meeting: nextInstance } = await service.createNextMeetingInstance(meeting.id);

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

			const { meeting: nextInstance } = await service.createNextMeetingInstance(meeting.id);

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

			const { meeting: nextInstance } = await service.createNextMeetingInstance(meeting.id);

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

		it('SECURITY: solo expone miembros con state=active_member (no pending/no_answer/etc)', async () => {
			// Crear 4 miembros con distintos estados
			const pActive1 = await TestDataFactory.createTestParticipant(testRetreat.id);
			const pActive2 = await TestDataFactory.createTestParticipant(testRetreat.id);
			const pPending = await TestDataFactory.createTestParticipant(testRetreat.id);
			const pAnotherGroup = await TestDataFactory.createTestParticipant(testRetreat.id);

			const partRepo = AppDataSource.getRepository(
				require('@/entities/participant.entity').Participant,
			);
			await partRepo.update(pActive1.id, { firstName: 'Active', lastName: 'One' });
			await partRepo.update(pActive2.id, { firstName: 'Active', lastName: 'Two' });
			await partRepo.update(pPending.id, { firstName: 'Pending', lastName: 'User' });
			await partRepo.update(pAnotherGroup.id, { firstName: 'Other', lastName: 'Group' });

			const m1 = await service.addMember(testCommunity.id, pActive1.id);
			const m2 = await service.addMember(testCommunity.id, pActive2.id);
			const m3 = await service.addMember(testCommunity.id, pPending.id);
			const m4 = await service.addMember(testCommunity.id, pAnotherGroup.id);

			// Cambiar estados (omitir notify para evitar emails en este test)
			await service.updateMemberState(m3.id, 'pending_verification', testUser.id);
			await service.updateMemberState(m4.id, 'another_group', testUser.id);

			const meeting = await service.createMeeting(testCommunity.id, {
				title: 'Meeting filtrado',
				startDate: new Date(Date.now() + 86_400_000),
				durationMinutes: 60,
			});

			const data = await service.getPublicAttendanceData(testCommunity.id, meeting.id);

			// Solo los 2 active_member deben aparecer
			expect(data!.members.length).toBe(2);
			const firstNames = data!.members.map((m: any) => m.participant.firstName).sort();
			expect(firstNames).toEqual(['Active', 'Active']);
			// Pending y Other NO deben aparecer
			expect(data!.members.find((m: any) => m.participant.firstName === 'Pending')).toBeUndefined();
			expect(data!.members.find((m: any) => m.participant.firstName === 'Other')).toBeUndefined();
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

	describe('createPublicJoinRequest — notificaciones', () => {
		const getSent = () => ((globalThis as any).__sentEmails as any[]) || [];

		beforeEach(() => {
			(globalThis as any).__sentEmails = [];
		});

		it('crea el miembro y dispara notificaciones a admins + solicitante', async () => {
			const adminUser = await TestDataFactory.createTestUser({
				email: 'admin@test.com',
				displayName: 'Admin User',
			});
			const adminRepo = AppDataSource.getRepository(CommunityAdmin);
			await adminRepo.save(
				adminRepo.create({
					communityId: testCommunity.id,
					userId: adminUser.id,
					role: 'admin',
					status: 'active',
					invitedBy: testUser.id,
					invitedAt: new Date(),
					acceptedAt: new Date(),
				}),
			);

			const member = await service.createPublicJoinRequest(testCommunity.id, {
				firstName: 'Juan',
				lastName: 'Pérez',
				email: 'juan@test.com',
				cellPhone: '555-1234',
			});

			expect(member).toBeTruthy();
			expect(member!.state).toBe('pending_verification');

			// Esperar a que la fire-and-forget termine
			await new Promise((r) => setTimeout(r, 100));

			const sent = getSent();
			expect(sent.length).toBeGreaterThanOrEqual(2);

			const adminEmail = sent.find((e) => e.to === 'admin@test.com');
			expect(adminEmail).toBeTruthy();
			expect(adminEmail.subject).toContain(testCommunity.name);
			expect(adminEmail.html).toContain('Juan');
			expect(adminEmail.html).toContain('juan@test.com');

			const requesterEmail = sent.find((e) => e.to === 'juan@test.com');
			expect(requesterEmail).toBeTruthy();
			expect(requesterEmail.subject).toContain('Recibimos tu solicitud');
			expect(requesterEmail.html).toContain('Juan');
		});

		it('escapa HTML del solicitante para prevenir XSS en el email', async () => {
			const adminUser = await TestDataFactory.createTestUser({
				email: 'admin2@test.com',
				displayName: 'Admin Owner',
			});
			const adminRepo = AppDataSource.getRepository(CommunityAdmin);
			await adminRepo.save(
				adminRepo.create({
					communityId: testCommunity.id,
					userId: adminUser.id,
					role: 'owner',
					status: 'active',
					invitedBy: testUser.id,
					invitedAt: new Date(),
					acceptedAt: new Date(),
				}),
			);

			await service.createPublicJoinRequest(testCommunity.id, {
				firstName: '<script>alert(1)</script>',
				lastName: 'Hacker',
				email: 'hack@test.com',
			});

			await new Promise((r) => setTimeout(r, 100));

			const sent = getSent();
			const adminEmail = sent.find((e) => e.to === 'admin2@test.com');
			expect(adminEmail).toBeTruthy();
			expect(adminEmail.html).not.toContain('<script>alert(1)</script>');
			expect(adminEmail.html).toContain('&lt;script&gt;');
		});

		it('NO falla la creación si la notificación falla', async () => {
			// notifyJoinRequest tiene su propio try/catch — si todo falla, la creación
			// del miembro debe seguir devolviendo el resultado.
			const memberPromise = service.createPublicJoinRequest(testCommunity.id, {
				firstName: 'Robust',
				lastName: 'Test',
				email: 'robust@test.com',
			});

			await expect(memberPromise).resolves.toBeTruthy();
		});

		it('envía solo el email al solicitante si no hay admins activos', async () => {
			// El factory crea un admin owner por defecto — lo borramos para este test
			const adminRepo = AppDataSource.getRepository(CommunityAdmin);
			await adminRepo.delete({ communityId: testCommunity.id });

			await service.createPublicJoinRequest(testCommunity.id, {
				firstName: 'Solo',
				lastName: 'User',
				email: 'solo@test.com',
			});

			await new Promise((r) => setTimeout(r, 100));

			const sent = getSent();
			// Sin admins, solo debe haber el email al solicitante
			expect(sent.length).toBe(1);
			expect(sent[0].to).toBe('solo@test.com');
			expect(sent[0].subject).toContain('Recibimos tu solicitud');
		});

		it('notifica a TODOS los admins activos (múltiples destinatarios)', async () => {
			const adminRepo = AppDataSource.getRepository(CommunityAdmin);
			const admin1 = await TestDataFactory.createTestUser({ email: 'admin1@test.com' });
			const admin2 = await TestDataFactory.createTestUser({ email: 'admin2@test.com' });
			const admin3 = await TestDataFactory.createTestUser({ email: 'admin3@test.com' });
			for (const [user, role] of [
				[admin1, 'admin'],
				[admin2, 'admin'],
				[admin3, 'owner'],
			] as const) {
				await adminRepo.save(
					adminRepo.create({
						communityId: testCommunity.id,
						userId: user.id,
						role,
						status: 'active',
						invitedBy: testUser.id,
						invitedAt: new Date(),
						acceptedAt: new Date(),
					}),
				);
			}

			await service.createPublicJoinRequest(testCommunity.id, {
				firstName: 'Multi',
				lastName: 'Admins',
				email: 'multi@test.com',
			});
			await new Promise((r) => setTimeout(r, 100));

			const sent = getSent();
			const adminRecipients = sent.map((e) => e.to).filter((to) => to !== 'multi@test.com');
			expect(adminRecipients).toContain('admin1@test.com');
			expect(adminRecipients).toContain('admin2@test.com');
			expect(adminRecipients).toContain('admin3@test.com');
		});

		it('omite admin sin email configurado (user.email vacío)', async () => {
			const adminRepo = AppDataSource.getRepository(CommunityAdmin);
			// Admin con user que NO tiene email — el factory siempre asigna pero
			// vamos a crear uno y vaciar el email manualmente.
			const noEmailUser = await TestDataFactory.createTestUser({ email: 'temp@test.com' });
			const userRepo = AppDataSource.getRepository(User);
			await userRepo.update(noEmailUser.id, { email: '' as any });
			await adminRepo.save(
				adminRepo.create({
					communityId: testCommunity.id,
					userId: noEmailUser.id,
					role: 'admin',
					status: 'active',
					invitedBy: testUser.id,
					invitedAt: new Date(),
					acceptedAt: new Date(),
				}),
			);

			await service.createPublicJoinRequest(testCommunity.id, {
				firstName: 'NoEmail',
				lastName: 'Admin',
				email: 'requester@test.com',
			});
			await new Promise((r) => setTimeout(r, 100));

			const sent = getSent();
			// Solicitante sí recibe
			expect(sent.find((e) => e.to === 'requester@test.com')).toBeTruthy();
			// Admin sin email NO recibe (no debe haber email con to=''
			expect(sent.find((e) => e.to === '')).toBeUndefined();
		});

		it('no crashea si la comunidad ya no existe al notificar', async () => {
			// Pre-crear miembro pero borrar la comunidad antes de que notifyJoinRequest se dispare
			// Llamando notifyJoinRequest directamente con communityId inexistente
			const fakeParticipant: any = {
				firstName: 'Ghost',
				lastName: 'Test',
				email: 'ghost@test.com',
				cellPhone: '',
			};

			await expect(
				service.notifyJoinRequest('non-existent-community-id', fakeParticipant),
			).resolves.toBeUndefined();
		});

		it('rechaza con ALREADY_MEMBER al detectar duplicado dentro de la transacción', async () => {
			// Primera solicitud OK
			await service.createPublicJoinRequest(testCommunity.id, {
				firstName: 'First',
				lastName: 'Try',
				email: 'dup@test.com',
			});

			// Segunda solicitud con el mismo email debe fallar con ALREADY_MEMBER
			await expect(
				service.createPublicJoinRequest(testCommunity.id, {
					firstName: 'Second',
					lastName: 'Try',
					email: 'dup@test.com',
				}),
			).rejects.toMatchObject({ code: 'ALREADY_MEMBER' });
		});

		it('match case-insensitive del email al detectar duplicado', async () => {
			await service.createPublicJoinRequest(testCommunity.id, {
				firstName: 'Lower',
				lastName: 'Case',
				email: 'mixed@TEST.com',
			});

			await expect(
				service.createPublicJoinRequest(testCommunity.id, {
					firstName: 'Upper',
					lastName: 'Case',
					email: 'MIXED@test.com',
				}),
			).rejects.toMatchObject({ code: 'ALREADY_MEMBER' });
		});

		it('NO notifica a admins con status=pending o role=viewer', async () => {
			// Admin pendiente
			const pendingUser = await TestDataFactory.createTestUser({ email: 'pending@test.com' });
			const adminRepo = AppDataSource.getRepository(CommunityAdmin);
			await adminRepo.save(
				adminRepo.create({
					communityId: testCommunity.id,
					userId: pendingUser.id,
					role: 'admin',
					status: 'pending',
					invitedBy: testUser.id,
					invitedAt: new Date(),
				}),
			);

			await service.createPublicJoinRequest(testCommunity.id, {
				firstName: 'Tester',
				lastName: 'User',
				email: 'tester@test.com',
			});

			await new Promise((r) => setTimeout(r, 100));

			const sent = getSent();
			// pending admin no debe recibir
			expect(sent.find((e) => e.to === 'pending@test.com')).toBeUndefined();
			// solicitante sí
			expect(sent.find((e) => e.to === 'tester@test.com')).toBeTruthy();
		});
	});

	// ─── G: Audit log ─────────────────────────────────────────────────────

	describe('CommunityAuditLog (G)', () => {
		it('persiste un evento de audit directo via repo (smoke test)', async () => {
			// Persistir directo via repo evita el path-alias issue del singleton service
			// dentro del test ESM. El service real lo prueba el E2E HTTP.
			const { CommunityAuditLog } = await import('@/entities/communityAuditLog.entity');
			const repo = AppDataSource.getRepository(CommunityAuditLog);
			const entry = repo.create({
				action: 'community.update',
				resourceType: 'community',
				resourceId: testCommunity.id,
				communityId: testCommunity.id,
				actorUserId: testUser.id,
				metadata: JSON.stringify({ changedFields: ['name'] }),
				ipAddress: '127.0.0.1',
				userAgent: 'TestRunner/1.0',
			});
			await repo.save(entry);

			const rows = await repo.find({
				where: { communityId: testCommunity.id, action: 'community.update' },
			});
			expect(rows.length).toBeGreaterThanOrEqual(1);
			expect(rows[0].actorUserId).toBe(testUser.id);
			expect(rows[0].ipAddress).toBe('127.0.0.1');
		});

		it('audit service silencia errores (no throw aunque insert falle)', async () => {
			const { CommunityAuditService } = await import('@/services/communityAuditService');
			const audit = new CommunityAuditService();
			await expect(
				audit.log({
					action: 'test.action',
					resourceType: 'test',
				} as any),
			).resolves.toBeUndefined();
		});
	});

	// ─── P2: Trimming de PII según rol del viewer ──────────────────────────

	describe('getMembersForViewer — SECURITY trimming', () => {
		const setupCommunityWithPiiMember = async () => {
			const community = await TestDataFactory.createTestCommunity(testUser.id);
			const p = await TestDataFactory.createTestParticipant(testRetreat.id);
			const partRepo = AppDataSource.getRepository(
				require('@/entities/participant.entity').Participant,
			);
			await partRepo.update(p.id, {
				email: 'pii@test.com',
				cellPhone: '555-1234',
				homePhone: '555-9999',
				workPhone: '555-0000',
				street: 'Calle Secreta 42',
				postalCode: '06100',
				neighborhood: 'Roma Norte',
				hasMedication: true,
				emergencyContact1Name: 'Mamá',
				emergencyContact1CellPhone: '555-MOM',
			});
			await service.addMember(community.id, p.id);
			return community;
		};

		it('OWNER: ve PII completa (dirección, médico, contactos de emergencia)', async () => {
			const community = await setupCommunityWithPiiMember();
			// testUser es owner (creado por TestDataFactory.createTestCommunity)
			const members = await service.getMembersForViewer(community.id, {
				userId: testUser.id,
				isSuperadmin: false,
			});

			expect(members.length).toBe(1);
			const p = (members[0] as any).participant;
			expect(p.email).toBe('pii@test.com');
			expect(p.cellPhone).toBe('555-1234');
			expect(p.homePhone).toBe('555-9999');
			expect(p.street).toBe('Calle Secreta 42');
			expect(p.hasMedication).toBe(true);
			expect(p.emergencyContact1Name).toBe('Mamá');
			expect(p._trimmed).toBeUndefined();
		});

		it('SUPERADMIN: ve PII completa aunque no sea miembro de la community', async () => {
			const community = await setupCommunityWithPiiMember();
			const outsiderUser = await TestDataFactory.createTestUser({ email: 'outsider@test.com' });
			const members = await service.getMembersForViewer(community.id, {
				userId: outsiderUser.id,
				isSuperadmin: true,
			});

			expect(members.length).toBe(1);
			const p = (members[0] as any).participant;
			expect(p.street).toBe('Calle Secreta 42'); // PII visible
			expect(p._trimmed).toBeUndefined();
		});

		it('ADMIN no-owner: solo ve firstName, lastName, email, cellPhone (PII trimmed)', async () => {
			const community = await setupCommunityWithPiiMember();
			// Crear un admin distinto del owner
			const adminUser = await TestDataFactory.createTestUser({ email: 'just-admin@test.com' });
			const adminRepo = AppDataSource.getRepository(
				require('@/entities/communityAdmin.entity').CommunityAdmin,
			);
			await adminRepo.save(
				adminRepo.create({
					communityId: community.id,
					userId: adminUser.id,
					role: 'admin',
					status: 'active',
					invitedBy: testUser.id,
					invitedAt: new Date(),
					acceptedAt: new Date(),
				}),
			);

			const members = await service.getMembersForViewer(community.id, {
				userId: adminUser.id,
				isSuperadmin: false,
			});

			expect(members.length).toBe(1);
			const p = (members[0] as any).participant;
			// Campos visibles
			expect(p.email).toBe('pii@test.com');
			expect(p.cellPhone).toBe('555-1234');
			expect(p.firstName).toBeTruthy();
			expect(p.lastName).toBeTruthy();
			expect(p._trimmed).toBe(true);
			// Campos sensibles NO deben estar
			expect(p.street).toBeUndefined();
			expect(p.postalCode).toBeUndefined();
			expect(p.neighborhood).toBeUndefined();
			expect(p.homePhone).toBeUndefined();
			expect(p.workPhone).toBeUndefined();
			expect(p.hasMedication).toBeUndefined();
			expect(p.emergencyContact1Name).toBeUndefined();
			expect(p.emergencyContact1CellPhone).toBeUndefined();
		});

		it('getViewerRoleForCommunity retorna superadmin sin tocar BD si isSuperadmin=true', async () => {
			const role = await service.getViewerRoleForCommunity('any-cid', 'any-uid', true);
			expect(role).toBe('superadmin');
		});

		it('getViewerRoleForCommunity retorna null si el user no es admin activo', async () => {
			const community = await TestDataFactory.createTestCommunity(testUser.id);
			const outsider = await TestDataFactory.createTestUser({ email: 'no-role@test.com' });
			const role = await service.getViewerRoleForCommunity(outsider.id, community.id, false);
			expect(role).toBeNull();
		});

		it('getViewerRoleForCommunity diferencia owner de admin', async () => {
			const community = await TestDataFactory.createTestCommunity(testUser.id);
			// testUser es owner por TestDataFactory
			const ownerRole = await service.getViewerRoleForCommunity(testUser.id, community.id, false);
			expect(ownerRole).toBe('owner');

			// Crear un admin secundario (no-owner)
			const adminUser = await TestDataFactory.createTestUser({ email: 'second-admin@test.com' });
			const adminRepo = AppDataSource.getRepository(
				require('@/entities/communityAdmin.entity').CommunityAdmin,
			);
			await adminRepo.save(
				adminRepo.create({
					communityId: community.id,
					userId: adminUser.id,
					role: 'admin',
					status: 'active',
					invitedBy: testUser.id,
					invitedAt: new Date(),
					acceptedAt: new Date(),
				}),
			);
			const adminRole = await service.getViewerRoleForCommunity(adminUser.id, community.id, false);
			expect(adminRole).toBe('admin');
		});
	});

	// ─── G4: Vista del miembro (getMyCommunitiesWithMeetings) ──────────────

	describe('getMyCommunitiesWithMeetings (G4)', () => {
		it('devuelve las comunidades donde el user es active_member', async () => {
			const user = await TestDataFactory.createTestUser({ email: 'g4@test.com' });
			const p = await TestDataFactory.createTestParticipant(testRetreat.id);
			const partRepo = AppDataSource.getRepository(
				require('@/entities/participant.entity').Participant,
			);
			await partRepo.update(p.id, { userId: user.id });
			await service.addMember(testCommunity.id, p.id);

			const result = await service.getMyCommunitiesWithMeetings(user.id);
			expect(result.length).toBe(1);
			expect(result[0].community.id).toBe(testCommunity.id);
		});

		it('incluye hasta 3 próximas reuniones (ordenadas ASC)', async () => {
			const user = await TestDataFactory.createTestUser({ email: 'g4m@test.com' });
			const p = await TestDataFactory.createTestParticipant(testRetreat.id);
			const partRepo = AppDataSource.getRepository(
				require('@/entities/participant.entity').Participant,
			);
			await partRepo.update(p.id, { userId: user.id });
			await service.addMember(testCommunity.id, p.id);

			// Crear 4 meetings: 3 futuras + 1 pasada — usar el repo directamente para evitar disparar emails
			const meetingRepo = AppDataSource.getRepository(
				require('@/entities/communityMeeting.entity').CommunityMeeting,
			);
			const tomorrow = new Date(Date.now() + 86_400_000);
			const inWeek = new Date(Date.now() + 7 * 86_400_000);
			const inMonth = new Date(Date.now() + 30 * 86_400_000);
			const inYear = new Date(Date.now() + 365 * 86_400_000);
			await meetingRepo.save(meetingRepo.create({ communityId: testCommunity.id, title: 'M3', startDate: inMonth, durationMinutes: 60 } as any));
			await meetingRepo.save(meetingRepo.create({ communityId: testCommunity.id, title: 'M2', startDate: inWeek, durationMinutes: 60 } as any));
			await meetingRepo.save(meetingRepo.create({ communityId: testCommunity.id, title: 'M1', startDate: tomorrow, durationMinutes: 60 } as any));
			await meetingRepo.save(meetingRepo.create({ communityId: testCommunity.id, title: 'M4', startDate: inYear, durationMinutes: 60 } as any));

			const result = await service.getMyCommunitiesWithMeetings(user.id);
			expect(result[0].upcomingMeetings.length).toBe(3);
			expect(result[0].upcomingMeetings[0].title).toBe('M1'); // más cercana primero
		});

		it('NO incluye plantillas de recurrencia', async () => {
			const user = await TestDataFactory.createTestUser({ email: 'g4t@test.com' });
			const p = await TestDataFactory.createTestParticipant(testRetreat.id);
			const partRepo = AppDataSource.getRepository(
				require('@/entities/participant.entity').Participant,
			);
			await partRepo.update(p.id, { userId: user.id });
			await service.addMember(testCommunity.id, p.id);

			const meetingRepo = AppDataSource.getRepository(
				require('@/entities/communityMeeting.entity').CommunityMeeting,
			);
			await meetingRepo.save(meetingRepo.create({
				communityId: testCommunity.id,
				title: 'Plantilla',
				startDate: new Date(Date.now() + 86_400_000),
				durationMinutes: 60,
				isRecurrenceTemplate: true,
			} as any));

			const result = await service.getMyCommunitiesWithMeetings(user.id);
			expect(result[0].upcomingMeetings.length).toBe(0);
		});

		it('NO devuelve comunidades donde el user es pending_verification', async () => {
			const user = await TestDataFactory.createTestUser({ email: 'g4pending@test.com' });
			const p = await TestDataFactory.createTestParticipant(testRetreat.id);
			const partRepo = AppDataSource.getRepository(
				require('@/entities/participant.entity').Participant,
			);
			await partRepo.update(p.id, { userId: user.id });
			const member = await service.addMember(testCommunity.id, p.id);
			await service.updateMemberState(member.id, 'pending_verification', testUser.id);

			const result = await service.getMyCommunitiesWithMeetings(user.id);
			expect(result.length).toBe(0);
		});

		it('devuelve array vacío si el user no es miembro de ninguna comunidad', async () => {
			const user = await TestDataFactory.createTestUser({ email: 'g4lonely@test.com' });
			const result = await service.getMyCommunitiesWithMeetings(user.id);
			expect(result).toEqual([]);
		});
	});

	// ─── G3: Notificar miembros de reunión próxima ──────────────────────────

	describe('notifyMembersOfMeeting (G3)', () => {
		const getSent = () => ((globalThis as any).__sentEmails as any[]) || [];
		beforeEach(() => {
			(globalThis as any).__sentEmails = [];
		});

		it('envía email a cada miembro activo cuando se crea una reunión no-template', async () => {
			const p1 = await TestDataFactory.createTestParticipant(testRetreat.id);
			const p2 = await TestDataFactory.createTestParticipant(testRetreat.id);
			const partRepo = AppDataSource.getRepository(
				require('@/entities/participant.entity').Participant,
			);
			await partRepo.update(p1.id, { email: 'm1@test.com' });
			await partRepo.update(p2.id, { email: 'm2@test.com' });
			await service.addMember(testCommunity.id, p1.id);
			await service.addMember(testCommunity.id, p2.id);

			const meeting = await service.createMeeting(testCommunity.id, {
				title: 'Reunión Semanal',
				startDate: new Date(Date.now() + 86_400_000),
				durationMinutes: 60,
			} as any);
			await new Promise((r) => setTimeout(r, 100));

			const sent = getSent();
			expect(sent.find((e) => e.to === 'm1@test.com')).toBeTruthy();
			expect(sent.find((e) => e.to === 'm2@test.com')).toBeTruthy();
			expect(sent[0].subject).toContain(testCommunity.name);
			expect(sent[0].html).toContain('Reunión Semanal');
			expect(sent[0].html).toContain('/public/attendance/');
		});

		it('SECURITY: rechaza con MEETING_COMMUNITY_MISMATCH si meetingId pertenece a otra comunidad (IDOR fix)', async () => {
			// Crear segunda comunidad y un meeting en ella
			const otherUser = await TestDataFactory.createTestUser({ email: 'other-comm@test.com' });
			const otherCommunity = await TestDataFactory.createTestCommunity(otherUser.id, {
				name: 'Other Community',
			});
			const meetingRepo = AppDataSource.getRepository(
				require('@/entities/communityMeeting.entity').CommunityMeeting,
			);
			const otherMeeting = await meetingRepo.save(
				meetingRepo.create({
					communityId: otherCommunity.id,
					title: 'Reunión privada',
					startDate: new Date(Date.now() + 86_400_000),
					durationMinutes: 60,
				} as any),
			);

			// Intentar notificar con expectedCommunityId = testCommunity (otro tenant)
			await expect(
				service.notifyMembersOfMeeting(otherMeeting.id, testCommunity.id),
			).rejects.toMatchObject({ code: 'MEETING_COMMUNITY_MISMATCH' });

			// Verificar que NO se enviaron emails
			expect(getSent().length).toBe(0);
		});

		it('SECURITY: permite cuando expectedCommunityId coincide con la del meeting', async () => {
			const p = await TestDataFactory.createTestParticipant(testRetreat.id);
			const partRepo = AppDataSource.getRepository(
				require('@/entities/participant.entity').Participant,
			);
			await partRepo.update(p.id, { email: 'match@test.com' });
			await service.addMember(testCommunity.id, p.id);

			const meetingRepo = AppDataSource.getRepository(
				require('@/entities/communityMeeting.entity').CommunityMeeting,
			);
			const meeting = await meetingRepo.save(
				meetingRepo.create({
					communityId: testCommunity.id,
					title: 'OK',
					startDate: new Date(Date.now() + 86_400_000),
					durationMinutes: 60,
				} as any),
			);
			(globalThis as any).__sentEmails = [];

			await service.notifyMembersOfMeeting(meeting.id, testCommunity.id);
			await new Promise((r) => setTimeout(r, 50));

			expect(getSent().find((e) => e.to === 'match@test.com')).toBeTruthy();
		});

		it('NO envía cuando es una plantilla de recurrencia (isRecurrenceTemplate=true)', async () => {
			const p = await TestDataFactory.createTestParticipant(testRetreat.id);
			const partRepo = AppDataSource.getRepository(
				require('@/entities/participant.entity').Participant,
			);
			await partRepo.update(p.id, { email: 'tpl@test.com' });
			await service.addMember(testCommunity.id, p.id);

			await service.createMeeting(testCommunity.id, {
				title: 'Plantilla',
				startDate: new Date(),
				recurrenceFrequency: 'weekly',
				durationMinutes: 60,
			} as any);
			await new Promise((r) => setTimeout(r, 100));

			expect(getSent().length).toBe(0);
		});

		it('omite miembros sin email o con estado distinto a active_member', async () => {
			const pActive = await TestDataFactory.createTestParticipant(testRetreat.id);
			const pNoEmail = await TestDataFactory.createTestParticipant(testRetreat.id);
			const pPending = await TestDataFactory.createTestParticipant(testRetreat.id);
			const partRepo = AppDataSource.getRepository(
				require('@/entities/participant.entity').Participant,
			);
			await partRepo.update(pActive.id, { email: 'active@test.com' });
			await partRepo.update(pNoEmail.id, { email: '' });
			await partRepo.update(pPending.id, { email: 'pending@test.com' });

			await service.addMember(testCommunity.id, pActive.id);
			await service.addMember(testCommunity.id, pNoEmail.id);
			const memberPending = await service.addMember(testCommunity.id, pPending.id);
			await service.updateMemberState(memberPending.id, 'pending_verification', testUser.id);
			(globalThis as any).__sentEmails = []; // limpiar previos

			await service.createMeeting(testCommunity.id, {
				title: 'Filter Test',
				startDate: new Date(Date.now() + 86_400_000),
				durationMinutes: 60,
			} as any);
			await new Promise((r) => setTimeout(r, 100));

			const sent = getSent();
			expect(sent.find((e) => e.to === 'active@test.com')).toBeTruthy();
			expect(sent.find((e) => e.to === '')).toBeUndefined();
			expect(sent.find((e) => e.to === 'pending@test.com')).toBeUndefined();
		});
	});

	// ─── Templates en BD (refactor inline → renderTemplate) ──────────────────

	describe('renderTemplate — DB-driven email bodies', () => {
		const getSent = () => ((globalThis as any).__sentEmails as any[]) || [];
		beforeEach(() => {
			(globalThis as any).__sentEmails = [];
		});

		it('usa plantilla COMMUNITY_MEETING_INVITATION de BD cuando existe (override del inline)', async () => {
			const { MessageTemplate } = require('@/entities/messageTemplate.entity');
			const tplRepo = AppDataSource.getRepository(MessageTemplate);
			await tplRepo.save(
				tplRepo.create({
					name: 'Test global meeting invite',
					type: 'COMMUNITY_MEETING_INVITATION',
					scope: 'community',
					message:
						'Hola {{firstName}}, hay reunión en {{communityName}}: {{meetingTitle}} el {{meetingDate}}. Confirma: {{attendanceLink}}',
				} as any),
			);

			const p = await TestDataFactory.createTestParticipant(testRetreat.id);
			const partRepo = AppDataSource.getRepository(
				require('@/entities/participant.entity').Participant,
			);
			await partRepo.update(p.id, { email: 'tpl-user@test.com', firstName: 'Maria' });
			await service.addMember(testCommunity.id, p.id);

			await service.createMeeting(testCommunity.id, {
				title: 'Reunión DB tpl',
				startDate: new Date(Date.now() + 86_400_000),
				durationMinutes: 60,
			} as any);
			await new Promise((r) => setTimeout(r, 100));

			const email = getSent().find((e: any) => e.to === 'tpl-user@test.com');
			expect(email).toBeTruthy();
			expect(email.html).toContain('Hola Maria');
			expect(email.html).toContain('Reunión DB tpl');
			expect(email.html).toContain(testCommunity.name);
			// El link aparece como anchor (wrapTemplateHtml lo convierte) — verifica que se interpoló
			expect(email.html).toContain('/public/attendance/');
			// NO debe contener el HTML inline rico (h2 con "Hola ...") porque la plantilla ganó
			expect(email.html).not.toContain('<h2 style="color:#1c1917');
		});

		it('escapa HTML peligroso en variables (XSS protection en plantillas)', async () => {
			const { MessageTemplate } = require('@/entities/messageTemplate.entity');
			const tplRepo = AppDataSource.getRepository(MessageTemplate);
			await tplRepo.save(
				tplRepo.create({
					name: 'Test xss-escaping template',
					type: 'COMMUNITY_MEMBER_APPROVED',
					scope: 'community',
					message: 'Bienvenido {{firstName}} a {{communityName}}',
				} as any),
			);

			const p = await TestDataFactory.createTestParticipant(testRetreat.id);
			const partRepo = AppDataSource.getRepository(
				require('@/entities/participant.entity').Participant,
			);
			await partRepo.update(p.id, {
				email: 'xss@test.com',
				firstName: '<script>alert(1)</script>',
			});
			const member = await service.addMember(testCommunity.id, p.id);
			await service.updateMemberState(member.id, 'pending_verification', testUser.id);
			(globalThis as any).__sentEmails = [];
			await service.updateMemberState(member.id, 'active_member', testUser.id);
			await new Promise((r) => setTimeout(r, 50));

			const email = getSent().find((e: any) => e.to === 'xss@test.com');
			expect(email).toBeTruthy();
			// Variables se escapan
			expect(email.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
			// El raw script NO debe estar presente
			expect(email.html).not.toContain('<script>alert(1)</script>');
		});

		it('cae al HTML inline cuando NO existe plantilla en BD', async () => {
			// Asegurar BD limpia: borrar cualquier plantilla COMMUNITY_MEETING_INVITATION
			const { MessageTemplate } = require('@/entities/messageTemplate.entity');
			await AppDataSource.getRepository(MessageTemplate).delete({
				type: 'COMMUNITY_MEETING_INVITATION',
			});

			const p = await TestDataFactory.createTestParticipant(testRetreat.id);
			const partRepo = AppDataSource.getRepository(
				require('@/entities/participant.entity').Participant,
			);
			await partRepo.update(p.id, { email: 'fallback@test.com', firstName: 'Juan' });
			await service.addMember(testCommunity.id, p.id);

			await service.createMeeting(testCommunity.id, {
				title: 'Fallback meeting',
				startDate: new Date(Date.now() + 86_400_000),
				durationMinutes: 60,
			} as any);
			await new Promise((r) => setTimeout(r, 100));

			const email = getSent().find((e: any) => e.to === 'fallback@test.com');
			expect(email).toBeTruthy();
			// Debe usar el HTML inline rico (con h2 + estilo distintivo)
			expect(email.html).toContain('<h2 style="color:#1c1917');
			expect(email.html).toContain('Fallback meeting');
		});

		it('plantilla específica de community gana sobre la global', async () => {
			const { MessageTemplate } = require('@/entities/messageTemplate.entity');
			const tplRepo = AppDataSource.getRepository(MessageTemplate);
			// Plantilla global (communityId NULL)
			await tplRepo.save(
				tplRepo.create({
					name: 'Global tpl',
					type: 'COMMUNITY_MEETING_INVITATION',
					scope: 'community',
					message: 'GLOBAL: {{communityName}} {{meetingTitle}}',
				} as any),
			);
			// Plantilla específica de testCommunity
			await tplRepo.save(
				tplRepo.create({
					name: 'Specific tpl',
					type: 'COMMUNITY_MEETING_INVITATION',
					scope: 'community',
					communityId: testCommunity.id,
					message: 'SPECIFIC: {{communityName}} {{meetingTitle}}',
				} as any),
			);

			const p = await TestDataFactory.createTestParticipant(testRetreat.id);
			const partRepo = AppDataSource.getRepository(
				require('@/entities/participant.entity').Participant,
			);
			await partRepo.update(p.id, { email: 'override@test.com', firstName: 'Ana' });
			await service.addMember(testCommunity.id, p.id);

			await service.createMeeting(testCommunity.id, {
				title: 'Reunión override',
				startDate: new Date(Date.now() + 86_400_000),
				durationMinutes: 60,
			} as any);
			await new Promise((r) => setTimeout(r, 100));

			const email = getSent().find((e: any) => e.to === 'override@test.com');
			expect(email).toBeTruthy();
			expect(email.html).toContain('SPECIFIC:');
			expect(email.html).not.toContain('GLOBAL:');
		});
	});

	// ─── G2: Notificación al solicitante cuando admin cambia su estado ──────

	describe('updateMemberState — notificación al solicitante (G2)', () => {
		const getSent = () => ((globalThis as any).__sentEmails as any[]) || [];
		beforeEach(() => {
			(globalThis as any).__sentEmails = [];
		});

		it('al aprobar (pending → active) envía email de bienvenida al solicitante', async () => {
			// Crear member pending
			const member = await service.createPublicJoinRequest(testCommunity.id, {
				firstName: 'Pending',
				lastName: 'User',
				email: 'pending-approve@test.com',
				cellPhone: '555-1111',
			});
			await new Promise((r) => setTimeout(r, 50)); // dejar pasar notifyJoinRequest
			(globalThis as any).__sentEmails = []; // limpiar

			await service.updateMemberState(member!.id, 'active_member', testUser.id);
			await new Promise((r) => setTimeout(r, 100));

			const sent = getSent();
			const welcome = sent.find((e) => e.to === 'pending-approve@test.com');
			expect(welcome).toBeTruthy();
			expect(welcome.subject).toContain('Bienvenido');
			expect(welcome.html).toContain('Pending');
		});

		it('al rechazar (pending → no_answer) envía email de seguimiento', async () => {
			const member = await service.createPublicJoinRequest(testCommunity.id, {
				firstName: 'Rejected',
				lastName: 'User',
				email: 'rejected@test.com',
				cellPhone: '555-2222',
			});
			await new Promise((r) => setTimeout(r, 50));
			(globalThis as any).__sentEmails = [];

			await service.updateMemberState(member!.id, 'no_answer', testUser.id);
			await new Promise((r) => setTimeout(r, 100));

			const sent = getSent();
			const followup = sent.find((e) => e.to === 'rejected@test.com');
			expect(followup).toBeTruthy();
			expect(followup.subject).toContain('Tu solicitud');
		});

		it('NO envía email si la transición no es desde pending_verification', async () => {
			// member directamente active
			const p = await TestDataFactory.createTestParticipant(testRetreat.id);
			await service.addMember(testCommunity.id, p.id);
			const memberRepo = AppDataSource.getRepository(
				require('@/entities/communityMember.entity').CommunityMember,
			);
			const member = await memberRepo.findOne({ where: { participantId: p.id } });
			(globalThis as any).__sentEmails = [];

			await service.updateMemberState(member!.id, 'no_answer', testUser.id);
			await new Promise((r) => setTimeout(r, 100));

			const sent = getSent();
			expect(sent.length).toBe(0);
		});

		it('audit fields se llenan al cambiar estado (G5)', async () => {
			const p = await TestDataFactory.createTestParticipant(testRetreat.id);
			await service.addMember(testCommunity.id, p.id);
			const memberRepo = AppDataSource.getRepository(
				require('@/entities/communityMember.entity').CommunityMember,
			);
			let member = await memberRepo.findOne({ where: { participantId: p.id } });

			await service.updateMemberState(member!.id, 'no_answer', testUser.id);

			member = await memberRepo.findOne({ where: { id: member!.id } });
			expect(member!.previousState).toBe('active_member');
			expect(member!.verifiedBy).toBe(testUser.id);
			expect(member!.verifiedAt).toBeTruthy();
		});
	});

	// ─── G1: Auto-link Participant ↔ User existente ─────────────────────────

	describe('linkParticipantToExistingUser (G1)', () => {
		it('vincula Participant a User existente con mismo email', async () => {
			const user = await TestDataFactory.createTestUser({ email: 'autolink@test.com' });
			// Crear participant sin userId
			const p = await TestDataFactory.createTestParticipant(testRetreat.id);
			const partRepo = AppDataSource.getRepository(
				require('@/entities/participant.entity').Participant,
			);
			await partRepo.update(p.id, { email: 'autolink@test.com', userId: null });

			await service.linkParticipantToExistingUser(p.id);

			const updated = await partRepo.findOne({ where: { id: p.id } });
			expect(updated!.userId).toBe(user.id);
		});

		it('no sobrescribe userId si Participant ya tiene uno', async () => {
			const existingUser = await TestDataFactory.createTestUser({ email: 'existing@test.com' });
			const newUser = await TestDataFactory.createTestUser({ email: 'newuser@test.com' });
			const p = await TestDataFactory.createTestParticipant(testRetreat.id);
			const partRepo = AppDataSource.getRepository(
				require('@/entities/participant.entity').Participant,
			);
			await partRepo.update(p.id, { email: 'newuser@test.com', userId: existingUser.id });

			await service.linkParticipantToExistingUser(p.id);

			const updated = await partRepo.findOne({ where: { id: p.id } });
			expect(updated!.userId).toBe(existingUser.id); // sin cambio
		});

		it('no falla si no existe User con el email del Participant', async () => {
			const p = await TestDataFactory.createTestParticipant(testRetreat.id);
			const partRepo = AppDataSource.getRepository(
				require('@/entities/participant.entity').Participant,
			);
			await partRepo.update(p.id, { email: 'lonely@test.com', userId: null });

			await expect(service.linkParticipantToExistingUser(p.id)).resolves.toBeUndefined();
		});

		it('createCommunityMember invoca auto-link cuando hay User con ese email', async () => {
			const user = await TestDataFactory.createTestUser({ email: 'create-member@test.com' });

			const member = await service.createCommunityMember(testCommunity.id, {
				firstName: 'Auto',
				lastName: 'Link',
				email: 'create-member@test.com',
				cellPhone: '555-1234',
			});

			expect(member).toBeTruthy();
			expect(member!.participant!.userId).toBe(user.id);
		});

		it('createPublicJoinRequest vincula a User existente dentro de la TX', async () => {
			const user = await TestDataFactory.createTestUser({ email: 'public-link@test.com' });

			const member = await service.createPublicJoinRequest(testCommunity.id, {
				firstName: 'Public',
				lastName: 'Link',
				email: 'public-link@test.com',
				cellPhone: '555-9999',
			});

			expect(member).toBeTruthy();
			expect(member!.participant!.userId).toBe(user.id);
		});
	});

	// ─── Auto-link de líder a su comunidad ──────────────────────────────────

	describe('linkUserToContactCommunities', () => {
		const getSent = () => ((globalThis as any).__sentEmails as any[]) || [];

		beforeEach(() => {
			(globalThis as any).__sentEmails = [];
		});

		it('SECURITY (Vuln 2 fix): crea pending+token (NO active) cuando la comunidad pending y sin owner', async () => {
			const community = await TestDataFactory.createTestCommunity(testUser.id, {
				contactEmail: 'leader@test.com',
				status: 'pending',
			});
			const adminRepo = AppDataSource.getRepository(CommunityAdmin);
			await adminRepo.delete({ communityId: community.id });

			const leader = await TestDataFactory.createTestUser({
				email: 'leader@test.com',
				displayName: 'Líder Test',
			});

			const linked = await service.linkUserToContactCommunities(leader);

			expect(linked.length).toBe(1);
			expect(linked[0].id).toBe(community.id);

			const admin = await adminRepo.findOne({ where: { communityId: community.id, userId: leader.id } });
			expect(admin).toBeTruthy();
			expect(admin!.role).toBe('owner');
			// SECURITY: status debe ser 'pending', NO 'active' — el usuario NO obtiene
			// acceso hasta que el verdadero líder acepte vía email al contactEmail.
			expect(admin!.status).toBe('pending');
			expect(admin!.invitationToken).toBeTruthy();
			expect(admin!.invitationToken!.length).toBeGreaterThanOrEqual(64); // 32 bytes hex
			expect(admin!.invitationExpiresAt).toBeTruthy();
			expect(admin!.acceptedAt).toBeFalsy();
		});

		it('SECURITY (Vuln 2 fix): propone rol admin (pending) cuando ya hay owner activo', async () => {
			const community = await TestDataFactory.createTestCommunity(testUser.id, {
				contactEmail: 'leader2@test.com',
				status: 'active',
			});
			// El factory ya hizo a testUser owner

			const leader = await TestDataFactory.createTestUser({ email: 'leader2@test.com' });
			const linked = await service.linkUserToContactCommunities(leader);

			expect(linked.length).toBe(1);
			const adminRepo = AppDataSource.getRepository(CommunityAdmin);
			const admin = await adminRepo.findOne({ where: { communityId: community.id, userId: leader.id } });
			expect(admin!.role).toBe('admin');
			// SECURITY: pending hasta confirmación
			expect(admin!.status).toBe('pending');
			expect(admin!.invitationToken).toBeTruthy();
		});

		it('NO duplica si el usuario ya es admin de la comunidad', async () => {
			const community = await TestDataFactory.createTestCommunity(testUser.id, {
				contactEmail: 'already@test.com',
			});
			const leader = await TestDataFactory.createTestUser({ email: 'already@test.com' });

			// Primer link
			await service.linkUserToContactCommunities(leader);
			// Segundo link no debe crear duplicado
			const linked2 = await service.linkUserToContactCommunities(leader);

			expect(linked2.length).toBe(0);
			const adminRepo = AppDataSource.getRepository(CommunityAdmin);
			const admins = await adminRepo.find({ where: { communityId: community.id, userId: leader.id } });
			expect(admins.length).toBe(1);
		});

		it('NO vincula a comunidades con status=rejected', async () => {
			await TestDataFactory.createTestCommunity(testUser.id, {
				contactEmail: 'rejected@test.com',
				status: 'rejected',
			});
			const leader = await TestDataFactory.createTestUser({ email: 'rejected@test.com' });

			const linked = await service.linkUserToContactCommunities(leader);
			expect(linked.length).toBe(0);
		});

		it('match case-insensitive entre user.email y community.contactEmail', async () => {
			const community = await TestDataFactory.createTestCommunity(testUser.id, {
				contactEmail: 'mIXEDcase@TEST.com',
			});
			const adminRepo = AppDataSource.getRepository(CommunityAdmin);
			await adminRepo.delete({ communityId: community.id });

			const leader = await TestDataFactory.createTestUser({ email: 'MixedCase@Test.COM' });
			const linked = await service.linkUserToContactCommunities(leader);

			expect(linked.length).toBe(1);
		});

		it('vincula a múltiples comunidades si el mismo email es contacto de varias', async () => {
			const adminRepo = AppDataSource.getRepository(CommunityAdmin);
			const c1 = await TestDataFactory.createTestCommunity(testUser.id, {
				contactEmail: 'multi-leader@test.com',
				status: 'pending',
			});
			const c2 = await TestDataFactory.createTestCommunity(testUser.id, {
				contactEmail: 'multi-leader@test.com',
				status: 'active',
			});
			await adminRepo.delete({ communityId: c1.id });

			const leader = await TestDataFactory.createTestUser({ email: 'multi-leader@test.com' });
			const linked = await service.linkUserToContactCommunities(leader);
			expect(linked.length).toBe(2);
			const ids = linked.map((c) => c.id);
			expect(ids).toContain(c1.id);
			expect(ids).toContain(c2.id);
		});

		it('SECURITY: envía email al CONTACT EMAIL (no al user) con link de aceptación', async () => {
			const community = await TestDataFactory.createTestCommunity(testUser.id, {
				contactEmail: 'real-leader@parroquia.com',
				name: 'Mi Comunidad',
			});
			const adminRepo = AppDataSource.getRepository(CommunityAdmin);
			await adminRepo.delete({ communityId: community.id });

			// Mallory registra cuenta con el email del líder
			const mallory = await TestDataFactory.createTestUser({
				email: 'real-leader@parroquia.com',
				displayName: 'Mallory',
			});
			await service.linkUserToContactCommunities(mallory);
			await new Promise((r) => setTimeout(r, 100));

			const sent = getSent();
			// El email debe ir al contactEmail original (igual al user.email en este caso)
			const email = sent.find((e) => e.to === 'real-leader@parroquia.com');
			expect(email).toBeTruthy();
			expect(email.subject).toContain('Confirma acceso');
			expect(email.html).toContain('Mi Comunidad');
			// Debe incluir el link de aceptación con un token
			expect(email.html).toMatch(/invitations\/accept\?token=[a-f0-9]{64}/);
		});

		it('NO envía email si no se vinculó nada', async () => {
			const leader = await TestDataFactory.createTestUser({ email: 'lonely@test.com' });
			await service.linkUserToContactCommunities(leader);
			await new Promise((r) => setTimeout(r, 100));

			const sent = getSent();
			expect(sent.length).toBe(0);
		});

		it('escapa HTML del email y nombre de comunidad en el email', async () => {
			const community = await TestDataFactory.createTestCommunity(testUser.id, {
				contactEmail: 'xss@test.com',
				name: '<img src=x onerror=1>',
			});
			const adminRepo = AppDataSource.getRepository(CommunityAdmin);
			await adminRepo.delete({ communityId: community.id });

			const leader = await TestDataFactory.createTestUser({
				email: 'xss@test.com',
				displayName: '<script>steal()</script>',
			});
			await service.linkUserToContactCommunities(leader);
			await new Promise((r) => setTimeout(r, 100));

			const sent = getSent();
			const email = sent.find((e) => e.to === 'xss@test.com');
			expect(email.html).not.toContain('<img src=x onerror=1>');
			expect(email.html).toContain('&lt;img');
		});

		it('approveCommunity también crea solicitud pending si contactUser existe', async () => {
			// Crear user con email que será contactEmail
			const leader = await TestDataFactory.createTestUser({ email: 'pre-approve@test.com' });

			// Crear comunidad pending con ese contactEmail
			const community = await TestDataFactory.createTestCommunity(testUser.id, {
				contactEmail: 'pre-approve@test.com',
				status: 'pending',
			});
			// Borrar el admin auto-creado para simular flujo real
			const adminRepo = AppDataSource.getRepository(CommunityAdmin);
			await adminRepo.delete({ communityId: community.id });

			// El superadmin aprueba
			await service.approveCommunity(community.id, testUser.id);

			// SECURITY: El leader debe estar como pending (no activo automáticamente)
			const leaderAdmin = await adminRepo.findOne({
				where: { communityId: community.id, userId: leader.id },
			});
			expect(leaderAdmin).toBeTruthy();
			expect(leaderAdmin!.status).toBe('pending');
			expect(leaderAdmin!.invitationToken).toBeTruthy();
			// Como el approver ya es owner, el leader queda como admin (al aceptar)
			expect(leaderAdmin!.role).toBe('admin');
		});
	});

	// ─── Vuln 2 hardening — acceptInvitation guards ──────────────────────────

	describe('acceptInvitation — emailVerified + TTL guards (Vuln 2 hardening)', () => {
		it('SECURITY: rechaza con EMAIL_NOT_VERIFIED si user.emailVerified=false', async () => {
			const userRepo = AppDataSource.getRepository(
				require('@/entities/user.entity').User,
			);
			const leader = await TestDataFactory.createTestUser({
				email: 'unverified-acceptor@test.com',
			});
			// Aseguramos emailVerified=false explícitamente
			await userRepo.update(leader.id, { emailVerified: false });
			const community = await TestDataFactory.createTestCommunity(testUser.id, {
				name: 'Vuln2-emailverify',
				contactEmail: 'unverified-acceptor@test.com',
				status: 'active',
			});
			await service.linkUserToContactCommunities(leader);
			const pending = await AppDataSource.getRepository(CommunityAdmin).findOne({
				where: { communityId: community.id, userId: leader.id, status: 'pending' },
			});
			expect(pending?.invitationToken).toBeTruthy();

			await expect(
				service.acceptInvitation(pending!.invitationToken!, leader.id),
			).rejects.toMatchObject({ code: 'EMAIL_NOT_VERIFIED' });

			// El admin record sigue pending (no fue consumido)
			const stillPending = await AppDataSource.getRepository(CommunityAdmin).findOne({
				where: { id: pending!.id },
			});
			expect(stillPending?.status).toBe('pending');
			expect(stillPending?.invitationToken).toBeTruthy();
		});

		it('SECURITY: acepta cuando user.emailVerified=true', async () => {
			const userRepo = AppDataSource.getRepository(
				require('@/entities/user.entity').User,
			);
			const leader = await TestDataFactory.createTestUser({
				email: 'verified-acceptor@test.com',
			});
			await userRepo.update(leader.id, { emailVerified: true });
			const community = await TestDataFactory.createTestCommunity(testUser.id, {
				name: 'Vuln2-verified',
				contactEmail: 'verified-acceptor@test.com',
				status: 'active',
			});
			await service.linkUserToContactCommunities(leader);
			const pending = await AppDataSource.getRepository(CommunityAdmin).findOne({
				where: { communityId: community.id, userId: leader.id, status: 'pending' },
			});
			expect(pending?.invitationToken).toBeTruthy();

			const accepted = await service.acceptInvitation(pending!.invitationToken!, leader.id);
			expect(accepted.status).toBe('active');
			expect(accepted.acceptedAt).toBeInstanceOf(Date);
		});

		it('SECURITY: rechaza con INVITATION_EXPIRED si TTL pasó', async () => {
			const userRepo = AppDataSource.getRepository(
				require('@/entities/user.entity').User,
			);
			const leader = await TestDataFactory.createTestUser({
				email: 'expired-acceptor@test.com',
			});
			await userRepo.update(leader.id, { emailVerified: true });
			const community = await TestDataFactory.createTestCommunity(testUser.id, {
				name: 'Vuln2-expired',
				contactEmail: 'expired-acceptor@test.com',
				status: 'active',
			});
			await service.linkUserToContactCommunities(leader);
			// Forzar expiración a hace 1 minuto
			const adminRepo = AppDataSource.getRepository(CommunityAdmin);
			const pending = await adminRepo.findOne({
				where: { communityId: community.id, userId: leader.id, status: 'pending' },
			});
			await adminRepo.update(pending!.id, {
				invitationExpiresAt: new Date(Date.now() - 60_000),
			});

			await expect(
				service.acceptInvitation(pending!.invitationToken!, leader.id),
			).rejects.toMatchObject({ code: 'INVITATION_EXPIRED' });
		});

		it('TTL: tokens emitidos por linkUserToContactCommunities expiran en ~48h', async () => {
			const leader = await TestDataFactory.createTestUser({ email: 'ttl-check@test.com' });
			const community = await TestDataFactory.createTestCommunity(testUser.id, {
				name: 'Vuln2-ttl',
				contactEmail: 'ttl-check@test.com',
				status: 'active',
			});
			const before = Date.now();
			await service.linkUserToContactCommunities(leader);
			const after = Date.now();
			const pending = await AppDataSource.getRepository(CommunityAdmin).findOne({
				where: { communityId: community.id, userId: leader.id, status: 'pending' },
			});
			expect(pending?.invitationExpiresAt).toBeInstanceOf(Date);
			const ttl = pending!.invitationExpiresAt!.getTime();
			const expectedMin = before + 48 * 60 * 60 * 1000 - 1000;
			const expectedMax = after + 48 * 60 * 60 * 1000 + 1000;
			expect(ttl).toBeGreaterThanOrEqual(expectedMin);
			expect(ttl).toBeLessThanOrEqual(expectedMax);
		});
	});
});
