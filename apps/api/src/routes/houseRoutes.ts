import { Router } from 'express';
import { getAllHouses, getHouseById, createHouse, updateHouse, deleteHouse } from '../controllers/houseController';
import { isAuthenticated } from '../middleware/isAuthenticated';

const router = Router();

router.use(isAuthenticated);

router.get('/', getAllHouses);
router.get('/:id', getHouseById);
router.post('/', createHouse);
router.put('/:id', updateHouse);
router.delete('/:id', deleteHouse);

export default router;
