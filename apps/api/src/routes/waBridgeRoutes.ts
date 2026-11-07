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
// Thumbnails de un hilo en lote (v1.2): lectura de imágenes ya recibidas.
router.post(
	'/retreat/:retreatId/media',
	requirePermission('whatsappInbox:read'),
	requireRetreatAccess('retreatId'),
	controller.threadMedia,
);
router.post(
	'/retreat/:retreatId/seen-all',
	requirePermission('whatsappInbox:read'),
	requireRetreatAccess('retreatId'),
	controller.seenAll,
);
// Comprobante de pago desde WhatsApp (FR14, v1.1): doble permiso — leer la
// bandeja y crear el pago (el destino de la imagen).
router.post(
	'/messages/:messageId/receipt',
	requirePermission('whatsappInbox:read'),
	requirePermission('payment:create'),
	controller.receiptDataUrl,
);
// Badge del sidebar y búsqueda (v1.1): lectura pura.
router.get(
	'/retreat/:retreatId/unread',
	requirePermission('whatsappInbox:read'),
	requireRetreatAccess('retreatId'),
	controller.unreadCount,
);
router.get(
	'/retreat/:retreatId/search',
	requirePermission('whatsappInbox:read'),
	requireRetreatAccess('retreatId'),
	controller.search,
);

// Gestión del vínculo propio: permiso manage; el dueño (o superadmin) lo
// valida dentro del controller para /link/:linkId.
router.post(
	'/retreat/:retreatId/link',
	requirePermission('whatsappInbox:manage'),
	requireRetreatAccess('retreatId'),
	controller.startLink,
);
// Activación por retiro y terminación de servidores: SOLO superadmin
// (validación de rol dentro del controller; D13/D14 de specs/whatsapp-inbox v1.1).
router.patch(
	'/retreat/:retreatId/enabled',
	requirePermission('whatsappInbox:manage'),
	requireRetreatAccess('retreatId'),
	controller.setEnabled,
);
router.post(
	'/retreat/:retreatId/terminate-all',
	requirePermission('whatsappInbox:manage'),
	requireRetreatAccess('retreatId'),
	controller.terminateAll,
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
