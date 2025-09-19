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
import { requireRetreatCreator, requireRetreatAccessOrCreator } from '../middleware/authorization';

const router = Router();

// All routes require authentication
router.use(isAuthenticated);

// Invite user to retreat (only retreat creator)
router.post('/:retreatId/invite', requireRetreatCreator('retreatId'), (req: any, res: any) =>
	inviteUserToRetreat(req, res),
);

// Remove user from retreat (only retreat creator)
router.delete(
	'/:retreatId/users/:userId',
	requireRetreatCreator('retreatId'),
	(req: any, res: any) => removeUserFromRetreat(req, res),
);

// Get retreat users (retreat creator or users with access)
router.get('/:retreatId/users', requireRetreatAccessOrCreator('retreatId'), (req: any, res: any) =>
	getRetreatUsers(req, res),
);

// Alias route for frontend compatibility
router.get(
	'/retreat/:retreatId/users',
	async (req: any, res: any, next: any) => {
		//console.log('🔍 DEBUG: Retreat roles alias route - params:', req.params);
		//console.log('🔍 DEBUG: User:', req.user?.id);
		//console.log('🔍 DEBUG: Retreat ID:', req.params.retreatId);

		const authService = await import('../middleware/authorization').then(
			(m) => m.authorizationService,
		);

		// Check if user has retreat access or is creator
		const [hasAccess, isCreator] = await Promise.all([
			authService.hasRetreatAccess(req.user.id, req.params.retreatId),
			authService.isRetreatCreator(req.user.id, req.params.retreatId),
		]);

		//console.log('🔍 DEBUG: Has retreat access:', hasAccess);
		//console.log('🔍 DEBUG: Is retreat creator:', isCreator);

		if (hasAccess || isCreator) {
			//console.log('🔍 DEBUG: User has access or is creator, allowing access');
			return next();
		} else {
			//console.log('🔍 DEBUG: User has no access and is not creator, denying access');
			return res.status(403).json({ message: 'Forbidden' });
		}
	},
	(req: any, res: any) => getRetreatUsers(req, res),
);

// Approve retreat invitation (only retreat creator)
router.put(
	'/:retreatId/invitations/:userId/approve',
	requireRetreatCreator('retreatId'),
	(req: any, res: any) => approveRetreatInvitation(req, res),
);

// Reject retreat invitation (only retreat creator)
router.put(
	'/:retreatId/invitations/:userId/reject',
	requireRetreatCreator('retreatId'),
	(req: any, res: any) => rejectRetreatInvitation(req, res),
);

// Get user's retreats (users can see their own, admins can see others')
router.get('/users/:userId/retreats', (req: any, res: any) => getUserRetreats(req, res));

// Get available roles for retreat assignment
router.get('/roles', (req: any, res: any) => getAvailableRoles(req, res));

export default router;
