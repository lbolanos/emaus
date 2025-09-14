import { Router } from 'express';
import {
	createResponsability,
	deleteResponsability,
	getAllResponsibilities,
	getResponsabilityById,
	updateResponsability,
	assignResponsability,
	removeResponsability,
} from '../controllers/responsabilityController';
import { isAuthenticated } from '../middleware/isAuthenticated';
import { requirePermission } from '../middleware/authorization';

const router = Router();

router.use(isAuthenticated);

router.get('/', requirePermission('payment:list'), getAllResponsibilities);
router.get('/:id', requirePermission('payment:read'), getResponsabilityById);
router.post('/', requirePermission('payment:create'), createResponsability);
router.put('/:id', requirePermission('payment:update'), updateResponsability);
router.delete('/:id', requirePermission('payment:delete'), deleteResponsability);

// Responsability assignment routes
router.post('/:id/assign', requirePermission('payment:update'), assignResponsability);
router.delete(
	'/:id/assign/:participantId',
	requirePermission('payment:update'),
	removeResponsability,
);

export default router;
