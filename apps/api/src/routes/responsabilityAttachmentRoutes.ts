import { Router, json as expressJson } from 'express';
import {
	listAttachments,
	attachmentCounts,
	createAttachment,
	updateAttachment,
	deleteAttachment,
	createMarkdownAttachment,
	updateMarkdownAttachment,
	listMarkdownHistory,
	getMarkdownVersion,
	restoreMarkdownVersion,
} from '../controllers/responsabilityAttachmentController';
import { isAuthenticated } from '../middleware/isAuthenticated';
import { requirePermission } from '../middleware/authorization';

const router = Router();

router.use(isAuthenticated);

// Body limit propio para upload de archivos (15MB) sin afectar el global de 2MB.
const uploadJsonLimit = expressJson({ limit: '15mb' });

router.get(
	'/counts',
	requirePermission('scheduleTemplate:read'),
	attachmentCounts,
);
router.get(
	'/by-name/:name/attachments',
	requirePermission('scheduleTemplate:read'),
	listAttachments,
);
router.post(
	'/by-name/:name/attachments',
	uploadJsonLimit,
	requirePermission('scheduleTemplate:manage'),
	createAttachment,
);
router.post(
	'/by-name/:name/attachments/markdown',
	requirePermission('scheduleTemplate:manage'),
	createMarkdownAttachment,
);
router.patch(
	'/attachments/:attachmentId/markdown',
	requirePermission('scheduleTemplate:manage'),
	updateMarkdownAttachment,
);
router.get(
	'/attachments/:attachmentId/history',
	requirePermission('scheduleTemplate:read'),
	listMarkdownHistory,
);
router.get(
	'/attachments/:attachmentId/history/:historyId',
	requirePermission('scheduleTemplate:read'),
	getMarkdownVersion,
);
router.post(
	'/attachments/:attachmentId/restore/:historyId',
	requirePermission('scheduleTemplate:manage'),
	restoreMarkdownVersion,
);
router.patch(
	'/attachments/:attachmentId',
	requirePermission('scheduleTemplate:manage'),
	updateAttachment,
);
router.delete(
	'/attachments/:attachmentId',
	requirePermission('scheduleTemplate:manage'),
	deleteAttachment,
);

export default router;
