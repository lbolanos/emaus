import { Router } from 'express';
import { getAllRetreats, createRetreat } from '../controllers/retreatController';
import { isAuthenticated } from '../middleware/isAuthenticated';

const router = Router();

router.use(isAuthenticated);

router.get('/', getAllRetreats);
router.post('/', createRetreat);

export default router;
