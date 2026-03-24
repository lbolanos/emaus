import { Router } from 'express';
import { ParticipantCommunicationController } from '../controllers/participantCommunicationController';
import { isAuthenticated } from '../middleware/authentication';
import { requireRetreatAccess, requirePermission } from '../middleware/authorization';

const router = Router();
const controller = new ParticipantCommunicationController();

// All routes require authentication
router.use(isAuthenticated);

// Get communications for a specific participant
router.get('/participant/:participantId', controller.getParticipantCommunications);

// Get communications for a specific retreat
router.get(
	'/retreat/:retreatId',
	requireRetreatAccess('retreatId'),
	controller.getRetreatCommunications,
);

// Get communication statistics for a retreat
router.get(
	'/retreat/:retreatId/stats',
	requireRetreatAccess('retreatId'),
	controller.getRetreatCommunicationStats,
);

// Create a new communication record
router.post('/', requirePermission('participant:update'), controller.createCommunication);

// Delete a communication record
router.delete('/:id', requirePermission('participant:update'), controller.deleteCommunication);

// Email sending endpoints
router.post(
	'/email/send',
	requirePermission('participant:update'),
	controller.sendEmailViaBackend,
);
router.get('/email/config', requirePermission('participant:read'), controller.checkSmtpConfig);
router.post(
	'/email/test',
	requirePermission('participant:update'),
	controller.sendTestEmail,
);
router.post(
	'/email/verify',
	requirePermission('participant:read'),
	controller.verifySmtpConnection,
);

export default router;
