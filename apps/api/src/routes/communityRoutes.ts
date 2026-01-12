import { Router } from 'express';
import { CommunityController } from '../controllers/communityController';
import { isAuthenticated } from '../middleware/isAuthenticated';
import { validateRequest } from '../middleware/validateRequest';
import {
	requirePermission,
	requireCommunityAccess,
	requireCommunityMeetingAccess,
} from '../middleware/authorization';
import {
	createCommunitySchema,
	updateCommunitySchema,
	createCommunityMeetingSchema,
	updateCommunityMeetingSchema,
	importMembersSchema,
	updateMemberStateSchema,
	recordAttendanceSchema,
	inviteCommunityAdminSchema,
} from '@repo/types';

const router = Router();

// Public invitation routes
router.get('/invitations/status/:token', (req, res) =>
	CommunityController.getInvitationStatus(req, res),
);
router.post('/invitations/accept', (req, res) => CommunityController.acceptInvitation(req, res));

router.get('/public', (req, res) =>
	CommunityController.getPublicCommunities(req, res),
);
router.get('/public/meetings', (req, res) =>
	CommunityController.getPublicMeetings(req, res),
);

// Public attendance routes (NO AUTH required)
router.get('/public/attendance/:communityId/:meetingId', (req, res) =>
	CommunityController.getPublicAttendanceData(req, res),
);
router.post('/public/attendance/:communityId/:meetingId', (req, res) =>
	CommunityController.recordPublicAttendance(req, res),
);

// All other community routes require authentication
router.use(isAuthenticated);

// Communities CRUD
// Get communities - any authenticated user can get their own communities (service filters by admin status)
router.get('/', (req, res) => CommunityController.getCommunities(req, res));
router.post(
	'/',
	requirePermission('community:create'),
	validateRequest(createCommunitySchema),
	(req, res) => CommunityController.createCommunity(req, res),
);
router.get('/:id', requireCommunityAccess(), (req, res) =>
	CommunityController.getCommunityById(req, res),
);
router.put('/:id', requireCommunityAccess(), validateRequest(updateCommunitySchema), (req, res) =>
	CommunityController.updateCommunity(req, res),
);
router.delete('/:id', requirePermission('community:delete'), (req, res) =>
	CommunityController.deleteCommunity(req, res),
);

// Members
router.get('/:id/members', requireCommunityAccess(), (req, res) =>
	CommunityController.getMembers(req, res),
);
router.get('/:id/members/potential', requireCommunityAccess(), (req, res) =>
	CommunityController.getPotentialMembers(req, res),
);
router.post('/:id/members', requireCommunityAccess(), (req, res) =>
	CommunityController.addMember(req, res),
);
router.post('/:id/members/create', requireCommunityAccess(), (req, res) =>
	CommunityController.createCommunityMember(req, res),
);
router.post(
	'/:id/members/import',
	requireCommunityAccess(),
	validateRequest(importMembersSchema),
	(req, res) => CommunityController.importFromRetreat(req, res),
);
router.put(
	'/:id/members/:memberId',
	requireCommunityAccess(),
	validateRequest(updateMemberStateSchema),
	(req, res) => CommunityController.updateMemberState(req, res),
);
router.delete('/:id/members/:memberId', requireCommunityAccess(), (req, res) =>
	CommunityController.removeMember(req, res),
);
router.patch('/:id/members/:memberId/notes', requireCommunityAccess(), (req, res) =>
	CommunityController.updateMemberNotes(req, res),
);
router.get('/:id/members/:memberId/timeline', requireCommunityAccess(), (req, res) =>
	CommunityController.getMemberTimeline(req, res),
);

// Meetings
router.get('/:id/meetings', requireCommunityAccess(), (req, res) =>
	CommunityController.getMeetings(req, res),
);
router.post(
	'/:id/meetings',
	requireCommunityAccess(),
	validateRequest(createCommunityMeetingSchema),
	(req, res) => CommunityController.createMeeting(req, res),
);
router.put(
	'/meetings/:id',
	requireCommunityMeetingAccess(),
	validateRequest(updateCommunityMeetingSchema),
	(req, res) => CommunityController.updateMeeting(req, res),
);
router.delete('/meetings/:id', requireCommunityMeetingAccess(), (req, res) =>
	CommunityController.deleteMeeting(req, res),
);
router.post('/meetings/:id/next-instance', requireCommunityMeetingAccess(), (req, res) =>
	CommunityController.createNextMeetingInstance(req, res),
);

// Attendance
router.get('/:id/meetings/:meetingId/attendance', requireCommunityAccess(), (req, res) =>
	CommunityController.getAttendance(req, res),
);
router.post(
	'/:id/meetings/:meetingId/attendance',
	requireCommunityAccess(),
	validateRequest(recordAttendanceSchema),
	(req, res) => CommunityController.recordAttendance(req, res),
);
router.post('/:id/meetings/:meetingId/attendance/single', requireCommunityAccess(), (req, res) =>
	CommunityController.recordSingleAttendance(req, res),
);

// Dashboard
router.get('/:id/dashboard', requireCommunityAccess(), (req, res) =>
	CommunityController.getDashboardStats(req, res),
);

// Admins
router.get('/:id/admins', requireCommunityAccess(), (req, res) =>
	CommunityController.getAdmins(req, res),
);
router.post(
	'/:id/admins/invite',
	requireCommunityAccess(),
	validateRequest(inviteCommunityAdminSchema),
	(req, res) => CommunityController.inviteAdmin(req, res),
);
router.delete('/:id/admins/:userId', requireCommunityAccess(), (req, res) =>
	CommunityController.revokeAdmin(req, res),
);

export default router;
