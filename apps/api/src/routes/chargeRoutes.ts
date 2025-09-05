import { Router } from 'express';
import {
  createCharge,
  deleteCharge,
  getAllCharges,
  getChargeById,
  updateCharge,
  assignChargeToParticipant,
  removeChargeFromParticipant,
  getChargesForParticipant,
  getParticipantsForCharge
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
router.post('/:chargeId/assign/:participantId', assignChargeToParticipant);
router.delete('/:chargeId/remove/:participantId', removeChargeFromParticipant);
router.get('/participant/:participantId', getChargesForParticipant);
router.get('/:chargeId/participants', getParticipantsForCharge);

export default router;
