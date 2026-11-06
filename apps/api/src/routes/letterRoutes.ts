import { Router } from 'express';
import { isAuthenticated } from '../middleware/isAuthenticated';
import { requirePermission, requireRetreatAccess } from '../middleware/authorization';
import { validateRequest } from '../middleware/validateRequest';
import {
	ActivateLetterMailboxesSchema,
	ListLettersQuerySchema,
	MarkLettersPrintedSchema,
	PrintBatchQuerySchema,
	ReviewLetterSchema,
	UpdateLetterMailboxSchema,
} from '@repo/types';
import {
	activateMailboxesHandler,
	getLetterHandler,
	getMailboxesHandler,
	getPrintBatchHandler,
	listLettersHandler,
	markPrintedHandler,
	reviewLetterHandler,
	toggleMailboxHandler,
} from '../controllers/letterController';

/**
 * Cartas de familias por email (specs/letters-email). Se monta CON prefijo
 * `/letters` en routes/index.ts — los paths internos NO llevan ese segmento.
 * Todas las rutas requieren sesión + permiso del resource `letter`; el detalle
 * y la revisión validan además acceso al retiro de la carta (recurso más
 * específico). El webhook público vive en letterWebhookRoutes (prefix-less,
 * montado antes).
 */
const router = Router();

// -- Gestión de buzones (letter:manage) --
router.post(
	'/retreats/:retreatId/letters/mailbox/activate',
	isAuthenticated,
	requirePermission('letter:manage'),
	requireRetreatAccess('retreatId'),
	validateRequest(ActivateLetterMailboxesSchema),
	activateMailboxesHandler,
);
router.get(
	'/retreats/:retreatId/letters/mailbox',
	isAuthenticated,
	requirePermission('letter:manage'),
	requireRetreatAccess('retreatId'),
	getMailboxesHandler,
);
router.patch(
	'/retreats/:retreatId/letters/mailbox/:retreatParticipantId',
	isAuthenticated,
	requirePermission('letter:manage'),
	requireRetreatAccess('retreatId'),
	validateRequest(UpdateLetterMailboxSchema),
	toggleMailboxHandler,
);

// -- Bandeja y revisión --
router.get(
	'/retreats/:retreatId/letters',
	isAuthenticated,
	requirePermission('letter:read'),
	requireRetreatAccess('retreatId'),
	validateRequest(ListLettersQuerySchema),
	listLettersHandler,
);
router.post(
	'/retreats/:retreatId/letters/print-mark',
	isAuthenticated,
	requirePermission('letter:print'),
	requireRetreatAccess('retreatId'),
	validateRequest(MarkLettersPrintedSchema),
	markPrintedHandler,
);
router.get(
	'/retreats/:retreatId/letters/print-batch',
	isAuthenticated,
	requirePermission('letter:read'),
	requireRetreatAccess('retreatId'),
	validateRequest(PrintBatchQuerySchema),
	getPrintBatchHandler,
);
router.get('/:id', isAuthenticated, requirePermission('letter:read'), getLetterHandler);
router.patch(
	'/:id/review',
	isAuthenticated,
	requirePermission('letter:update'),
	validateRequest(ReviewLetterSchema),
	reviewLetterHandler,
);

export default router;
