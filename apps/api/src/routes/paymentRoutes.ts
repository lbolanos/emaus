import { Router } from 'express';
import { PaymentController } from '../controllers/paymentController';
import { isAuthenticated } from '../middleware/authentication';
import { requirePermission, requireRetreatAccess } from '../middleware/authorization';

const router = Router();
const paymentController = new PaymentController();

// All payment routes require authentication
router.use(isAuthenticated);

// Create payment
router.post(
	'/',
	requirePermission('payment:create'),
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
