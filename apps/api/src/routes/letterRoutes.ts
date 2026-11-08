import { Router } from 'express';
import { isAuthenticated } from '../middleware/isAuthenticated';
import { requirePermission, requireRetreatAccess } from '../middleware/authorization';
import { validateRequest } from '../middleware/validateRequest';
import {
	ActivateLetterMailboxesSchema,
	ListLettersQuerySchema,
	MarkLetterMailboxSharedSchema,
	MarkLettersPrintedSchema,
	PrintBatchQuerySchema,
	ReviewLetterSchema,
	UpdateLetterMailboxSchema,
} from '@repo/types';
import {
	activateMailboxesHandler,
	getFoldersHandler,
	getLetterHandler,
	getMailboxesHandler,
	getPrintBatchHandler,
	letterCountsHandler,
	listLettersHandler,
	markMailboxSharedHandler,
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
router.post(
	'/retreats/:retreatId/letters/mailbox/:retreatParticipantId/shared',
	isAuthenticated,
	requirePermission('letter:manage'),
	requireRetreatAccess('retreatId'),
	validateRequest(MarkLetterMailboxSharedSchema),
	markMailboxSharedHandler,
);

// -- Bandeja y revisión --
// Carpetas: estado del folder por participante (cuántas cartas, cuántas impresas).
router.get(
	'/retreats/:retreatId/letters/folders',
	isAuthenticated,
	requirePermission('letter:read'),
	requireRetreatAccess('retreatId'),
	getFoldersHandler,
);
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
// Conteo por estado para el badge del sidebar (ligero: solo counts).
router.get(
	'/retreats/:retreatId/letters/counts',
	isAuthenticated,
	requirePermission('letter:read'),
	requireRetreatAccess('retreatId'),
	letterCountsHandler,
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
