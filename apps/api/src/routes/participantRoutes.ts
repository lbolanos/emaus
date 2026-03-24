import { Router } from 'express';
import {
	createParticipant,
	deleteParticipant,
	getAllParticipants,
	getParticipantById,
	importParticipants,
	updateParticipant,
	updateSelfParticipant,
	checkParticipantEmail,
	confirmExistingParticipantEmail,
} from '../controllers/participantController';
import { validateRequest } from '../middleware/validateRequest';
import { createParticipantSchema, updateParticipantSchema } from '@repo/types';
import { isAuthenticated } from '../middleware/isAuthenticated';
import { requirePermission, requireRetreatAccess } from '../middleware/authorization';
import { publicParticipantLimiter, emailCheckLimiter } from '../middleware/rateLimiting';

const router = Router();

// Public routes for walker and server registration (with dedicated rate limiters)
router.post('/new', publicParticipantLimiter, validateRequest(createParticipantSchema), createParticipant);

// Public check-email with reCAPTCHA protection and rate limiting
router.get('/check-email/:email', emailCheckLimiter, checkParticipantEmail);

// Public confirm-registration: auto-register existing participant for a retreat
router.post('/confirm-registration', publicParticipantLimiter, confirmExistingParticipantEmail);

router.use(isAuthenticated);

router.get('/', requirePermission('participant:list'), getAllParticipants);
router.get('/:id', requirePermission('participant:read'), getParticipantById);
router.post(
	'/import/:retreatId',
	requirePermission('participant:create'),
	requireRetreatAccess('retreatId'),
	importParticipants,
);
router.put('/self', updateSelfParticipant);
router.put(
	'/:id',
	validateRequest(updateParticipantSchema),
	requirePermission('participant:update'),
	updateParticipant,
);
router.delete('/:id', requirePermission('participant:delete'), deleteParticipant);

export default router;
