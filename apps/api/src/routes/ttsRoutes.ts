import { Router } from 'express';
import { speak, voices } from '../controllers/ttsController';
import { isAuthenticated } from '../middleware/isAuthenticated';

const router = Router();

router.use(isAuthenticated);
router.post('/speak', speak);
router.get('/voices', voices);

export default router;
