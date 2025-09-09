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

const router = Router();

router.get('/', getMessageTemplates);
router.get('/:id', getMessageTemplateById);
router.post('/', validateRequest(CreateMessageTemplateSchema), createMessageTemplate);
router.put('/:id', validateRequest(UpdateMessageTemplateSchema), updateMessageTemplate);
router.delete('/:id', deleteMessageTemplate);

export default router;
