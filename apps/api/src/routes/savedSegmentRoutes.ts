import { Router } from 'express';
import { SavedSegmentController } from '../controllers/savedSegmentController';
import { isAuthenticated } from '../middleware/authentication';
import { requireRetreatAccess, requireCommunityAccess } from '../middleware/authorization';

const router = Router();
const controller = new SavedSegmentController();

router.use(isAuthenticated);

// Listar segmentos por scope (gated por acceso al recurso).
router.get('/retreat/:retreatId', requireRetreatAccess('retreatId'), controller.getRetreatSegments);
router.get(
	'/community/:communityId',
	requireCommunityAccess('communityId'),
	controller.getCommunitySegments,
);

// Mutaciones: la autorización por recurso se valida dentro del controller
// (el scope/retiro/comunidad vienen en el body o en el registro existente).
router.post('/', controller.createSegment);
router.put('/:id', controller.updateSegment);
router.delete('/:id', controller.deleteSegment);

export default router;
