import { Router } from 'express';
import { isAuthenticated } from '../middleware/isAuthenticated';
import { requirePermission, requireRetreatAccess } from '../middleware/authorization';
import { validateRequest } from '../middleware/validateRequest';
import { setShirtOrderEstimateSchema } from '@repo/types';
import { list, create, update, remove } from '../controllers/shirtTypeController';
import {
	getShirtReport,
	putShirtOrderEstimate,
	deleteShirtOrderEstimate,
} from '../controllers/shirtReportController';

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

// Walker estimate for the purchase summary: it changes what the retreat buys,
// so it takes retreat:update (not participant:*) plus access to the retreat.
// assignParsedBody: the controller only ever sees the schema's two fields.
router.put(
	'/retreats/:retreatId/shirt-order-estimate',
	requirePermission('retreat:update'),
	requireRetreatAccess('retreatId'),
	validateRequest(setShirtOrderEstimateSchema, { assignParsedBody: true }),
	putShirtOrderEstimate,
);
router.delete(
	'/retreats/:retreatId/shirt-order-estimate',
	requirePermission('retreat:update'),
	requireRetreatAccess('retreatId'),
	deleteShirtOrderEstimate,
);

export default router;
