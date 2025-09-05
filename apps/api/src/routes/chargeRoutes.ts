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

const router = Router();

router.use(isAuthenticated);

router.get('/', getAllCharges);
router.get('/:id', getChargeById);
router.post('/', createCharge);
router.put('/:id', updateCharge);
router.delete('/:id', deleteCharge);

// Charge assignment routes
router.post('/:id/assign', assignCharge);
router.delete('/:id/assign/:participantId', removeCharge);

export default router;
