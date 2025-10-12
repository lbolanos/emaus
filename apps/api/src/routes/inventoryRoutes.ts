import { Router } from 'express';
import {
	getAllInventoryCategories,
	createInventoryCategoryController,
	getAllInventoryTeams,
	createInventoryTeamController,
	getAllInventoryItems,
	createInventoryItemController,
	updateInventoryItemController,
	getRetreatInventoryController,
	getRetreatInventoryByCategoryController,
	updateRetreatInventoryController,
	calculateRequiredQuantitiesController,
	getInventoryAlertsController,
	exportInventoryController,
	importInventoryController,
} from '../controllers/inventoryController';
import { isAuthenticated } from '../middleware/isAuthenticated';
import { requirePermission, requireRetreatAccess } from '../middleware/authorization';

const router = Router();

router.use(isAuthenticated);

// Category routes
router.get('/categories', requirePermission('inventoryItem:list'), getAllInventoryCategories);
router.post(
	'/categories',
	requirePermission('inventoryItem:create'),
	createInventoryCategoryController,
);

// Team routes
router.get('/teams', requirePermission('inventoryItem:list'), getAllInventoryTeams);
router.post('/teams', requirePermission('inventoryItem:create'), createInventoryTeamController);

// Inventory item routes
router.get('/items', requirePermission('inventoryItem:list'), getAllInventoryItems);
router.post('/items', requirePermission('inventoryItem:create'), createInventoryItemController);
router.put('/items/:id', requirePermission('inventoryItem:update'), updateInventoryItemController);

// Retreat inventory routes
router.get(
	'/retreat/:retreatId',
	requirePermission('retreatInventory:read'),
	requireRetreatAccess('retreatId'),
	getRetreatInventoryController,
);
router.get(
	'/retreat/:retreatId/by-category',
	requirePermission('retreatInventory:read'),
	requireRetreatAccess('retreatId'),
	getRetreatInventoryByCategoryController,
);
router.put(
	'/retreat/:retreatId/:itemId',
	requirePermission('retreatInventory:update'),
	requireRetreatAccess('retreatId'),
	updateRetreatInventoryController,
);
router.post(
	'/retreat/:retreatId/calculate',
	requirePermission('retreatInventory:read'),
	requireRetreatAccess('retreatId'),
	calculateRequiredQuantitiesController,
);
router.get(
	'/retreat/:retreatId/alerts',
	requirePermission('retreatInventory:read'),
	requireRetreatAccess('retreatId'),
	getInventoryAlertsController,
);

// Import/Export routes
router.get(
	'/retreat/:retreatId/export',
	requirePermission('retreatInventory:read'),
	requireRetreatAccess('retreatId'),
	exportInventoryController,
);
router.post(
	'/retreat/:retreatId/import',
	requirePermission('retreatInventory:create'),
	requireRetreatAccess('retreatId'),
	importInventoryController,
);

export default router;
