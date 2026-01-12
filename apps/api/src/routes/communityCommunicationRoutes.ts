import { Router } from 'express';
import { CommunityCommunicationController } from '../controllers/communityCommunicationController';
import { isAuthenticated } from '../middleware/authentication';

const router = Router();
const controller = new CommunityCommunicationController();

// All routes require authentication
router.use(isAuthenticated);

// Get communications for a specific community member
router.get('/member/:memberId', controller.getMemberCommunications);

// Get communications for a specific community
router.get('/community/:communityId', controller.getCommunityCommunications);

// Get communication statistics for a community
router.get('/community/:communityId/stats', controller.getCommunityCommunicationStats);

// Create a new communication record
router.post('/', controller.createCommunication);

// Delete a communication record
router.delete('/:id', controller.deleteCommunication);

export default router;
