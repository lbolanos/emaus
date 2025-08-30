import { Router } from 'express';
import walkerRoutes from './walkerRoutes';

const router = Router();

router.use('/walkers', walkerRoutes);

export default router;