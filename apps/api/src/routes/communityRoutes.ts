import { Router } from 'express';
import { CommunityController } from '../controllers/communityController';
import { isAuthenticated } from '../middleware/isAuthenticated';
import { validateRequest } from '../middleware/validateRequest';
import { requirePermission } from '../middleware/authorization';
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

// All other community routes require authentication
router.use(isAuthenticated);

// Communities CRUD
router.get('/', requirePermission('community:read'), (req, res) =>
	CommunityController.getCommunities(req, res),
);
router.post(
	'/',
	requirePermission('community:create'),
	validateRequest(createCommunitySchema),
	(req, res) => CommunityController.createCommunity(req, res),
);
router.get('/:id', requirePermission('community:read'), (req, res) =>
	CommunityController.getCommunityById(req, res),
);
router.put(
	'/:id',
	requirePermission('community:update'),
	validateRequest(updateCommunitySchema),
	(req, res) => CommunityController.updateCommunity(req, res),
);
router.delete('/:id', requirePermission('community:delete'), (req, res) =>
	CommunityController.deleteCommunity(req, res),
);

// Members
router.get('/:id/members', requirePermission('community:read'), (req, res) =>
	CommunityController.getMembers(req, res),
);
router.get('/:id/members/potential', requirePermission('community:read'), (req, res) =>
	CommunityController.getPotentialMembers(req, res),
);
router.post('/:id/members', requirePermission('community:update'), (req, res) =>
	CommunityController.addMember(req, res),
);
router.post(
	'/:id/members/import',
	requirePermission('community:update'),
	validateRequest(importMembersSchema),
	(req, res) => CommunityController.importFromRetreat(req, res),
);
router.put(
	'/:id/members/:memberId',
	requirePermission('community:update'),
	validateRequest(updateMemberStateSchema),
	(req, res) => CommunityController.updateMemberState(req, res),
);
router.delete('/:id/members/:memberId', requirePermission('community:update'), (req, res) =>
	CommunityController.removeMember(req, res),
);

// Meetings
router.get('/:id/meetings', requirePermission('community:read'), (req, res) =>
	CommunityController.getMeetings(req, res),
);
router.post(
	'/:id/meetings',
	requirePermission('community:update'),
	validateRequest(createCommunityMeetingSchema),
	(req, res) => CommunityController.createMeeting(req, res),
);
router.put(
	'/meetings/:id',
	requirePermission('community:update'),
	validateRequest(updateCommunityMeetingSchema),
	(req, res) => CommunityController.updateMeeting(req, res),
);
router.delete('/meetings/:id', requirePermission('community:update'), (req, res) =>
	CommunityController.deleteMeeting(req, res),
);

// Attendance
router.get('/:id/meetings/:meetingId/attendance', requirePermission('community:read'), (req, res) =>
	CommunityController.getAttendance(req, res),
);
router.post(
	'/:id/meetings/:meetingId/attendance',
	requirePermission('community:update'),
	validateRequest(recordAttendanceSchema),
	(req, res) => CommunityController.recordAttendance(req, res),
);

// Dashboard
router.get('/:id/dashboard', requirePermission('community:read'), (req, res) =>
	CommunityController.getDashboardStats(req, res),
);

// Admins
router.get('/:id/admins', requirePermission('community:admin'), (req, res) =>
	CommunityController.getAdmins(req, res),
);
router.post(
	'/:id/admins/invite',
	requirePermission('community:admin'),
	validateRequest(inviteCommunityAdminSchema),
	(req, res) => CommunityController.inviteAdmin(req, res),
);
router.delete('/:id/admins/:userId', requirePermission('community:admin'), (req, res) =>
	CommunityController.revokeAdmin(req, res),
);

export default router;
