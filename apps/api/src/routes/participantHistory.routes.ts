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
} from '../controllers/participantHistoryController';
import { isAuthenticated } from '../middleware/authentication';

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
router.get('/history/user/:userId', getUserRetreatHistoryByIdController);

// Get history for a specific user and retreat
router.get('/history/user/:userId/retreat/:retreatId', getUserHistoryForRetreatController);

// Get all participants (history) for a specific retreat
router.get('/history/retreat/:retreatId/participants', getParticipantsByRetreatController);

// Get all history entries for a specific participant
router.get('/history/participant/:participantId', getHistoryByParticipantIdController);

// Get participants by role for a specific retreat
router.get('/history/retreat/:retreatId/role/:role', getParticipantsByRoleController);

// ==================== CHARLISTAS ENDPOINTS ====================

// Get charlistas (speakers) for a retreat or globally
router.get('/history/charlistas', getCharlistasController);

// ==================== CRUD OPERATIONS (ADMIN ONLY) ====================

// Create a new history entry (admin only)
router.post('/history', createHistoryEntryController);

// Update a history entry (admin only)
router.put('/history/:id', updateHistoryEntryController);

// Delete a history entry (admin only)
router.delete('/history/:id', deleteHistoryEntryController);

// Mark a retreat as the user's primary retreat (admin only)
router.put('/history/user/:userId/primary/:historyId', markPrimaryRetreatController);

export default router;
