import { Router } from 'express';
import { streamChat, chatStatus, saveConversation, getConversations, getConversation, deleteConversation } from '../controllers/aiChatController';
import { isAuthenticated } from '../middleware/isAuthenticated';
import { aiChatLimiter } from '../middleware/rateLimiting';

const router = Router();

router.use(isAuthenticated);
router.get('/status', chatStatus);
// Rate limit dedicado: el stream consume tokens del proveedor (costo por request).
router.post('/stream', aiChatLimiter, streamChat);
router.post('/conversations', saveConversation);
router.get('/conversations', getConversations);
router.get('/conversations/:id', getConversation);
router.delete('/conversations/:id', deleteConversation);

export default router;
