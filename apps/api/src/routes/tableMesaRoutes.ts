import { Router } from 'express';
import * as tableMesaController from '../controllers/tableMesaController';
import { isAuthenticated } from '../middleware/isAuthenticated';
import { requirePermission } from '../middleware/authorization';

const router = Router();

// All these routes should be protected
router.use(isAuthenticated);

router.get(
	'/retreat/:retreatId',
	requirePermission('table:list'),
	tableMesaController.getTablesForRetreat,
);
router.get('/:id', requirePermission('table:read'), tableMesaController.getTable);
router.post('/', requirePermission('table:create'), tableMesaController.createTable);
router.put('/:id', requirePermission('table:update'), tableMesaController.updateTable);
router.delete('/:id', requirePermission('table:delete'), tableMesaController.deleteTable);
router.post(
	'/rebalance/:retreatId',
	requirePermission('table:update'),
	tableMesaController.rebalanceTables,
);

// Routes for assigning/unassigning participants
router.post(
	'/:id/leader/:role',
	requirePermission('table:update'),
	tableMesaController.assignLeader,
);
router.delete(
	'/:id/leader/:role',
	requirePermission('table:update'),
	tableMesaController.unassignLeader,
);

router.post('/:id/walkers', requirePermission('table:update'), tableMesaController.assignWalker);
router.delete(
	'/:id/walkers/:walkerId',
	requirePermission('table:update'),
	tableMesaController.unassignWalker,
);

export default router;
