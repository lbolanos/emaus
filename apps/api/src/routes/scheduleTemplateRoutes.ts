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
} from '../controllers/scheduleTemplateController';
import { isAuthenticated } from '../middleware/isAuthenticated';
import { requirePermission } from '../middleware/authorization';
import { validateRequest } from '../middleware/validateRequest';
import {
	CreateScheduleTemplateSchema,
	UpdateScheduleTemplateSchema,
	CreateScheduleTemplateSetSchema,
	UpdateScheduleTemplateSetSchema,
} from '@repo/types';

const router = Router();

router.use(isAuthenticated);

// Template sets (list first so /sets/:id doesn't conflict with /:id below)
router.get('/sets', requirePermission('scheduleTemplate:read'), listTemplateSets);
router.get('/sets/:id', requirePermission('scheduleTemplate:read'), getTemplateSet);
router.post(
	'/sets',
	validateRequest(CreateScheduleTemplateSetSchema),
	requirePermission('scheduleTemplate:manage'),
	createTemplateSet,
);
router.patch(
	'/sets/:id',
	validateRequest(UpdateScheduleTemplateSetSchema),
	requirePermission('scheduleTemplate:manage'),
	updateTemplateSet,
);
router.delete('/sets/:id', requirePermission('scheduleTemplate:manage'), deleteTemplateSet);

// Individual template items
router.get('/', requirePermission('scheduleTemplate:read'), listTemplates);
router.get('/:id', requirePermission('scheduleTemplate:read'), getTemplate);
router.post(
	'/',
	validateRequest(CreateScheduleTemplateSchema),
	requirePermission('scheduleTemplate:manage'),
	createTemplate,
);
router.patch(
	'/:id',
	validateRequest(UpdateScheduleTemplateSchema),
	requirePermission('scheduleTemplate:manage'),
	updateTemplate,
);
router.delete('/:id', requirePermission('scheduleTemplate:manage'), deleteTemplate);

export default router;
