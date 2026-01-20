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
import participantCommunicationRoutes from './participantCommunicationRoutes';
import communityCommunicationRoutes from './communityCommunicationRoutes';
import telemetryRoutes from './telemetryRoutes';
import tagRoutes from './tagRoutes';
import communityRoutes from './communityRoutes';
import newsletterRoutes from './newsletterRoutes';
import userSocialRoutes from './userSocial.routes';
import testimonialRoutes from './testimonial.routes';
import participantHistoryRoutes from './participantHistory.routes';
import { applyCsrfProtectionExcept } from '../middleware/routeCsrf';

const router = Router();

// Rutas de autenticación (sin CSRF para permitir login/logout)
router.use('/auth', authRoutes);

// Aplicar CSRF a todas las demás rutas
applyCsrfProtectionExcept(router, [
	'/auth',
	'/csrf-token',
	'/communities/public',
	'/communities/invitations',
	'/communities/*/join-public',
	'/newsletter/subscribe',
	'/landing/testimonials',
]);

// Resto de las rutas (con protección CSRF)
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
router.use('/participant-communications', participantCommunicationRoutes);
router.use('/community-communications', communityCommunicationRoutes);
router.use('/telemetry', telemetryRoutes);
router.use('/tags', tagRoutes);
router.use('/communities', communityRoutes);
router.use('/newsletter', newsletterRoutes);
router.use('/social', userSocialRoutes);
router.use(testimonialRoutes);
router.use(participantHistoryRoutes);

export default router;
