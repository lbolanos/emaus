import { Router } from 'express';
import {
	getAllRetreats,
	createRetreat,
	getRetreatById,
	updateRetreat,
} from '../controllers/retreatController';
import { isAuthenticated } from '../middleware/isAuthenticated';
import { validateRequest } from '../middleware/validateRequest';
import { createRetreatSchema, updateRetreatSchema } from '@repo/types';
import { requirePermission } from '../middleware/authorization';

const router = Router();

router.use(isAuthenticated);

router.get('/', requirePermission('retreat:list'), (req: any, res: any, next: any) =>
	getAllRetreats(req, res, next),
);
router.post(
	'/',
	validateRequest(createRetreatSchema),
	requirePermission('retreat:create'),
	(req: any, res: any, next: any) => createRetreat(req, res, next),
);
router.get('/:id', requirePermission('retreat:read'), (req: any, res: any, next: any) =>
	getRetreatById(req, res, next),
);
router.put(
	'/:id',
	validateRequest(updateRetreatSchema),
	requirePermission('retreat:update'),
	(req: any, res: any, next: any) => updateRetreat(req, res, next),
);

export default router;
