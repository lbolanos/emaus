import { Router } from 'express';
import { getRetreatBeds, assignParticipantToBed } from '../controllers/retreatBedController';
import { isAuthenticated } from '../middleware/isAuthenticated';
import { requirePermission } from '../middleware/authorization';

const router = Router();

router.get(
	'/retreats/:retreatId/beds',
	isAuthenticated,
	requirePermission('house:read'),
	getRetreatBeds,
);
router.put(
	'/retreat-beds/:bedId/assign',
	isAuthenticated,
	requirePermission('house:update'),
	assignParticipantToBed,
);

export default router;
