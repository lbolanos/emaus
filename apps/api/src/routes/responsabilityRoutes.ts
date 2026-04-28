import { Router } from 'express';
import {
	createResponsability,
	deleteResponsability,
	getAllResponsibilities,
	getResponsabilityById,
	updateResponsability,
	assignResponsability,
	removeResponsability,
	exportResponsibilitiesDocx,
	searchSpeakers,
	createAndAssignSpeaker,
	getPalanqueroOptions,
	getDocumentation,
	listDocumentationKeys,
} from '../controllers/responsabilityController';
import { isAuthenticated } from '../middleware/isAuthenticated';
import { requirePermission, requireRetreatAccess } from '../middleware/authorization';

const router = Router();

router.use(isAuthenticated);

router.post('/export/:retreatId', requirePermission('responsability:list'), exportResponsibilitiesDocx);
router.get('/search-speakers', requirePermission('responsability:list'), searchSpeakers);
router.get('/palanquero-options', requirePermission('participant:read'), getPalanqueroOptions);
router.get('/documentation/keys', requirePermission('responsability:list'), listDocumentationKeys);
router.get('/documentation', requirePermission('responsability:list'), getDocumentation);
router.get('/', requirePermission('responsability:list'), getAllResponsibilities);
router.get('/:id', requirePermission('responsability:read'), getResponsabilityById);
router.post('/', requirePermission('responsability:create'), createResponsability);
router.put('/:id', requirePermission('responsability:update'), updateResponsability);
router.delete('/:id', requirePermission('responsability:delete'), deleteResponsability);

// Speaker creation + assignment
router.post('/:id/create-speaker', requirePermission('responsability:update'), createAndAssignSpeaker);

// Responsability assignment routes
router.post('/:id/assign', requirePermission('responsability:update'), assignResponsability);
router.delete(
	'/:id/assign/:participantId',
	requirePermission('responsability:update'),
	removeResponsability,
);

export default router;
