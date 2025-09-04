import { Router } from 'express';
import { getRetreatBeds, assignParticipantToBed } from '../controllers/retreatBedController';
import { isAuthenticated } from '../middleware/isAuthenticated';

const router = Router();

router.get('/retreats/:retreatId/beds', isAuthenticated, getRetreatBeds);
router.put('/retreat-beds/:bedId/assign', isAuthenticated, assignParticipantToBed);

export default router;
