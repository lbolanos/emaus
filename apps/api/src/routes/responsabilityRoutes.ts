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
import { requirePermission, requireRetreatAccess } from '../middleware/authorization';

const router = Router();

router.use(isAuthenticated);

router.get('/', requirePermission('responsability:list'), getAllResponsibilities);
router.get('/:id', requirePermission('responsability:read'), getResponsabilityById);
router.post('/', requirePermission('responsability:create'), createResponsability);
router.put('/:id', requirePermission('responsability:update'), updateResponsability);
router.delete('/:id', requirePermission('responsability:delete'), deleteResponsability);

// Responsability assignment routes
router.post('/:id/assign', requirePermission('responsability:update'), assignResponsability);
router.delete(
	'/:id/assign/:participantId',
	requirePermission('responsability:update'),
	removeResponsability,
);

export default router;
