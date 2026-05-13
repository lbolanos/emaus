import { Request, Response, NextFunction } from 'express';
import {
	getInventoryCategories,
	createInventoryCategory,
	getInventoryTeams,
	createInventoryTeam,
	getInventoryItems,
	createInventoryItem,
	updateInventoryItem,
	getRetreatInventory,
	getRetreatInventoryByCategory,
	updateRetreatInventory,
	calculateRequiredQuantities,
	getActualWalkerCount,
	getInventoryAlerts,
	exportInventoryToExcel,
	importInventoryFromExcel,
	copyInventoryFromRetreat,
	bulkUpdateRetreatInventory,
	getRetreatInventoryHistory,
	removeItemFromRetreat,
	bulkRemoveItemsFromRetreat,
	addItemToRetreat,
	addCustomItemToRetreat,
	getAvailableItemsForRetreat,
	syncShirtItemsForRetreat,
	syncMissingCatalogItems,
} from '../services/inventoryService';
import { AppDataSource } from '../data-source';
import { Retreat } from '../entities/retreat.entity';
import { v4 as uuidv4 } from 'uuid';

// Category Controllers
export const getAllInventoryCategories = async (
	req: Request,
	res: Response,
	next: NextFunction,
) => {
	try {
		const categories = await getInventoryCategories();
		res.json(categories);
	} catch (error) {
		next(error);
	}
};

export const createInventoryCategoryController = async (
	req: Request,
	res: Response,
	next: NextFunction,
) => {
	try {
		const newCategory = await createInventoryCategory(req.body);
		res.status(201).json(newCategory);
	} catch (error) {
		next(error);
	}
};

// Team Controllers
export const getAllInventoryTeams = async (req: Request, res: Response, next: NextFunction) => {
	try {
		const teams = await getInventoryTeams();
		res.json(teams);
	} catch (error) {
		next(error);
	}
};

export const createInventoryTeamController = async (
	req: Request,
	res: Response,
	next: NextFunction,
) => {
	try {
		const newTeam = await createInventoryTeam(req.body);
		res.status(201).json(newTeam);
	} catch (error) {
		next(error);
	}
};

// Inventory Item Controllers
export const getAllInventoryItems = async (req: Request, res: Response, next: NextFunction) => {
	try {
		const items = await getInventoryItems();
		res.json(items);
	} catch (error) {
		next(error);
	}
};

export const createInventoryItemController = async (
	req: Request,
	res: Response,
	next: NextFunction,
) => {
	try {
		const newItem = await createInventoryItem(req.body);
		res.status(201).json(newItem);
	} catch (error) {
		next(error);
	}
};

export const updateInventoryItemController = async (
	req: Request,
	res: Response,
	next: NextFunction,
) => {
	try {
		const updatedItem = await updateInventoryItem(req.params.id, req.body);
		if (updatedItem) {
			res.json(updatedItem);
		} else {
			res.status(404).json({ message: 'Inventory item not found' });
		}
	} catch (error) {
		next(error);
	}
};

// Retreat Inventory Controllers
export const getRetreatInventoryController = async (
	req: Request,
	res: Response,
	next: NextFunction,
) => {
	try {
		const { retreatId } = req.params;
		const inventory = await getRetreatInventory(retreatId);
		res.json(inventory);
	} catch (error) {
		next(error);
	}
};

export const getRetreatInventoryByCategoryController = async (
	req: Request,
	res: Response,
	next: NextFunction,
) => {
	try {
		const { retreatId } = req.params;
		const inventory = await getRetreatInventoryByCategory(retreatId);
		res.json(inventory);
	} catch (error) {
		next(error);
	}
};

export const updateRetreatInventoryController = async (
	req: Request,
	res: Response,
	next: NextFunction,
) => {
	try {
		const { retreatId, itemId } = req.params;
		const userId = (req as any).user?.id;
		const updatedInventory = await updateRetreatInventory(
			retreatId,
			itemId,
			req.body,
			undefined,
			userId,
		);
		if (updatedInventory) {
			res.json(updatedInventory);
		} else {
			res.status(404).json({ message: 'Retreat inventory not found' });
		}
	} catch (error: any) {
		// Errores de validación (currentQuantity negativo o status inválido) → 400
		if (
			error?.message?.includes('currentQuantity') ||
			error?.message?.includes('status inválido')
		) {
			return res.status(400).json({ message: error.message });
		}
		next(error);
	}
};

