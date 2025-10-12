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
import { requirePermission, requireRetreatAccess } from '../middleware/authorization';

const router = Router();

// Public routes for walker and server registration
router.post('/new', validateRequest(createParticipantSchema), createParticipant);

router.use(isAuthenticated);

router.get('/', requirePermission('participant:list'), getAllParticipants);
router.get('/:id', requirePermission('participant:read'), getParticipantById);
router.post(
	'/import/:retreatId',
	requirePermission('participant:create'),
	requireRetreatAccess('retreatId'),
	importParticipants,
);
router.put(
	'/:id',
	validateRequest(updateParticipantSchema),
	requirePermission('participant:update'),
	updateParticipant,
);
router.delete('/:id', requirePermission('participant:delete'), deleteParticipant);

export default router;
