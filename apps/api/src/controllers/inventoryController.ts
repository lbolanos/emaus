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
	getInventoryAlerts,
	exportInventoryToExcel,
	importInventoryFromExcel,
} from '../services/inventoryService';
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
		const updatedInventory = await updateRetreatInventory(retreatId, itemId, req.body);
		if (updatedInventory) {
			res.json(updatedInventory);
		} else {
			res.status(404).json({ message: 'Retreat inventory not found' });
		}
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
		const inventories = await calculateRequiredQuantities(retreatId);
		res.json(inventories);
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
