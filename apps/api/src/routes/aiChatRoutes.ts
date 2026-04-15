import { Router } from 'express';
import { streamChat, chatStatus, saveConversation, getConversations, getConversation, deleteConversation } from '../controllers/aiChatController';
import { isAuthenticated } from '../middleware/isAuthenticated';

const router = Router();

router.use(isAuthenticated);
router.get('/status', chatStatus);
router.post('/stream', streamChat);
router.post('/conversations', saveConversation);
router.get('/conversations', getConversations);
router.get('/conversations/:id', getConversation);
router.delete('/conversations/:id', deleteConversation);

export default router;
