import { Router } from 'express';
import * as serviceTeamController from '../controllers/serviceTeamController';
import { isAuthenticated } from '../middleware/isAuthenticated';

const router = Router();

router.use(isAuthenticated);

router.get('/retreat/:retreatId', serviceTeamController.getTeamsForRetreat);
router.get('/:id', serviceTeamController.getTeam);
router.post('/', serviceTeamController.createTeam);
router.put('/:id', serviceTeamController.updateTeam);
router.delete('/:id', serviceTeamController.deleteTeam);

// Member management
router.post('/:id/members', serviceTeamController.addMember);
router.delete('/:id/members/:participantId', serviceTeamController.removeMember);

// Leader management
router.put('/:id/leader', serviceTeamController.assignLeaderCtrl);
router.delete('/:id/leader', serviceTeamController.unassignLeaderCtrl);

// Initialize defaults
router.post('/initialize/:retreatId', serviceTeamController.initializeDefaults);

// Export
router.post('/export/:retreatId', serviceTeamController.exportTeamsDocx);

export default router;
