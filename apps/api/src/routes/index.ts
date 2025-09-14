import { Router } from 'express';
import participantRoutes from './participantRoutes';

import authRoutes from './authRoutes';
import houseRoutes from './houseRoutes';
import retreatBedRoutes from './retreatBedRoutes';
import retreatRoutes from './retreatRoutes';
import chargeRoutes from './chargeRoutes';
import tableMesaRoutes from './tableMesaRoutes';
import messageTemplateRoutes from './messageTemplateRoutes';
import inventoryRoutes from './inventoryRoutes';
import retreatRoleRoutes from './retreatRoleRoutes';
import roleRequestRoutes from './roleRequestRoutes';
import permissionOverrideRoutes from './permissionOverrideRoutes';
import auditRoutes from './auditRoutes';
import permissionInheritanceRoutes from './permissionInheritanceRoutes';

const router = Router();

router.use('/auth', authRoutes);
router.use('/participants', participantRoutes);
router.use('/houses', houseRoutes);
router.use('/retreats', retreatRoutes);
router.use('/retreat-roles', retreatRoleRoutes);
router.use('/role-requests', roleRequestRoutes);
router.use('/permission-overrides', permissionOverrideRoutes);
router.use('/permission-inheritance', permissionInheritanceRoutes);
router.use('/audit', auditRoutes);
router.use('/charges', chargeRoutes);
router.use(retreatBedRoutes);
router.use('/tables', tableMesaRoutes);
router.use('/message-templates', messageTemplateRoutes);
router.use('/inventory', inventoryRoutes);

export default router;
