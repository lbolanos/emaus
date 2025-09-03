import { Router } from 'express';
import {
  createParticipant,
  deleteParticipant,
  getAllParticipants,
  getParticipantById,
  importParticipants,
  updateParticipant,
} from '../controllers/participantController';
import { validateRequest } from '../middleware/validateRequest';
import { createParticipantSchema, updateParticipantSchema } from '@repo/types';
import { isAuthenticated } from '../middleware/isAuthenticated';

const router = Router();

// Public routes for walker and server registration
router.post('/new', validateRequest(createParticipantSchema), createParticipant);

router.use(isAuthenticated);

router.get('/', getAllParticipants);
router.get('/:id', getParticipantById);
router.post('/import/:retreatId', importParticipants);
router.put('/:id', validateRequest(updateParticipantSchema), updateParticipant);
router.delete('/:id', deleteParticipant);

export default router;