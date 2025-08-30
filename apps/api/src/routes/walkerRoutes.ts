import { Router } from 'express';
import {
  createWalker,
  deleteWalker,
  getAllWalkers,
  getWalkerById,
  updateWalker,
} from '../controllers/walkerController';
import { validateRequest } from '../middleware/validateRequest';
import { createWalkerSchema, updateWalkerSchema } from '@repo/types';

const router = Router();

router.get('/', getAllWalkers);
router.get('/:id', getWalkerById);
router.post('/', validateRequest(createWalkerSchema), createWalker);
router.put('/:id', validateRequest(updateWalkerSchema), updateWalker);
router.delete('/:id', deleteWalker);

export default router;