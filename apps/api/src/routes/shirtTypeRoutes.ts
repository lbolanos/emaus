import { Router } from 'express';
import { isAuthenticated } from '../middleware/isAuthenticated';
import { requirePermission } from '../middleware/authorization';
import { list, create, update, remove } from '../controllers/shirtTypeController';

const router = Router();

router.use(isAuthenticated);

router.get('/retreats/:retreatId/shirt-types', requirePermission('shirtType:read'), list);
router.post('/retreats/:retreatId/shirt-types', requirePermission('shirtType:manage'), create);
router.patch('/shirt-types/:id', requirePermission('shirtType:manage'), update);
router.delete('/shirt-types/:id', requirePermission('shirtType:manage'), remove);

export default router;
