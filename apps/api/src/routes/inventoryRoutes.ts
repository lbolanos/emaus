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
import { requirePermission } from '../middleware/authorization';

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
	requirePermission('inventoryItem:read'),
	getRetreatInventoryController,
);
router.get(
	'/retreat/:retreatId/by-category',
	requirePermission('inventoryItem:read'),
	getRetreatInventoryByCategoryController,
);
router.put(
	'/retreat/:retreatId/:itemId',
	requirePermission('inventoryItem:update'),
	updateRetreatInventoryController,
);
router.post(
	'/retreat/:retreatId/calculate',
	requirePermission('inventoryItem:read'),
	calculateRequiredQuantitiesController,
);
router.get(
	'/retreat/:retreatId/alerts',
	requirePermission('inventoryItem:read'),
	getInventoryAlertsController,
);

// Import/Export routes
router.get(
	'/retreat/:retreatId/export',
	requirePermission('inventoryItem:read'),
	exportInventoryController,
);
router.post(
	'/retreat/:retreatId/import',
	requirePermission('inventoryItem:create'),
	importInventoryController,
);

export default router;
