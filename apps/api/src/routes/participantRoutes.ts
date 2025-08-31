import { Router } from 'express';
import {
  createWalker,
  createServer,
  deleteParticipant,
  getAllParticipants,
  getParticipantById,
  updateParticipant,
} from '../controllers/participantController';
import { validateRequest } from '../middleware/validateRequest';
import { createWalkerSchema, createServerSchema, updateParticipantSchema } from '@repo/types';
import { isAuthenticated } from '../middleware/isAuthenticated';

const router = Router();

// Public routes for walker and server registration
router.post('/walker', validateRequest(createWalkerSchema), createWalker);
router.post('/server', validateRequest(createServerSchema), createServer);

router.use(isAuthenticated);

router.get('/', getAllParticipants);
router.get('/:id', getParticipantById);
router.put('/:id', validateRequest(updateParticipantSchema), updateParticipant);
router.delete('/:id', deleteParticipant);

export default router;