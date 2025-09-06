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

// Routes for assigning/unassigning participants
router.post('/:id/leader/:role', tableMesaController.assignLeader);
router.delete('/:id/leader/:role', tableMesaController.unassignLeader);

router.post('/:id/walkers', tableMesaController.assignWalker);
router.delete('/:id/walkers/:walkerId', tableMesaController.unassignWalker);

export default router;