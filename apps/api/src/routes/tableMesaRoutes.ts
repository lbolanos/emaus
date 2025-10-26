import { Router } from 'express';
import * as tableMesaController from '../controllers/tableMesaController';
import { isAuthenticated } from '../middleware/isAuthenticated';
import { requirePermission, requireRetreatAccess } from '../middleware/authorization';

const router = Router();

// All these routes should be protected
router.use(isAuthenticated);

router.get(
	'/retreat/:retreatId',
	requirePermission('table:list'),
	requireRetreatAccess('retreatId'),
	tableMesaController.getTablesForRetreat,
);
router.get('/:id', requirePermission('table:read'), tableMesaController.getTable);
router.post('/', requirePermission('table:create'), tableMesaController.createTable);
router.put('/:id', requirePermission('table:update'), tableMesaController.updateTable);
router.delete('/:id', requirePermission('table:delete'), tableMesaController.deleteTable);
router.post(
	'/rebalance/:retreatId',
	requirePermission('table:update'),
	requireRetreatAccess('retreatId'),
	tableMesaController.rebalanceTables,
);

router.post(
	'/export/:retreatId',
	requirePermission('table:read'),
	requireRetreatAccess('retreatId'),
	tableMesaController.exportTablesToDocx,
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
