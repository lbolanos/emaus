import { Router } from 'express';
import * as serviceTeamController from '../controllers/serviceTeamController';
import { isAuthenticated } from '../middleware/isAuthenticated';
import { requireRetreatAccess, requirePermission } from '../middleware/authorization';

const router = Router();

router.use(isAuthenticated);

// Read routes — require retreat access
router.get(
	'/retreat/:retreatId',
	requireRetreatAccess('retreatId'),
	serviceTeamController.getTeamsForRetreat,
);
router.get('/:id', serviceTeamController.getTeam);

// Write routes — require retreat access + permission
router.post('/', requirePermission('retreat:update'), serviceTeamController.createTeam);
router.put('/:id', requirePermission('retreat:update'), serviceTeamController.updateTeam);
router.delete('/:id', requirePermission('retreat:update'), serviceTeamController.deleteTeam);

// Member management
router.post('/:id/members', requirePermission('retreat:update'), serviceTeamController.addMember);
router.delete(
	'/:id/members/:participantId',
	requirePermission('retreat:update'),
	serviceTeamController.removeMember,
);

// Leader management
router.put(
	'/:id/leader',
	requirePermission('retreat:update'),
	serviceTeamController.assignLeaderCtrl,
);
router.delete(
	'/:id/leader',
	requirePermission('retreat:update'),
	serviceTeamController.unassignLeaderCtrl,
);

// Initialize defaults — requires retreat access
router.post(
	'/initialize/:retreatId',
	requireRetreatAccess('retreatId'),
	requirePermission('retreat:update'),
	serviceTeamController.initializeDefaults,
);

// Export — requires retreat access
router.post(
	'/export/:retreatId',
	requireRetreatAccess('retreatId'),
	serviceTeamController.exportTeamsDocx,
);

export default router;
