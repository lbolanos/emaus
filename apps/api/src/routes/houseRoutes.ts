import { Router } from 'express';
import { getAllHouses } from '../controllers/houseController';
import { isAuthenticated } from '../middleware/isAuthenticated';

const router = Router();

router.use(isAuthenticated);

router.get('/', getAllHouses);

export default router;
