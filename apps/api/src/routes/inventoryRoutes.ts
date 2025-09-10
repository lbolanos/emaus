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

const router = Router();

// Category routes
router.get('/categories', getAllInventoryCategories);
router.post('/categories', createInventoryCategoryController);

// Team routes
router.get('/teams', getAllInventoryTeams);
router.post('/teams', createInventoryTeamController);

// Inventory item routes
router.get('/items', getAllInventoryItems);
router.post('/items', createInventoryItemController);
router.put('/items/:id', updateInventoryItemController);

// Retreat inventory routes
router.get('/retreat/:retreatId', getRetreatInventoryController);
router.get('/retreat/:retreatId/by-category', getRetreatInventoryByCategoryController);
router.put('/retreat/:retreatId/:itemId', updateRetreatInventoryController);
router.post('/retreat/:retreatId/calculate', calculateRequiredQuantitiesController);
router.get('/retreat/:retreatId/alerts', getInventoryAlertsController);

// Import/Export routes
router.get('/retreat/:retreatId/export', exportInventoryController);
router.post('/retreat/:retreatId/import', importInventoryController);

export default router;
