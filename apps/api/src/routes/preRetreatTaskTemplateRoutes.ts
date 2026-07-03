import { Router } from 'express';
import {
	listTemplates,
	getTemplate,
	createTemplate,
	updateTemplate,
	deleteTemplate,
	listTemplateSets,
	getTemplateSet,
	createTemplateSet,
	updateTemplateSet,
	deleteTemplateSet,
} from '../controllers/preRetreatTaskTemplateController';
import { isAuthenticated } from '../middleware/isAuthenticated';
import { requirePermission } from '../middleware/authorization';
import { validateRequest } from '../middleware/validateRequest';
import {
	CreatePreRetreatTaskTemplateSchema,
	UpdatePreRetreatTaskTemplateSchema,
	CreatePreRetreatTaskTemplateSetSchema,
	UpdatePreRetreatTaskTemplateSetSchema,
} from '@repo/types';

const router = Router();

router.use(isAuthenticated);

// Template sets (antes de /:id para no chocar con las rutas de items)
router.get('/sets', requirePermission('preRetreatTaskTemplate:read'), listTemplateSets);
router.get('/sets/:id', requirePermission('preRetreatTaskTemplate:read'), getTemplateSet);
router.post(
	'/sets',
	validateRequest(CreatePreRetreatTaskTemplateSetSchema),
	requirePermission('preRetreatTaskTemplate:manage'),
	createTemplateSet,
);
router.patch(
	'/sets/:id',
	validateRequest(UpdatePreRetreatTaskTemplateSetSchema),
	requirePermission('preRetreatTaskTemplate:manage'),
	updateTemplateSet,
);
router.delete('/sets/:id', requirePermission('preRetreatTaskTemplate:manage'), deleteTemplateSet);

// Items del template
router.get('/', requirePermission('preRetreatTaskTemplate:read'), listTemplates);
router.get('/:id', requirePermission('preRetreatTaskTemplate:read'), getTemplate);
router.post(
	'/',
	validateRequest(CreatePreRetreatTaskTemplateSchema),
	requirePermission('preRetreatTaskTemplate:manage'),
	createTemplate,
);
router.patch(
	'/:id',
	validateRequest(UpdatePreRetreatTaskTemplateSchema),
	requirePermission('preRetreatTaskTemplate:manage'),
	updateTemplate,
);
router.delete('/:id', requirePermission('preRetreatTaskTemplate:manage'), deleteTemplate);

export default router;
