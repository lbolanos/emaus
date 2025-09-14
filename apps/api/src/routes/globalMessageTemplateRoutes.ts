import { Router } from 'express';
import { GlobalMessageTemplateController } from '../controllers/globalMessageTemplateController';
import { isAuthenticated } from '../middleware/authentication';

const router = Router();
const globalMessageTemplateController = new GlobalMessageTemplateController();

// Get all global message templates (all roles can read)
router.get(
	'/',
	isAuthenticated,
	globalMessageTemplateController.getAll.bind(globalMessageTemplateController),
);

// Get global message template by ID (all roles can read)
router.get(
	'/:id',
	isAuthenticated,
	globalMessageTemplateController.getById.bind(globalMessageTemplateController),
);

// Create global message template (superadmin only)
router.post(
	'/',
	isAuthenticated,
	globalMessageTemplateController.create.bind(globalMessageTemplateController),
);

// Update global message template (superadmin only)
router.put(
	'/:id',
	isAuthenticated,
	globalMessageTemplateController.update.bind(globalMessageTemplateController),
);

// Delete global message template (superadmin only)
router.delete(
	'/:id',
	isAuthenticated,
	globalMessageTemplateController.delete.bind(globalMessageTemplateController),
);

// Toggle active status (superadmin only)
router.post(
	'/:id/toggle-active',
	isAuthenticated,
	globalMessageTemplateController.toggleActive.bind(globalMessageTemplateController),
);

// Copy global template to specific retreat (all roles with retreat access)
router.post(
	'/:id/copy-to-retreat',
	isAuthenticated,
	globalMessageTemplateController.copyToRetreat.bind(globalMessageTemplateController),
);

export default router;
