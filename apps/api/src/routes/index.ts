import { Router } from 'express';
import participantRoutes from './participantRoutes';

import authRoutes from './authRoutes';
import houseRoutes from './houseRoutes';
import retreatBedRoutes from './retreatBedRoutes';
import retreatRoutes from './retreatRoutes';

const router = Router();

router.use('/auth', authRoutes);
router.use('/participants', participantRoutes);
router.use('/houses', houseRoutes);
router.use('/retreats', retreatRoutes);
router.use(retreatBedRoutes);

export default router;