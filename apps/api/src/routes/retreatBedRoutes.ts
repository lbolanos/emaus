import { Router } from 'express';
import { getRetreatBeds, assignParticipantToBed } from '../controllers/retreatBedController';
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

export default router;
