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
	getWalkerCountController,
	getInventoryAlertsController,
	exportInventoryController,
	importInventoryController,
	copyInventoryFromRetreatController,
	bulkUpdateRetreatInventoryController,
	getRetreatInventoryHistoryController,
	removeItemFromRetreatController,
	bulkRemoveItemsFromRetreatController,
	addItemToRetreatController,
	addCustomItemToRetreatController,
	getAvailableItemsForRetreatController,
	syncShirtItemsForRetreatController,
	syncCatalogController,
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
// walker-count va ANTES de calculate para que el literal no sea capturado por /:itemId
router.get(
	'/retreat/:retreatId/walker-count',
	requirePermission('retreatInventory:read'),
	requireRetreatAccess('retreatId'),
	getWalkerCountController,
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

// Copia inventario desde otro retiro (currentQuantity, notas, boxLabel).
router.post(
	'/retreat/:retreatId/copy-from/:sourceRetreatId',
	requirePermission('retreatInventory:update'),
	requireRetreatAccess('retreatId'),
	copyInventoryFromRetreatController,
);

// Bulk update: aplica boxLabel / status / notas a varios items a la vez.
router.patch(
	'/retreat/:retreatId/bulk',
	requirePermission('retreatInventory:update'),
	requireRetreatAccess('retreatId'),
	bulkUpdateRetreatInventoryController,
);

// Audit log de cambios.
router.get(
	'/retreat/:retreatId/history',
	requirePermission('retreatInventory:read'),
	requireRetreatAccess('retreatId'),
	getRetreatInventoryHistoryController,
);

// Items disponibles del catálogo no agregados al retiro aún.
router.get(
	'/retreat/:retreatId/available',
	requirePermission('retreatInventory:read'),
	requireRetreatAccess('retreatId'),
	getAvailableItemsForRetreatController,
);

// IMPORTANTE: las rutas con segmentos LITERALES (custom-item,
// sync-shirts, bulk-delete) deben ir ANTES de la ruta dinámica
// `/:itemId` o Express las captura como itemId="bulk-delete" y termina
// llamando al controller equivocado.

router.post(
	'/retreat/:retreatId/custom-item',
	requirePermission('retreatInventory:create'),
	requireRetreatAccess('retreatId'),
	addCustomItemToRetreatController,
);

router.post(
	'/retreat/:retreatId/sync-shirts',
	requirePermission('retreatInventory:update'),
	requireRetreatAccess('retreatId'),
	syncShirtItemsForRetreatController,
);

// Agrega al retiro todos los ítems activos del catálogo que falten.
router.post(
	'/retreat/:retreatId/sync-catalog',
	requirePermission('retreatInventory:create'),
	requireRetreatAccess('retreatId'),
	syncCatalogController,
);

// Bulk delete — usa 3 segments para que no choque con `/:itemId`
// (Express resuelve por número de segmentos primero).
router.post(
	'/retreat/:retreatId/items/bulk-delete',
	requirePermission('retreatInventory:delete'),
	requireRetreatAccess('retreatId'),
	bulkRemoveItemsFromRetreatController,
);

// Agregar item del catálogo al inventario del retiro.
router.post(
	'/retreat/:retreatId/items/:itemId',
	requirePermission('retreatInventory:create'),
	requireRetreatAccess('retreatId'),
	addItemToRetreatController,
);

// Eliminar item del inventario del retiro (no toca el catálogo).
router.delete(
	'/retreat/:retreatId/items/:itemId',
	requirePermission('retreatInventory:delete'),
	requireRetreatAccess('retreatId'),
	removeItemFromRetreatController,
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
