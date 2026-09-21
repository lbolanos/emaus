import { Router } from 'express';
import { isAuthenticated } from '../middleware/isAuthenticated';
import { requirePermission, requireRetreatAccess } from '../middleware/authorization';
import { list, create, update, remove } from '../controllers/shirtTypeController';
import { getShirtReport } from '../controllers/shirtReportController';

const router = Router();

router.use(isAuthenticated);

router.get('/retreats/:retreatId/shirt-types', requirePermission('shirtType:read'), list);
router.post('/retreats/:retreatId/shirt-types', requirePermission('shirtType:manage'), create);
router.patch('/shirt-types/:id', requirePermission('shirtType:manage'), update);
router.delete('/shirt-types/:id', requirePermission('shirtType:manage'), remove);

// The report lists cellPhone/country for every server in the retreat, so it is
// retreat-scoped PII: participant:read alone (a global permission) would let any
// regular user enumerate another retreat's phones. Same gate as the sibling
// GET /history/retreat/:retreatId/participants.
router.get(
	'/retreats/:retreatId/shirt-report',
	requirePermission('participant:read'),
	requireRetreatAccess('retreatId'),
	getShirtReport,
);

export default router;
