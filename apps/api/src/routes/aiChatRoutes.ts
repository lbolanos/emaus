import { Router } from 'express';
import { streamChat, chatStatus } from '../controllers/aiChatController';
import { isAuthenticated } from '../middleware/isAuthenticated';

const router = Router();

router.use(isAuthenticated);
router.get('/status', chatStatus);
router.post('/stream', streamChat);

export default router;
