import { Router } from 'express';
import { createParticipantDebtSchema, updateParticipantDebtSchema } from '@repo/types';
import { ParticipantDebtController } from '../controllers/participantDebtController';
import { isAuthenticated } from '../middleware/authentication';
import { validateRequest } from '../middleware/validateRequest';
import { requirePermission, requireRetreatAccess } from '../middleware/authorization';

const router = Router();
const debtController = new ParticipantDebtController();

// Reutiliza los permisos de tesorería (payment:*).
router.use(isAuthenticated);

// Create debt
router.post(
	'/',
	requirePermission('payment:create'),
	validateRequest(createParticipantDebtSchema),
	debtController.createDebt.bind(debtController),
);

// Update debt
router.put(
	'/:id',
	requirePermission('payment:update'),
	validateRequest(updateParticipantDebtSchema),
	debtController.updateDebt.bind(debtController),
);

// Delete debt
router.delete(
	'/:id',
	requirePermission('payment:delete'),
	debtController.deleteDebt.bind(debtController),
);

// Get debts by participant
router.get(
	'/participant/:participantId',
	requirePermission('payment:read'),
	debtController.getDebtsByParticipant.bind(debtController),
);

// Get debts by retreat
router.get(
	'/retreat/:retreatId',
	requirePermission('payment:read'),
	requireRetreatAccess('retreatId'),
	debtController.getDebtsByRetreat.bind(debtController),
);

export default router;
