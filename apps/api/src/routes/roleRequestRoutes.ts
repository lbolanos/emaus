import { Router } from 'express';
import {
	createRoleRequest,
	getRetreatRoleRequests,
	getUserRoleRequests,
	approveRoleRequest,
	rejectRoleRequest,
	getActiveUserRequest,
} from '../controllers/roleRequestController';
import { isAuthenticated } from '../middleware/isAuthenticated';
import { requireRetreatCreator } from '../middleware/authorization';

const router = Router();

// All routes require authentication
router.use(isAuthenticated);

// Create role request
router.post('/requests', (req: any, res: any) => createRoleRequest(req, res));

// Get user's role requests
router.get('/users/:userId/requests', (req: any, res: any) => getUserRoleRequests(req, res));

// Get active request for user in specific retreat
router.get('/retreats/:retreatId/active-request', (req: any, res: any) =>
	getActiveUserRequest(req, res),
);

// Get retreat's role requests (only retreat creator)
router.get(
	'/retreats/:retreatId/requests',
	requireRetreatCreator('retreatId'),
	(req: any, res: any) => getRetreatRoleRequests(req, res),
);

// Approve role request (only retreat creator)
router.put('/requests/:requestId/approve', requireRetreatCreator(), (req: any, res: any) =>
	approveRoleRequest(req, res),
);

// Reject role request (only retreat creator)
router.put('/requests/:requestId/reject', requireRetreatCreator(), (req: any, res: any) =>
	rejectRoleRequest(req, res),
);

export default router;
