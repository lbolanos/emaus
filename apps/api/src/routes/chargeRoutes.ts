import { Router } from 'express';
import {
	createCharge,
	deleteCharge,
	getAllCharges,
	getChargeById,
	updateCharge,
	assignCharge,
	removeCharge,
} from '../controllers/chargeController';
import { isAuthenticated } from '../middleware/isAuthenticated';
import { requirePermission } from '../middleware/authorization';

const router = Router();

router.use(isAuthenticated);

router.get('/', requirePermission('payment:list'), getAllCharges);
router.get('/:id', requirePermission('payment:read'), getChargeById);
router.post('/', requirePermission('payment:create'), createCharge);
router.put('/:id', requirePermission('payment:update'), updateCharge);
router.delete('/:id', requirePermission('payment:delete'), deleteCharge);

// Charge assignment routes
router.post('/:id/assign', requirePermission('payment:update'), assignCharge);
router.delete('/:id/assign/:participantId', requirePermission('payment:update'), removeCharge);

export default router;
