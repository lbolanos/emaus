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

// All routes require authentication
router.use(isAuthenticated);

// ==================== USER RETREAT HISTORY ====================

// Get complete retreat history for the authenticated user
router.get('/history/my-retreats', getUserRetreatHistoryController);

// Get retreat history for the authenticated user filtered by role
router.get('/history/my-retreats/role/:role', getUserRetreatHistoryByRoleController);

// Get the authenticated user's primary retreat
router.get('/history/my-retreats/primary', getPrimaryRetreatController);

// ==================== ADMIN/COORDINATOR ENDPOINTS ====================

// Get retreat history for a specific user (admin/coordinator only)
router.get(
	'/history/user/:userId',
	requirePermission('participant:read'),
	getUserRetreatHistoryByIdController,
);

// Get history for a specific user and retreat
router.get(
	'/history/user/:userId/retreat/:retreatId',
	requirePermission('participant:read'),
	requireRetreatAccess('retreatId'),
	getUserHistoryForRetreatController,
);

// Get all participants (history) for a specific retreat
router.get(
	'/history/retreat/:retreatId/participants',
	requireRetreatAccess('retreatId'),
	getParticipantsByRetreatController,
);

// Get all history entries for a specific participant
router.get(
	'/history/participant/:participantId',
	requirePermission('participant:read'),
	getHistoryByParticipantIdController,
);

// Get participants by role for a specific retreat
router.get(
	'/history/retreat/:retreatId/role/:role',
	requireRetreatAccess('retreatId'),
	getParticipantsByRoleController,
);

// ==================== CHARLISTAS ENDPOINTS ====================

// Get charlistas (speakers) for a retreat or globally
router.get('/history/charlistas', requirePermission('participant:read'), getCharlistasController);

// ==================== CRUD OPERATIONS (ADMIN ONLY) ====================

// Create a new history entry (admin only)
router.post('/history', requirePermission('participant:update'), createHistoryEntryController);

// Update a history entry (admin only)
router.put(
	'/history/:id',
	requirePermission('participant:update'),
	updateHistoryEntryController,
);

// Delete a history entry (admin only)
router.delete(
	'/history/:id',
	requirePermission('participant:update'),
	deleteHistoryEntryController,
);

// Mark a retreat as the user's primary retreat (admin only)
router.put(
	'/history/user/:userId/primary/:historyId',
	requirePermission('participant:update'),
	markPrimaryRetreatController,
);

// Update bagMade flag for a participant in a retreat
router.patch(
	'/history/retreat/:retreatId/participant/:participantId/bag-made',
	requirePermission('participant:update'),
	updateBagMadeController,
);

export default router;
