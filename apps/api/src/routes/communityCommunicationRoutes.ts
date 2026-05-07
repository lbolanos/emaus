import { Router } from 'express';
import { CommunityCommunicationController } from '../controllers/communityCommunicationController';
import { isAuthenticated } from '../middleware/authentication';
import { requireCommunityAccess } from '../middleware/authorization';

const router = Router();
const controller = new CommunityCommunicationController();

// All routes require authentication
router.use(isAuthenticated);

// Get communications for a specific community member
router.get('/member/:memberId', controller.getMemberCommunications);

// Get communications for a specific community
router.get(
	'/community/:communityId',
	requireCommunityAccess('communityId'),
	controller.getCommunityCommunications,
);

// Get communication statistics for a community
router.get(
	'/community/:communityId/stats',
	requireCommunityAccess('communityId'),
	controller.getCommunityCommunicationStats,
);

// Create a new communication record
router.post('/', controller.createCommunication);

// Send email via backend SMTP for a community member
router.post('/email/send', controller.sendEmailViaBackend);

// Delete a communication record
router.delete('/:id', controller.deleteCommunication);

export default router;
