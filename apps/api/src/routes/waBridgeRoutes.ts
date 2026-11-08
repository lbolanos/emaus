import { Router } from 'express';
import { WaBridgeController } from '../controllers/waBridgeController';
import { isAuthenticated } from '../middleware/authentication';
import { requireRetreatAccess, requirePermission } from '../middleware/authorization';

const router = Router();
const controller = new WaBridgeController();

router.use(isAuthenticated);

// Reads (consolidated inbox and board): read permission + retreat access.
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
// Thread thumbnails in one batch (v1.2): reading images already received.
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
// Payment receipt from WhatsApp (FR14, v1.1): double permission — read the
// inbox and create the payment (the image's destination).
router.post(
	'/messages/:messageId/receipt',
	requirePermission('whatsappInbox:read'),
	requirePermission('payment:create'),
	controller.receiptDataUrl,
);
// v1.3: voice notes and documents on demand (read), retreat checked inside.
router.post(
	'/messages/:messageId/raw-media',
	requirePermission('whatsappInbox:read'),
	controller.rawMedia,
);
// v1.3: link the payment created from a message (duplicate-payment guard).
router.post(
	'/messages/:messageId/payment',
	requirePermission('whatsappInbox:read'),
	requirePermission('payment:create'),
	controller.linkPayment,
);
// v1.3: "add as letter" — needs letter review rights (letter:update).
router.post(
	'/messages/:messageId/letter',
	requirePermission('whatsappInbox:read'),
	requirePermission('letter:update'),
	controller.addAsLetter,
);
// Sidebar badge and search (v1.1): pure reads.
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

// Managing one's own link: manage permission; the owner (or superadmin) is
// checked inside the controller for /link/:linkId.
router.post(
	'/retreat/:retreatId/link',
	requirePermission('whatsappInbox:manage'),
	requireRetreatAccess('retreatId'),
	controller.startLink,
);
// Per-retreat activation and session termination: superadmin ONLY (role check
// inside the controller; D13/D14 of specs/whatsapp-inbox v1.1).
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
