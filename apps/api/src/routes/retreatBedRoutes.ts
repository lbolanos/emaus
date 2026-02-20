import { Router } from 'express';
import {
	getRetreatBeds,
	assignParticipantToBed,
	autoAssignBeds,
	clearBedAssignments,
} from '../controllers/retreatBedController';
import { isAuthenticated } from '../middleware/isAuthenticated';
import { requirePermission, requireRetreatAccess } from '../middleware/authorization';

const router = Router();

router.get(
	'/retreats/:retreatId/beds',
	isAuthenticated,
	requirePermission('house:read'),
	requireRetreatAccess('retreatId'),
	getRetreatBeds,
);
router.put(
	'/retreat-beds/:bedId/assign',
	isAuthenticated,
	requirePermission('house:update'),
	assignParticipantToBed,
);
router.post(
	'/retreats/:retreatId/auto-assign-beds',
	isAuthenticated,
	requirePermission('house:update'),
	requireRetreatAccess('retreatId'),
	autoAssignBeds,
);
router.delete(
	'/retreats/:retreatId/bed-assignments',
	isAuthenticated,
	requirePermission('house:update'),
	requireRetreatAccess('retreatId'),
	clearBedAssignments,
);

export default router;
