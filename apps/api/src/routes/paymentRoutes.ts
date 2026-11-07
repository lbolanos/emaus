import { Router } from 'express';
import {
	createPaymentSchema,
	updatePaymentSchema,
	SubmitPaymentReceiptClaimSchema,
	ListReceiptClaimsQuerySchema,
	ApplyPaymentReceiptClaimSchema,
	DismissPaymentReceiptClaimSchema,
	PaymentFromLetterSchema,
} from '@repo/types';
import { PaymentController } from '../controllers/paymentController';
import {
	getPublicReceiptLinkContext,
	submitPublicReceiptClaim,
	getReceiptLinksHandler,
	listReceiptClaimsHandler,
	applyReceiptClaimHandler,
	dismissReceiptClaimHandler,
	createPaymentFromLetterHandler,
} from '../controllers/paymentReceiptClaimController';
import { isAuthenticated } from '../middleware/authentication';
import { validateRequest } from '../middleware/validateRequest';
import { requirePermission, requireRetreatAccess } from '../middleware/authorization';
import { idempotency } from '../middleware/idempotency';
import { receiptUploadLimiter } from '../middleware/rateLimiting';

const router = Router();
const paymentController = new PaymentController();

// -- PÚBLICO: link de capacidad (comprobantes por link, specs/comprobantes-link)
// ANTES del blanket isAuthenticated de abajo; exento de CSRF en routes/index.ts.
router.get(
	'/public/receipt-link/:token',
	getPublicReceiptLinkContext,
);
router.post(
	'/public/receipt-link/:token',
	receiptUploadLimiter,
	validateRequest(SubmitPaymentReceiptClaimSchema),
	submitPublicReceiptClaim,
);

// All payment routes require authentication
router.use(isAuthenticated);

// -- Bandeja de comprobantes enviados por las familias (specs/comprobantes-link) --
// Las rutas literales van ANTES de '/:id' para no ser tragadas por él.
// requireRetreatAccess con source='query': el retreatId de estas rutas viene
// como query string, no como path param.
router.get(
	'/receipt-links',
	requirePermission('payment:create'),
	requireRetreatAccess('retreatId', 'query'),
	getReceiptLinksHandler,
);
router.get(
	'/receipt-claims',
	requirePermission('payment:read'),
	requireRetreatAccess('retreatId', 'query'),
	validateRequest(ListReceiptClaimsQuerySchema),
	listReceiptClaimsHandler,
);
router.post(
	'/receipt-claims/:id/apply',
	requirePermission('payment:create'),
	validateRequest(ApplyPaymentReceiptClaimSchema),
	applyReceiptClaimHandler,
);
router.post(
	'/receipt-claims/:id/dismiss',
	requirePermission('payment:update'),
	validateRequest(DismissPaymentReceiptClaimSchema),
	dismissReceiptClaimHandler,
);
// Registra el adjunto foto de una CARTA del buzón como comprobante y lo setea
// en el pago nuevo (payment.receipt_from_letter).
router.post(
	'/from-letter/:letterId',
	requirePermission('payment:create'),
	validateRequest(PaymentFromLetterSchema),
	createPaymentFromLetterHandler,
);

// Create payment
router.post(
	'/',
	requirePermission('payment:create'),
	validateRequest(createPaymentSchema),
	// Door payments can be queued without signal (specs/offline-mode): a resend
	// with the same key must never record a second payment.
	idempotency,
	paymentController.createPayment.bind(paymentController),
);

// Get all payments (with optional filters)
router.get(
	'/',
	requirePermission('payment:list'),
	paymentController.getAllPayments.bind(paymentController),
);

// Get payment by ID
router.get(
	'/:id',
	requirePermission('payment:read'),
	paymentController.getPaymentById.bind(paymentController),
);

// Update payment
router.put(
	'/:id',
	requirePermission('payment:update'),
	validateRequest(updatePaymentSchema),
	paymentController.updatePayment.bind(paymentController),
);

// Delete payment
router.delete(
	'/:id',
	requirePermission('payment:delete'),
	paymentController.deletePayment.bind(paymentController),
);

// Get payments by participant
router.get(
	'/participant/:participantId',
	requirePermission('payment:read'),
	paymentController.getPaymentsByParticipant.bind(paymentController),
);

// Get payments by retreat
router.get(
	'/retreat/:retreatId',
	requirePermission('payment:read'),
	requireRetreatAccess('retreatId'),
	paymentController.getPaymentsByRetreat.bind(paymentController),
);

// Get payment summary by retreat
router.get(
	'/retreat/:retreatId/summary',
	requirePermission('payment:read'),
	requireRetreatAccess('retreatId'),
	paymentController.getPaymentSummaryByRetreat.bind(paymentController),
);

export default router;
