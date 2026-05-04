import { Router } from 'express';
import {
	getUserRetreatHistoryController,
	getUserRetreatHistoryByRoleController,
	getPrimaryRetreatController,
	getUserRetreatHistoryByIdController,
	getUserHistoryForRetreatController,
	getParticipantsByRetreatController,
	getHistoryByParticipantIdController,
	getParticipantsByRoleController,
	getCharlistasController,
	createHistoryEntryController,
	updateHistoryEntryController,
	deleteHistoryEntryController,
	markPrimaryRetreatController,
	updateBagMadeController,
} from '../controllers/retreatParticipantController';
import { isAuthenticated } from '../middleware/authentication';
import { requirePermission, requireRetreatAccess } from '../middleware/authorization';

const router = Router();

// ==================== AUTHENTICATED ROUTES ====================
// IMPORTANT: this router is mounted in `mainRouter` WITHOUT a path prefix
// (`router.use(participantHistoryRoutes)`), so any blanket
// `router.use(middleware)` here applies to EVERY request flowing through
// mainRouter — even ones meant for sibling routers registered later (e.g.
// `/schedule/public/...`). Attach `isAuthenticated` per-route instead.

// ==================== USER RETREAT HISTORY ====================

router.get('/history/my-retreats', isAuthenticated, getUserRetreatHistoryController);
router.get(
	'/history/my-retreats/role/:role',
	isAuthenticated,
	getUserRetreatHistoryByRoleController,
);
router.get('/history/my-retreats/primary', isAuthenticated, getPrimaryRetreatController);

// ==================== ADMIN/COORDINATOR ENDPOINTS ====================

router.get(
	'/history/user/:userId',
	isAuthenticated,
	requirePermission('participant:read'),
	getUserRetreatHistoryByIdController,
);

router.get(
	'/history/user/:userId/retreat/:retreatId',
	isAuthenticated,
	requirePermission('participant:read'),
	requireRetreatAccess('retreatId'),
	getUserHistoryForRetreatController,
);

router.get(
	'/history/retreat/:retreatId/participants',
	isAuthenticated,
	requireRetreatAccess('retreatId'),
	getParticipantsByRetreatController,
);

router.get(
	'/history/participant/:participantId',
	isAuthenticated,
	requirePermission('participant:read'),
	getHistoryByParticipantIdController,
);

router.get(
	'/history/retreat/:retreatId/role/:role',
	isAuthenticated,
	requireRetreatAccess('retreatId'),
	getParticipantsByRoleController,
);

// ==================== CHARLISTAS ENDPOINTS ====================

router.get(
	'/history/charlistas',
	isAuthenticated,
	requirePermission('participant:read'),
	getCharlistasController,
);

// ==================== CRUD OPERATIONS (ADMIN ONLY) ====================

router.post(
	'/history',
	isAuthenticated,
	requirePermission('participant:update'),
	createHistoryEntryController,
);
router.put(
	'/history/:id',
	isAuthenticated,
	requirePermission('participant:update'),
	updateHistoryEntryController,
);
router.delete(
	'/history/:id',
	isAuthenticated,
	requirePermission('participant:update'),
	deleteHistoryEntryController,
);
router.put(
	'/history/user/:userId/primary/:historyId',
	isAuthenticated,
	requirePermission('participant:update'),
	markPrimaryRetreatController,
);
router.patch(
	'/history/retreat/:retreatId/participant/:participantId/bag-made',
	isAuthenticated,
	requirePermission('participant:update'),
	requireRetreatAccess('retreatId'),
	updateBagMadeController,
);

export default router;
