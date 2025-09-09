import { Router } from 'express';
import participantRoutes from './participantRoutes';

import authRoutes from './authRoutes';
import houseRoutes from './houseRoutes';
import retreatBedRoutes from './retreatBedRoutes';
import retreatRoutes from './retreatRoutes';
import chargeRoutes from './chargeRoutes';
import tableMesaRoutes from './tableMesaRoutes';
import messageTemplateRoutes from './messageTemplateRoutes';

const router = Router();

router.use('/auth', authRoutes);
router.use('/participants', participantRoutes);
router.use('/houses', houseRoutes);
router.use('/retreats', retreatRoutes);
router.use('/charges', chargeRoutes);
router.use(retreatBedRoutes);
router.use('/tables', tableMesaRoutes);
router.use('/message-templates', messageTemplateRoutes);

export default router;
