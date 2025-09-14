import { Router } from 'express';
import { RetreatChargeController } from '../controllers/retreatChargeController';
import { isAuthenticated } from '../middleware/authentication';
import { requirePermission } from '../middleware/authorization';

const router = Router();
const retreatChargeController = new RetreatChargeController();

// All retreat charge routes require authentication
router.use(isAuthenticated);

// Create charge
router.post(
	'/',
	requirePermission('charge:create'),
	retreatChargeController.createCharge.bind(retreatChargeController),
);

// Get all charges (with optional filters)
router.get(
	'/',
	requirePermission('charge:list'),
	retreatChargeController.getAllCharges.bind(retreatChargeController),
);

// Get charge by ID
router.get(
	'/:id',
	requirePermission('charge:read'),
	retreatChargeController.getChargeById.bind(retreatChargeController),
);

// Update charge
router.put(
	'/:id',
	requirePermission('charge:update'),
	retreatChargeController.updateCharge.bind(retreatChargeController),
);

// Delete charge
router.delete(
	'/:id',
	requirePermission('charge:delete'),
	retreatChargeController.deleteCharge.bind(retreatChargeController),
);

// Assign charge to participant
router.post(
	'/:id/assign',
	requirePermission('charge:assign'),
	retreatChargeController.assignChargeToParticipant.bind(retreatChargeController),
);

// Remove charge from participant
router.post(
	'/:id/unassign',
	requirePermission('charge:unassign'),
	retreatChargeController.removeChargeFromParticipant.bind(retreatChargeController),
);

// Get available charges for a retreat
router.get(
	'/retreat/:retreatId/available',
	requirePermission('charge:read'),
	retreatChargeController.getAvailableCharges.bind(retreatChargeController),
);

// Get charges summary by retreat
router.get(
	'/retreat/:retreatId/summary',
	requirePermission('charge:read'),
	retreatChargeController.getChargesSummaryByRetreat.bind(retreatChargeController),
);

export default router;
