import { Router } from 'express';
import {
	getMessageTemplates,
	getMessageTemplateById,
	createMessageTemplate,
	updateMessageTemplate,
	deleteMessageTemplate,
	getCommunityMessageTemplates,
	createCommunityMessageTemplate,
	updateCommunityMessageTemplate,
	deleteCommunityMessageTemplate,
} from '../controllers/messageTemplateController';
import { validateRequest } from '../middleware/validateRequest';
import { CreateMessageTemplateSchema, UpdateMessageTemplateSchema } from '@repo/types';
import { isAuthenticated } from '../middleware/isAuthenticated';
import { requirePermission } from '../middleware/authorization';

const router = Router();

router.use(isAuthenticated);

// ============================================
// Community-specific routes (must come before /:id routes)
// ============================================
// Note: Community routes don't use requirePermission middleware because access is checked
// via community admin status in the controller itself
router.get('/community/:communityId', getCommunityMessageTemplates);
router.post('/community/:communityId', createCommunityMessageTemplate);
router.put('/community/:communityId/:id', updateCommunityMessageTemplate);
router.delete('/community/:communityId/:id', deleteCommunityMessageTemplate);

// ============================================
// Retreat-specific routes
// ============================================
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