export const bulkUpdateRetreatInventoryController = async (
	req: Request,
	res: Response,
	next: NextFunction,
) => {
	try {
		const { retreatId } = req.params;
		const { itemIds, ...patch } = req.body || {};
		if (!Array.isArray(itemIds) || itemIds.length === 0) {
			return res.status(400).json({ message: 'itemIds debe ser un array no vacío' });
		}
		const userId = (req as any).user?.id;
		const result = await bulkUpdateRetreatInventory(
			retreatId,
			itemIds,
			patch,
			undefined,
			userId,
		);
		res.json(result);
	} catch (error: any) {
		if (error?.message?.includes('status inválido')) {
			return res.status(400).json({ message: error.message });
		}
		next(error);
	}
};

export const removeItemFromRetreatController = async (
	req: Request,
	res: Response,
	next: NextFunction,
) => {
	try {
		const { retreatId, itemId } = req.params;
		const ok = await removeItemFromRetreat(retreatId, itemId);
		if (!ok) return res.status(404).json({ message: 'Item no encontrado en el retiro' });
		res.json({ removed: true });
	} catch (error) {
		next(error);
	}
};

export const bulkRemoveItemsFromRetreatController = async (
	req: Request,
	res: Response,
	next: NextFunction,
) => {
	try {
		const { retreatId } = req.params;
		const { itemIds } = req.body || {};
		if (!Array.isArray(itemIds) || itemIds.length === 0) {
			return res.status(400).json({ message: 'itemIds debe ser un array no vacío' });
		}
		const result = await bulkRemoveItemsFromRetreat(retreatId, itemIds);
		res.json(result);
	} catch (error) {
		next(error);
	}
};

export const addItemToRetreatController = async (
	req: Request,
	res: Response,
	next: NextFunction,
) => {
	try {
		const { retreatId, itemId } = req.params;
		const overrides = {
			ratioOverride:
				req.body?.ratioOverride !== undefined && req.body.ratioOverride !== null
					? Number(req.body.ratioOverride)
					: null,
			requiredQtyOverride:
				req.body?.requiredQtyOverride !== undefined && req.body.requiredQtyOverride !== null
					? Number(req.body.requiredQtyOverride)
					: null,
		};
		const result = await addItemToRetreat(retreatId, itemId, undefined, overrides);
		if (result && typeof (result as any).error === 'string') {
			return res.status(400).json({ message: (result as any).error });
		}
		res.status(201).json(result);
	} catch (error) {
		next(error);
	}
};

export const addCustomItemToRetreatController = async (
	req: Request,
	res: Response,
	next: NextFunction,
) => {
	try {
		const { retreatId } = req.params;
		const result = await addCustomItemToRetreat(retreatId, req.body);
		if (result && typeof (result as any).error === 'string') {
			return res.status(400).json({ message: (result as any).error });
		}
		res.status(201).json(result);
	} catch (error) {
		next(error);
	}
};

export const syncShirtItemsForRetreatController = async (
	req: Request,
	res: Response,
	next: NextFunction,
) => {
	try {
		const { retreatId } = req.params;
		const result = await syncShirtItemsForRetreat(retreatId);
		res.json(result);
	} catch (error) {
		next(error);
	}
};

export const getAvailableItemsForRetreatController = async (
	req: Request,
	res: Response,
	next: NextFunction,
) => {
	try {
		const { retreatId } = req.params;
		const items = await getAvailableItemsForRetreat(retreatId);
		res.json(items);
	} catch (error) {
		next(error);
	}
};

export const syncCatalogController = async (
	req: Request,
	res: Response,
	next: NextFunction,
) => {
	try {
		const { retreatId } = req.params;
		const result = await syncMissingCatalogItems(retreatId);
		res.json(result);
	} catch (error) {
		next(error);
	}
};

