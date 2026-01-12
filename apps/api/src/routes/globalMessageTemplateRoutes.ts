import { Router } from 'express';
import { GlobalMessageTemplateController } from '../controllers/globalMessageTemplateController';
import { validateRequest } from '../middleware/validateRequest';
import { CreateGlobalMessageTemplateSchema, UpdateGlobalMessageTemplateSchema } from '@repo/types';
import { isAuthenticated } from '../middleware/isAuthenticated';
import { requirePermission } from '../middleware/authorization';

const router = Router();
const globalMessageTemplateController = new GlobalMessageTemplateController();

router.use(isAuthenticated);

// Get all global message templates
router.get(
	'/',
	requirePermission('globalMessageTemplate:read'),
	globalMessageTemplateController.getAll.bind(globalMessageTemplateController),
);

// Get global message template by ID
router.get(
	'/:id',
	requirePermission('globalMessageTemplate:read'),
	globalMessageTemplateController.getById.bind(globalMessageTemplateController),
);

// Create global message template
router.post(
	'/',
	validateRequest(CreateGlobalMessageTemplateSchema),
	requirePermission('globalMessageTemplate:create'),
	globalMessageTemplateController.create.bind(globalMessageTemplateController),
);

// Update global message template
router.put(
	'/:id',
	validateRequest(UpdateGlobalMessageTemplateSchema),
	requirePermission('globalMessageTemplate:update'),
	globalMessageTemplateController.update.bind(globalMessageTemplateController),
);

// Delete global message template
router.delete(
	'/:id',
	requirePermission('globalMessageTemplate:delete'),
	globalMessageTemplateController.delete.bind(globalMessageTemplateController),
);

// Toggle active status
router.post(
	'/:id/toggle-active',
	requirePermission('globalMessageTemplate:update'),
	globalMessageTemplateController.toggleActive.bind(globalMessageTemplateController),
);

// Copy global template to specific retreat
router.post(
	'/:id/copy-to-retreat',
	requirePermission('globalMessageTemplate:read'),
	globalMessageTemplateController.copyToRetreat.bind(globalMessageTemplateController),
);

// Copy global template to community (uses community admin check in controller)
router.post(
	'/:id/copy-to-community',
	globalMessageTemplateController.copyToCommunity.bind(globalMessageTemplateController),
);

// Copy all active global templates to community (uses community admin check in controller)
router.post(
	'/copy-all-to-community/:communityId',
	globalMessageTemplateController.copyAllToCommunity.bind(globalMessageTemplateController),
);

// Copy retreat template to community (uses community admin check in controller)
router.post(
	'/retreat-templates/:id/copy-to-community',
	globalMessageTemplateController.copyRetreatTemplateToCommunity.bind(
		globalMessageTemplateController,
	),
);

export default router;
