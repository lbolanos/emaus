import { Router } from 'express';
import * as tableMesaController from '../controllers/tableMesaController';
import { isAuthenticated } from '../middleware/isAuthenticated';

const router = Router();

// All these routes should be protected
router.use(isAuthenticated);

router.get('/retreat/:retreatId', tableMesaController.getTablesForRetreat);
router.get('/:id', tableMesaController.getTable);
router.post('/', tableMesaController.createTable);
router.put('/:id', tableMesaController.updateTable);
router.delete('/:id', tableMesaController.deleteTable);
router.post('/rebalance/:retreatId', tableMesaController.rebalanceTables);

export default router;