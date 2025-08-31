import { Router } from 'express';
import walkerRoutes from './walkerRoutes';

import authRoutes from './authRoutes';
import houseRoutes from './houseRoutes';
import retreatRoutes from './retreatRoutes';

const router = Router();

router.use('/auth', authRoutes);
router.use('/walkers', walkerRoutes);
router.use('/houses', houseRoutes);
router.use('/retreats', retreatRoutes);

export default router;