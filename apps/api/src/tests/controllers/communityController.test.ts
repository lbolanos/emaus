import { setupTestDatabase, teardownTestDatabase, clearTestData } from '../test-setup';
import { TestDataFactory } from '../test-utils/testDataFactory';
import { createMockRequest, createMockResponse } from '../test-utils/authTestUtils';
import { User } from '@/entities/user.entity';
import { Community } from '@/entities/community.entity';

describe('CommunityController', () => {
	let testUser: User;
	let testCommunity: Community;
	let testRetreat: any;
	let CommunityController: any;

	beforeAll(async () => {
		await setupTestDatabase();
		// Import controller AFTER database setup so service uses test data source
		const module = await import('@/controllers/communityController');
		CommunityController = module.CommunityController;
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

	describe('Community CRUD', () => {
		it('should get community by id', async () => {
			const req = createMockRequest(testUser, {}, { id: testCommunity.id });
			const res = createMockResponse();

			await CommunityController.getCommunityById(req, res);

			expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
				id: testCommunity.id,
				name: testCommunity.name,
			}));
			expect(res.json).toHaveBeenCalledTimes(1);
		});

		it('should return 404 for non-existent community', async () => {
			const req = createMockRequest(testUser, {}, { id: 'non-existent-id' });
			const res = createMockResponse();

			await CommunityController.getCommunityById(req, res);

			expect(res.status).toHaveBeenCalledWith(404);
			expect(res.json).toHaveBeenCalledWith({ message: 'Community not found' });
		});
	});

	describe('Member Management', () => {
		it('should get all members', async () => {
			const req = createMockRequest(testUser, {}, { id: testCommunity.id });
			const res = createMockResponse();

			await CommunityController.getMembers(req, res);

			expect(res.json).toHaveBeenCalled();
		});

		it('should filter members by state', async () => {
			const req = createMockRequest(
				testUser,
				{},
				{ id: testCommunity.id },
				{ state: 'active_member' },
			);
			const reqWithQuery = { ...req, query: { state: 'active_member' } };
			const res = createMockResponse();

			await CommunityController.getMembers(reqWithQuery, res);

			expect(res.json).toHaveBeenCalled();
		});

		it('should add single member', async () => {
			const participant = await TestDataFactory.createTestParticipant(testRetreat.id);

			const req = createMockRequest(testUser, { participantId: participant.id }, { id: testCommunity.id });
			const res = createMockResponse();

			await CommunityController.addMember(req, res);

			expect(res.status).toHaveBeenCalledWith(201);
			expect(res.json).toHaveBeenCalled();
		});
	});

	describe('Meeting Management', () => {
		it('should create a meeting', async () => {
			const meetingData = {
				title: 'Test Meeting',
				startDate: new Date(),
				durationMinutes: 60,
			};

			const req = createMockRequest(testUser, meetingData, { id: testCommunity.id });
			const res = createMockResponse();

			await CommunityController.createMeeting(req, res);

			expect(res.status).toHaveBeenCalledWith(201);
			expect(res.json).toHaveBeenCalled();
		});

		it('should get all meetings', async () => {
			const req = createMockRequest(testUser, {}, { id: testCommunity.id });
			const res = createMockResponse();

			await CommunityController.getMeetings(req, res);

			expect(res.json).toHaveBeenCalled();
		});

		it('should return 404 when updating non-existent meeting', async () => {
			const req = createMockRequest(
				testUser,
				{ title: 'Updated' },
				{ id: 'non-existent' },
				{ scope: 'this' },
			);
			const reqWithQuery = { ...req, query: { scope: 'this' } };
			const res = createMockResponse();

			await CommunityController.updateMeeting(reqWithQuery, res);

			expect(res.status).toHaveBeenCalledWith(404);
			expect(res.json).toHaveBeenCalledWith({ message: 'Meeting not found' });
		});

		it('should delete meeting', async () => {
			// First create a meeting
			const meeting = await TestDataFactory.createTestCommunityMeeting(testCommunity.id);

			const req = createMockRequest(testUser, {}, { id: meeting.id }, { scope: 'this' });
			const reqWithQuery = { ...req, query: { scope: 'this' } };
			const res = createMockResponse();

			await CommunityController.deleteMeeting(reqWithQuery, res);

			expect(res.status).toHaveBeenCalledWith(204);
		});
	});

	describe('Attendance', () => {
		it('should record attendance for multiple members', async () => {
			const meeting = await TestDataFactory.createTestCommunityMeeting(testCommunity.id);
			const participant1 = await TestDataFactory.createTestParticipant(testRetreat.id);
			const participant2 = await TestDataFactory.createTestParticipant(testRetreat.id);
			const member1 = await TestDataFactory.createTestCommunityMember(testCommunity.id, participant1.id);
			const member2 = await TestDataFactory.createTestCommunityMember(testCommunity.id, participant2.id);

			const attendanceData = [
				{ memberId: member1.id, attended: true },
				{ memberId: member2.id, attended: false },
			];

			const req = createMockRequest(testUser, attendanceData, { meetingId: meeting.id });
			const res = createMockResponse();

			await CommunityController.recordAttendance(req, res);

			expect(res.status).toHaveBeenCalledWith(201);
			expect(res.json).toHaveBeenCalled();
		});

		it('should record single attendance', async () => {
			const meeting = await TestDataFactory.createTestCommunityMeeting(testCommunity.id);
			const participant = await TestDataFactory.createTestParticipant(testRetreat.id);
			const member = await TestDataFactory.createTestCommunityMember(testCommunity.id, participant.id);

			const req = createMockRequest(
				testUser,
				{ memberId: member.id, attended: true },
				{ id: testCommunity.id, meetingId: meeting.id },
			);
			const res = createMockResponse();

			await CommunityController.recordSingleAttendance(req, res);

			expect(res.status).toHaveBeenCalledWith(201);
			expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
				memberId: member.id,
				attended: true,
			}));
		});

		it('should return 404 for single attendance with non-existent member', async () => {
			const meeting = await TestDataFactory.createTestCommunityMeeting(testCommunity.id);

			const req = createMockRequest(
				testUser,
				{ memberId: 'non-existent', attended: true },
				{ id: testCommunity.id, meetingId: meeting.id },
			);
			const res = createMockResponse();

			await CommunityController.recordSingleAttendance(req, res);

			expect(res.status).toHaveBeenCalledWith(404);
			expect(res.json).toHaveBeenCalledWith({ message: 'Member not found' });
		});

		it('should get attendance for meeting', async () => {
			const meeting = await TestDataFactory.createTestCommunityMeeting(testCommunity.id);
			const participant1 = await TestDataFactory.createTestParticipant(testRetreat.id);
			const participant2 = await TestDataFactory.createTestParticipant(testRetreat.id);
			const member1 = await TestDataFactory.createTestCommunityMember(testCommunity.id, participant1.id);
			const member2 = await TestDataFactory.createTestCommunityMember(testCommunity.id, participant2.id);

			// Record some attendance
			await TestDataFactory.createTestCommunityAttendance(meeting.id, member1.id, true);
			await TestDataFactory.createTestCommunityAttendance(meeting.id, member2.id, false);

			const req = createMockRequest(testUser, {}, { meetingId: meeting.id });
			const res = createMockResponse();

			await CommunityController.getAttendance(req, res);

			expect(res.json).toHaveBeenCalled();
		});
	});

	describe('Dashboard', () => {
		it('should get dashboard stats', async () => {
			const req = createMockRequest(testUser, {}, { id: testCommunity.id });
			const res = createMockResponse();

			await CommunityController.getDashboardStats(req, res);

			expect(res.json).toHaveBeenCalled();
		});
	});

	describe('Admin Management', () => {
		it('should invite admin', async () => {
			// Create a user to invite
			const userToInvite = await TestDataFactory.createTestUser();

			const req = createMockRequest(
				testUser,
				{ email: userToInvite.email },
				{ id: testCommunity.id },
			);
			const res = createMockResponse();

			await CommunityController.inviteAdmin(req, res);

			expect(res.status).toHaveBeenCalledWith(201);
			expect(res.json).toHaveBeenCalled();
		});

		it('should get admins', async () => {
			const req = createMockRequest(testUser, {}, { id: testCommunity.id });
			const res = createMockResponse();

			await CommunityController.getAdmins(req, res);

			expect(res.json).toHaveBeenCalled();
		});

		it('should accept invitation', async () => {
			const admin = await TestDataFactory.createTestCommunityAdmin(testCommunity.id, testUser.id);

			const req = createMockRequest({ id: testUser.id }, { token: admin.invitationToken }, {});
			const res = createMockResponse();

			await CommunityController.acceptInvitation(req, res);

			expect(res.json).toHaveBeenCalled();
		});

		it('should get invitation status', async () => {
			const admin = await TestDataFactory.createTestCommunityAdmin(testCommunity.id, testUser.id);

			const req = createMockRequest({}, {}, { token: admin.invitationToken });
			const res = createMockResponse();

			await CommunityController.getInvitationStatus(req, res);

			expect(res.json).toHaveBeenCalled();
		});

		it('should return 404 for non-existent invitation', async () => {
			const req = createMockRequest({}, {}, { token: 'invalid-token' });
			const res = createMockResponse();

			await CommunityController.getInvitationStatus(req, res);

			expect(res.status).toHaveBeenCalledWith(404);
		});

		it('should revoke admin', async () => {
			// Create a different user for the admin (not the owner)
			const otherUser = await TestDataFactory.createTestUser();
			const admin = await TestDataFactory.createTestCommunityAdmin(testCommunity.id, otherUser.id, { role: 'admin' });

			const req = createMockRequest(testUser, {}, { id: testCommunity.id, userId: admin.userId });
			const res = createMockResponse();

			await CommunityController.revokeAdmin(req, res);

			expect(res.status).toHaveBeenCalledWith(204);
		});
	});

	describe('Public Attendance', () => {
		it('should get public attendance data', async () => {
			const meeting = await TestDataFactory.createTestCommunityMeeting(testCommunity.id);
			const participant = await TestDataFactory.createTestParticipant(testRetreat.id);
			const member = await TestDataFactory.createTestCommunityMember(testCommunity.id, participant.id);

			const req = createMockRequest(
				testUser,
				{},
				{
					communityId: testCommunity.id,
					meetingId: meeting.id,
				},
			);
			const res = createMockResponse();

			await CommunityController.getPublicAttendanceData(req, res);

			expect(res.json).toHaveBeenCalled();
		});

		it('should return 404 for non-existent community or meeting', async () => {
			const req = createMockRequest(
				testUser,
				{},
				{
					communityId: 'non-existent',
					meetingId: 'non-existent',
				},
			);
			const res = createMockResponse();

			await CommunityController.getPublicAttendanceData(req, res);

			expect(res.status).toHaveBeenCalledWith(404);
		});
	});
});
