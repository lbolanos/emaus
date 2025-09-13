import { Router } from 'express';
import {
	getHouses,
	getHouseById,
	createHouse,
	updateHouse,
	deleteHouse,
} from '../controllers/houseController';
import { isAuthenticated } from '../middleware/isAuthenticated';
import { validateRequest } from '../middleware/validateRequest';
import { createHouseSchema, updateHouseSchema } from '@repo/types';
import { requirePermission } from '../middleware/authorization';

const router = Router();

router.use(isAuthenticated);

router.get('/', requirePermission('house:list'), getHouses);
router.get('/:id', requirePermission('house:read'), getHouseById);
router.post(
	'/',
	validateRequest(createHouseSchema),
	requirePermission('house:create'),
	createHouse,
);
router.put(
	'/:id',
	validateRequest(updateHouseSchema),
	requirePermission('house:update'),
	updateHouse,
);
router.delete('/:id', requirePermission('house:delete'), deleteHouse);

export default router;
