import { Router } from 'express';
import { RetreatResponsabilityController } from '../controllers/retreatResponsabilityController';
import { isAuthenticated } from '../middleware/authentication';
import { requirePermission } from '../middleware/authorization';

const router = Router();
const retreatResponsabilityController = new RetreatResponsabilityController();

// All retreat responsability routes require authentication
router.use(isAuthenticated);

// Create responsability
router.post(
	'/',
	requirePermission('responsability:create'),
	retreatResponsabilityController.createResponsability.bind(retreatResponsabilityController),
);

// Get all responsibilities (with optional filters)
router.get(
	'/',
	requirePermission('responsability:list'),
	retreatResponsabilityController.getAllResponsibilities.bind(retreatResponsabilityController),
);

// Get responsability by ID
router.get(
	'/:id',
	requirePermission('responsability:read'),
	retreatResponsabilityController.getResponsabilityById.bind(retreatResponsabilityController),
);

// Update responsability
router.put(
	'/:id',
	requirePermission('responsability:update'),
	retreatResponsabilityController.updateResponsability.bind(retreatResponsabilityController),
);

// Delete responsability
router.delete(
	'/:id',
	requirePermission('responsability:delete'),
	retreatResponsabilityController.deleteResponsability.bind(retreatResponsabilityController),
);

// Assign responsability to participant
router.post(
	'/:id/assign',
	requirePermission('responsability:assign'),
	retreatResponsabilityController.assignResponsabilityToParticipant.bind(
		retreatResponsabilityController,
	),
);

// Remove responsability from participant
router.post(
	'/:id/unassign',
	requirePermission('responsability:unassign'),
	retreatResponsabilityController.removeResponsabilityFromParticipant.bind(
		retreatResponsabilityController,
	),
);

// Get available responsibilities for a retreat
router.get(
	'/retreat/:retreatId/available',
	requirePermission('responsability:read'),
	retreatResponsabilityController.getAvailableResponsibilities.bind(
		retreatResponsabilityController,
	),
);

// Get responsibilities summary by retreat
router.get(
	'/retreat/:retreatId/summary',
	requirePermission('responsability:read'),
	retreatResponsabilityController.getResponsibilitiesSummaryByRetreat.bind(
		retreatResponsabilityController,
	),
);

export default router;
