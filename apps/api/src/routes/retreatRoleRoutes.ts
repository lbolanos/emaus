import { Router } from 'express';
import {
	inviteUserToRetreat,
	removeUserFromRetreat,
	getRetreatUsers,
	getUserRetreats,
	approveRetreatInvitation,
	rejectRetreatInvitation,
	getAvailableRoles,
} from '../controllers/retreatRoleController';
import { isAuthenticated } from '../middleware/isAuthenticated';
import { requireRetreatAccessOrCreator } from '../middleware/authorization';

const router = Router();

// All routes require authentication
router.use(isAuthenticated);

// Invite user to retreat (only retreat creator)
router.post(
	'/:retreatId/invite',
	requireRetreatAccessOrCreator('retreatId'),
	(req: any, res: any) => inviteUserToRetreat(req, res),
);

// Remove user from retreat (only retreat creator)
router.delete(
	'/:retreatId/users/:userId',
	requireRetreatAccessOrCreator('retreatId'),
	(req: any, res: any) => removeUserFromRetreat(req, res),
);

// Get retreat users (retreat creator or users with access)
router.get('/:retreatId/users', requireRetreatAccessOrCreator('retreatId'), (req: any, res: any) =>
	getRetreatUsers(req, res),
);

// Alias route for frontend compatibility
router.get(
	'/retreat/:retreatId/users',
	requireRetreatAccessOrCreator('retreatId'),
	(req: any, res: any) => getRetreatUsers(req, res),
);

// Approve retreat invitation (only retreat creator)
router.put(
	'/:retreatId/invitations/:userId/approve',
	requireRetreatAccessOrCreator('retreatId'),
	(req: any, res: any) => approveRetreatInvitation(req, res),
);

// Reject retreat invitation (only retreat creator)
router.put(
	'/:retreatId/invitations/:userId/reject',
	requireRetreatAccessOrCreator('retreatId'),
	(req: any, res: any) => rejectRetreatInvitation(req, res),
);

// Get user's retreats (users can see their own, admins can see others')
router.get('/users/:userId/retreats', (req: any, res: any) => getUserRetreats(req, res));

// Get available roles for retreat assignment
router.get('/roles', (req: any, res: any) => getAvailableRoles(req, res));

export default router;
