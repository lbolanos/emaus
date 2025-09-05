import { Router } from 'express';
import {
  createRetreatCharge,
  deleteRetreatCharge,
  getAllRetreatCharges,
  getRetreatChargeById,
  updateRetreatCharge,
  assignChargeToParticipant,
  removeChargeFromParticipant,
  getChargesForParticipant,
  getParticipantsForCharge
} from '../controllers/retreatChargeController';
import { isAuthenticated } from '../middleware/isAuthenticated';

const router = Router();

router.use(isAuthenticated);

router.get('/', getAllRetreatCharges);
router.get('/:id', getRetreatChargeById);
router.post('/', createRetreatCharge);
router.put('/:id', updateRetreatCharge);
router.delete('/:id', deleteRetreatCharge);

// Charge assignment routes
router.post('/:chargeId/assign/:participantId', assignChargeToParticipant);
router.delete('/:chargeId/remove/:participantId', removeChargeFromParticipant);
router.get('/participant/:participantId', getChargesForParticipant);
router.get('/:chargeId/participants', getParticipantsForCharge);

export default router;
