import { Router } from 'express';
import { ParticipantCommunicationController } from '../controllers/participantCommunicationController';
import { isAuthenticated } from '../middleware/authentication';

const router = Router();
const controller = new ParticipantCommunicationController();

// All routes require authentication
router.use(isAuthenticated);

// Get communications for a specific participant
router.get('/participant/:participantId', controller.getParticipantCommunications);

// Get communications for a specific retreat
router.get('/retreat/:retreatId', controller.getRetreatCommunications);

// Get communication statistics for a retreat
router.get('/retreat/:retreatId/stats', controller.getRetreatCommunicationStats);

// Create a new communication record
router.post('/', controller.createCommunication);

// Delete a communication record
router.delete('/:id', controller.deleteCommunication);

export default router;
