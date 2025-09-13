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

router.get('/', requirePermission('retreat:list'), getAllRetreats);
router.post(
	'/',
	validateRequest(createRetreatSchema),
	requirePermission('retreat:create'),
	createRetreat,
);
router.get('/:id', requirePermission('retreat:read'), getRetreatById);
router.put(
	'/:id',
	validateRequest(updateRetreatSchema),
	requirePermission('retreat:update'),
	updateRetreat,
);

export default router;
