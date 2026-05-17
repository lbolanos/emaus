import { Router } from 'express';
import { CommunityController } from '../controllers/communityController';
import { isAuthenticated } from '../middleware/isAuthenticated';
import { validateRequest } from '../middleware/validateRequest';
import {
	requirePermission,
	requireRole,
	requireCommunityAccess,
	requireCommunityOwner,
	requireCommunityMeetingAccess,
} from '../middleware/authorization';
import { publicCommunityRegisterLimiter, meetingNotifyLimiter } from '../middleware/rateLimiting';
import {
	createCommunitySchema,
	updateCommunitySchema,
	createCommunityMeetingSchema,
	updateCommunityMeetingSchema,
	importMembersSchema,
	updateMemberStateSchema,
	recordAttendanceSchema,
	inviteCommunityAdminSchema,
	publicRegisterCommunitySchema,
	rejectCommunitySchema,
} from '@repo/types';

const router = Router();

// Public invitation routes
router.get('/invitations/status/:token', (req, res) =>
	CommunityController.getInvitationStatus(req, res),
);
router.post('/invitations/accept', (req, res) => CommunityController.acceptInvitation(req, res));

router.get('/public', (req, res) => CommunityController.getPublicCommunities(req, res));
router.get('/public/meetings', (req, res) => CommunityController.getPublicMeetings(req, res));

// Public attendance routes (NO AUTH required)
router.get('/public/attendance/:communityId/:meetingId', (req, res) =>
	CommunityController.getPublicAttendanceData(req, res),
);
router.post('/public/attendance/:communityId/:meetingId', (req, res) =>
	CommunityController.recordPublicAttendance(req, res),
);

// Public community registration (NO AUTH required) — pending superadmin approval
router.post(
	'/public/register',
	publicCommunityRegisterLimiter,
	validateRequest(publicRegisterCommunitySchema),
	(req, res) => CommunityController.publicRegisterCommunity(req, res),
);

// Public join request route (NO AUTH required)
router.post('/:id/join-public', (req, res) => CommunityController.publicJoinRequest(req, res));

// All other community routes require authentication
router.use(isAuthenticated);

// G4: Vista del miembro — comunidades del usuario actual con próximas reuniones
router.get('/my', (req, res) => CommunityController.getMyCommunities(req, res));

// Superadmin moderation routes for public community registrations
router.get('/pending', requireRole('superadmin'), (req, res) =>
	CommunityController.listPendingCommunities(req, res),
);
router.post('/:id/approve', requireRole('superadmin'), (req, res) =>
	CommunityController.approveCommunity(req, res),
);
router.post(
	'/:id/reject',
	requireRole('superadmin'),
	validateRequest(rejectCommunitySchema),
	(req, res) => CommunityController.rejectCommunity(req, res),
);

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
// SECURITY: editar metadata de la community es owner-only
router.put('/:id', requireCommunityOwner(), validateRequest(updateCommunitySchema), (req, res) =>
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
// SECURITY: remover miembros es owner-only (destructivo)
router.delete('/:id/members/:memberId', requireCommunityOwner(), (req, res) =>
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

// G3: Re-disparar notificación a miembros sobre una reunión (botón "Notificar").
// SECURITY: usar requireCommunityMeetingAccess para que la autorización se resuelva
// contra la comunidad REAL del meeting, no contra el :id del URL — evita IDOR
// cross-tenant donde un admin de comunidad A podría disparar emails a comunidad B
// usando un meetingId de B.
router.post(
	'/:id/meetings/:meetingId/notify',
	meetingNotifyLimiter,
	requireCommunityMeetingAccess('meetingId'),
	(req, res) => CommunityController.notifyMembersOfMeeting(req, res),
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
// SECURITY: gestión de admins es owner-only — un admin no puede invitar más admins
router.post(
	'/:id/admins/invite',
	requireCommunityOwner(),
	validateRequest(inviteCommunityAdminSchema),
	(req, res) => CommunityController.inviteAdmin(req, res),
);
router.delete('/:id/admins/:userId', requireCommunityOwner(), (req, res) =>
	CommunityController.revokeAdmin(req, res),
);

export default router;
