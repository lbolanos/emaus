import { Router } from 'express';
import { createFlyerTemplateSchema, updateFlyerTemplateSchema } from '@repo/types';
import {
	createFlyerTemplate,
	deleteFlyerTemplate,
	getFlyerTemplates,
	updateFlyerTemplate,
} from '../controllers/flyerTemplateController';
import { isAuthenticated } from '../middleware/isAuthenticated';
import { validateRequest } from '../middleware/validateRequest';
import { requirePermission } from '../middleware/authorization';

const router = Router();

router.use(isAuthenticated);

// `retreat:update` gates the feature; who may touch each individual template
// (author, community admin, superadmin) is decided in the service.
router.get('/', requirePermission('retreat:update'), getFlyerTemplates);
router.post(
	'/',
	validateRequest(createFlyerTemplateSchema),
	requirePermission('retreat:update'),
	createFlyerTemplate,
);
router.put(
	'/:id',
	validateRequest(updateFlyerTemplateSchema),
	requirePermission('retreat:update'),
	updateFlyerTemplate,
);
router.delete('/:id', requirePermission('retreat:update'), deleteFlyerTemplate);

export default router;
