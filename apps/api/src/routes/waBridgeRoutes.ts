import { Router } from 'express';
import { WaBridgeController } from '../controllers/waBridgeController';
import { isAuthenticated } from '../middleware/authentication';
import { requireRetreatAccess, requirePermission } from '../middleware/authorization';

const router = Router();
const controller = new WaBridgeController();

router.use(isAuthenticated);

// Lectura (bandeja consolidada y tablero): permiso read + acceso al retiro.
router.get(
	'/retreat/:retreatId/links',
	requirePermission('whatsappInbox:read'),
	requireRetreatAccess('retreatId'),
	controller.listLinks,
);
router.get(
	'/retreat/:retreatId/conversations',
	requirePermission('whatsappInbox:read'),
	requireRetreatAccess('retreatId'),
	controller.conversations,
);
router.get(
	'/retreat/:retreatId/messages',
	requirePermission('whatsappInbox:read'),
	requireRetreatAccess('retreatId'),
	controller.messages,
);
router.post(
	'/retreat/:retreatId/seen',
	requirePermission('whatsappInbox:read'),
	requireRetreatAccess('retreatId'),
	controller.markSeen,
);

// Gestión del vínculo propio: permiso manage; el dueño (o superadmin) lo
// valida dentro del controller para /link/:linkId.
router.post(
	'/retreat/:retreatId/link',
	requirePermission('whatsappInbox:manage'),
	requireRetreatAccess('retreatId'),
	controller.startLink,
);
router.get(
	'/link/:linkId/status',
	requirePermission('whatsappInbox:manage'),
	controller.linkStatus,
);
router.delete(
	'/link/:linkId',
	requirePermission('whatsappInbox:manage'),
	controller.unlink,
);

export default router;
