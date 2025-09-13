import { Router } from 'express';
import {
	getMessageTemplates,
	getMessageTemplateById,
	createMessageTemplate,
	updateMessageTemplate,
	deleteMessageTemplate,
} from '../controllers/messageTemplateController';
import { validateRequest } from '../middleware/validateRequest';
import { CreateMessageTemplateSchema, UpdateMessageTemplateSchema } from '@repo/types';
import { isAuthenticated } from '../middleware/isAuthenticated';
import { requirePermission } from '../middleware/authorization';

const router = Router();

router.use(isAuthenticated);

router.get('/', requirePermission('participant:read'), getMessageTemplates);
router.get('/:id', requirePermission('participant:read'), getMessageTemplateById);
router.post(
	'/',
	validateRequest(CreateMessageTemplateSchema),
	requirePermission('participant:create'),
	createMessageTemplate,
);
router.put(
	'/:id',
	validateRequest(UpdateMessageTemplateSchema),
	requirePermission('participant:update'),
	updateMessageTemplate,
);
router.delete('/:id', requirePermission('participant:delete'), deleteMessageTemplate);

export default router;
