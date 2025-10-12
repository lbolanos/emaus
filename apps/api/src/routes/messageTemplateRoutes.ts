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

router.get('/', requirePermission('messageTemplate:read'), getMessageTemplates);
router.get('/:id', requirePermission('messageTemplate:read'), getMessageTemplateById);
router.post(
	'/',
	validateRequest(CreateMessageTemplateSchema),
	requirePermission('messageTemplate:create'),
	createMessageTemplate,
);
router.put(
	'/:id',
	validateRequest(UpdateMessageTemplateSchema),
	requirePermission('messageTemplate:update'),
	updateMessageTemplate,
);
router.delete('/:id', requirePermission('messageTemplate:delete'), deleteMessageTemplate);

export default router;
