import { Router } from 'express';
import { getHouses, getHouseById, createHouse, updateHouse, deleteHouse } from '../controllers/houseController';
import { isAuthenticated } from '../middleware/isAuthenticated';
import { validateRequest } from '../middleware/validateRequest';
import { createHouseSchema, updateHouseSchema } from '@repo/types';

const router = Router();

router.use(isAuthenticated);

router.get('/', getHouses);
router.get('/:id', getHouseById);
router.post('/', validateRequest(createHouseSchema), createHouse);
router.put('/:id', validateRequest(updateHouseSchema), updateHouse);
router.delete('/:id', deleteHouse);

export default router;