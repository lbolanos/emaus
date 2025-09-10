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

const router = Router();

router.use(isAuthenticated);

router.get('/', getAllRetreats);
router.post('/', validateRequest(createRetreatSchema), createRetreat);
router.get('/:id', getRetreatById);
router.put('/:id', validateRequest(updateRetreatSchema), updateRetreat);

export default router;