export const getRetreatInventoryHistoryController = async (
	req: Request,
	res: Response,
	next: NextFunction,
) => {
	try {
		const { retreatId } = req.params;
		const limit = req.query.limit ? Number(req.query.limit) : undefined;
		const itemId = (req.query.itemId as string | undefined) || undefined;
		const history = await getRetreatInventoryHistory(retreatId, { limit, itemId });
		res.json(history);
	} catch (error) {
		next(error);
	}
};

export const copyInventoryFromRetreatController = async (
	req: Request,
	res: Response,
	next: NextFunction,
) => {
	try {
		const { retreatId, sourceRetreatId } = req.params;
		const overwrite = req.body?.overwrite === true || req.query?.overwrite === 'true';

		// Sanity: ambos retiros existen.
		const retreatRepo = AppDataSource.getRepository(Retreat);
		const [target, source] = await Promise.all([
			retreatRepo.findOne({ where: { id: retreatId } }),
			retreatRepo.findOne({ where: { id: sourceRetreatId } }),
		]);
		if (!target) return res.status(404).json({ message: 'Retiro destino no encontrado' });
		if (!source) return res.status(404).json({ message: 'Retiro origen no encontrado' });
		if (retreatId === sourceRetreatId) {
			return res
				.status(400)
				.json({ message: 'El retiro origen y destino no pueden ser el mismo.' });
		}

		const result = await copyInventoryFromRetreat(sourceRetreatId, retreatId, { overwrite });
		res.json(result);
	} catch (error) {
		next(error);
	}
};

export const calculateRequiredQuantitiesController = async (
	req: Request,
	res: Response,
	next: NextFunction,
) => {
	try {
		const { retreatId } = req.params;
		const calcBase = req.body?.calcBase === 'expected' ? 'expected' : 'actual';
		const inventories = await calculateRequiredQuantities(retreatId, undefined, { calcBase });
		res.json(inventories);
	} catch (error) {
		next(error);
	}
};

export const getWalkerCountController = async (
	req: Request,
	res: Response,
	next: NextFunction,
) => {
	try {
		const { retreatId } = req.params;
		const walkerCount = await getActualWalkerCount(retreatId);
		res.json({ walkerCount });
	} catch (error) {
		next(error);
	}
};

export const getInventoryAlertsController = async (
	req: Request,
	res: Response,
	next: NextFunction,
) => {
	try {
		//console.log('🚨 [INVENTORY ALERTS] Starting inventory alerts request');
		//console.log('🚨 [INVENTORY ALERTS] Request URL:', req.originalUrl);
		//console.log('🚨 [INVENTORY ALERTS] Request method:', req.method);
		//console.log('🚨 [INVENTORY ALERTS] Request params:', req.params);
		//console.log('🚨 [INVENTORY ALERTS] Request user:', (req as any).user ? { id: (req as any).user.id, email: (req as any).user.email } : 'No user');

		const { retreatId } = req.params;
		//console.log('🚨 [INVENTORY ALERTS] Extracted retreatId:', retreatId);

		if (!retreatId) {
			console.log('❌ [INVENTORY ALERTS] No retreatId found in params');
			return res.status(400).json({ message: 'Retreat ID is required' });
		}

		//console.log('🚨 [INVENTORY ALERTS] Calling getInventoryAlerts service...');
		const alerts = await getInventoryAlerts(retreatId);
		//console.log('🚨 [INVENTORY ALERTS] Successfully retrieved alerts:', alerts);
		console.log('✅ [INVENTORY ALERTS] Sending successful response');

		res.json(alerts);
	} catch (error) {
		console.error('❌ [INVENTORY ALERTS] Error in inventory alerts controller:', error);
		next(error);
	}
};

// Import/Export Controllers
export const exportInventoryController = async (
	req: Request,
	res: Response,
	next: NextFunction,
) => {
	try {
		const { retreatId } = req.params;
		const exportData = await exportInventoryToExcel(retreatId);
		res.json(exportData);
	} catch (error) {
		next(error);
	}
};

export const importInventoryController = async (
	req: Request,
	res: Response,
	next: NextFunction,
) => {
	try {
		const { retreatId } = req.params;
		const { data } = req.body;

		if (!data || !Array.isArray(data)) {
			return res.status(400).json({ message: 'Invalid import data format' });
		}

		const results = await importInventoryFromExcel(retreatId, data);
		res.json(results);
	} catch (error) {
		next(error);
	}
};
