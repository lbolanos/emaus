import { Router } from 'express';
import participantRoutes from './participantRoutes';

import authRoutes from './authRoutes';
import houseRoutes from './houseRoutes';
import retreatBedRoutes from './retreatBedRoutes';
import retreatRoutes from './retreatRoutes';
import responsabilityRoutes from './responsabilityRoutes';
import retreatResponsabilityRoutes from './retreatResponsabilityRoutes';
import tableMesaRoutes from './tableMesaRoutes';
import messageTemplateRoutes from './messageTemplateRoutes';
import globalMessageTemplateRoutes from './globalMessageTemplateRoutes';
import inventoryRoutes from './inventoryRoutes';
import retreatRoleRoutes from './retreatRoleRoutes';
import roleRequestRoutes from './roleRequestRoutes';
import permissionOverrideRoutes from './permissionOverrideRoutes';
import auditRoutes from './auditRoutes';
import permissionInheritanceRoutes from './permissionInheritanceRoutes';
import userManagementRoutes from './userManagementRoutes';
import invitationRoutes from './invitationRoutes';
import paymentRoutes from './paymentRoutes';

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
router.use('/responsibilities', responsabilityRoutes);
router.use('/retreat-responsibilities', retreatResponsabilityRoutes);
router.use(retreatBedRoutes);
router.use('/tables', tableMesaRoutes);
router.use('/message-templates', messageTemplateRoutes);
router.use('/global-message-templates', globalMessageTemplateRoutes);
router.use('/inventory', inventoryRoutes);
router.use('/user-management', userManagementRoutes);
router.use('/invitations', invitationRoutes);
router.use('/payments', paymentRoutes);

export default router;
