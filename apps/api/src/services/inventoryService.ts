import { AppDataSource } from '../data-source';
import { InventoryCategory } from '../entities/inventoryCategory.entity';
import { InventoryTeam } from '../entities/inventoryTeam.entity';
import { InventoryItem } from '../entities/inventoryItem.entity';
import { RetreatInventory } from '../entities/retreatInventory.entity';
import { Retreat } from '../entities/retreat.entity';
import { Participant } from '../entities/participant.entity';
import { v4 as uuidv4 } from 'uuid';

// Category Services
export const getInventoryCategories = async () => {
	const categoryRepository = AppDataSource.getRepository(InventoryCategory);
	return categoryRepository.find({ where: { isActive: true }, order: { name: 'ASC' } });
};

export const createInventoryCategory = async (categoryData: Partial<InventoryCategory>) => {
	const categoryRepository = AppDataSource.getRepository(InventoryCategory);
	const newCategory = categoryRepository.create({
		id: uuidv4(),
		...categoryData,
	});
	return categoryRepository.save(newCategory);
};

// Team Services
export const getInventoryTeams = async () => {
	const teamRepository = AppDataSource.getRepository(InventoryTeam);
	return teamRepository.find({ where: { isActive: true }, order: { name: 'ASC' } });
};

export const createInventoryTeam = async (teamData: Partial<InventoryTeam>) => {
	const teamRepository = AppDataSource.getRepository(InventoryTeam);
	const newTeam = teamRepository.create({
		id: uuidv4(),
		...teamData,
	});
	return teamRepository.save(newTeam);
};

// Inventory Item Services
export const getInventoryItems = async () => {
	const itemRepository = AppDataSource.getRepository(InventoryItem);
	return itemRepository.find({
		where: { isActive: true },
		relations: ['category', 'team'],
		order: { name: 'ASC' },
	});
};

export const createInventoryItem = async (itemData: Partial<InventoryItem>) => {
	const itemRepository = AppDataSource.getRepository(InventoryItem);
	const newItem = itemRepository.create({
		id: uuidv4(),
		...itemData,
	});
	return itemRepository.save(newItem);
};

export const updateInventoryItem = async (id: string, itemData: Partial<InventoryItem>) => {
	const itemRepository = AppDataSource.getRepository(InventoryItem);
	const item = await itemRepository.findOne({ where: { id } });
	if (!item) {
		return null;
	}
	Object.assign(item, itemData);
	return itemRepository.save(item);
};

// Retreat Inventory Services
export const getRetreatInventory = async (retreatId: string) => {
	const retreatInventoryRepository = AppDataSource.getRepository(RetreatInventory);
	return retreatInventoryRepository.find({
		where: { retreatId },
		relations: ['inventoryItem', 'inventoryItem.category', 'inventoryItem.team'],
		order: { createdAt: 'ASC' },
	});
};

export const getRetreatInventoryByCategory = async (retreatId: string) => {
	const retreatInventoryRepository = AppDataSource.getRepository(RetreatInventory);
	const inventories = await retreatInventoryRepository.find({
		where: { retreatId },
		relations: ['inventoryItem', 'inventoryItem.category', 'inventoryItem.team'],
		order: { createdAt: 'ASC' },
	});

	// Group by category and sort by category name and item name
	const groupedByCategory = inventories.reduce(
		(acc, inventory) => {
			const categoryName = inventory.inventoryItem.category.name;
			if (!acc[categoryName]) {
				acc[categoryName] = [];
			}
			acc[categoryName].push(inventory);
			return acc;
		},
		{} as Record<string, typeof inventories>,
	);

	// Sort categories and items within categories
	const sortedCategories = Object.keys(groupedByCategory).sort();
	const sortedGrouped = {} as Record<string, typeof inventories>;

	for (const category of sortedCategories) {
		sortedGrouped[category] = groupedByCategory[category].sort((a, b) =>
			a.inventoryItem.name.localeCompare(b.inventoryItem.name),
		);
	}

	return sortedGrouped;
};

export const updateRetreatInventory = async (
	retreatId: string,
	itemId: string,
	updateData: { currentQuantity?: number; notes?: string },
) => {
	const retreatInventoryRepository = AppDataSource.getRepository(RetreatInventory);
	const inventory = await retreatInventoryRepository.findOne({
		where: { retreatId, inventoryItemId: itemId },
	});

	if (!inventory) {
		return null;
	}

	if (updateData.currentQuantity !== undefined) {
		inventory.currentQuantity = updateData.currentQuantity;
		inventory.isSufficient = inventory.currentQuantity >= inventory.requiredQuantity;
	}

	if (updateData.notes !== undefined) {
		inventory.notes = updateData.notes;
	}

	return retreatInventoryRepository.save(inventory);
};

// Ratio Calculation Services
export const calculateRequiredQuantities = async (retreatId: string) => {
	const retreatInventoryRepository = AppDataSource.getRepository(RetreatInventory);
	const participantRepository = AppDataSource.getRepository(Participant);

	// Get all retreat inventory items
	const inventories = await retreatInventoryRepository.find({
		where: { retreatId },
		relations: ['inventoryItem'],
	});

	// Calculate required quantities and update
	const updatedInventories = await Promise.all(
		inventories.map(async (inventory) => {
			let requiredQuantity: number;

			// Handle t-shirt calculations
			if (inventory.inventoryItem.isCalculated && inventory.inventoryItem.calculationType === 'tshirt') {
				requiredQuantity = await calculateTshirtQuantity(retreatId, inventory.inventoryItem.tshirtSize);
			}
			// Handle blue t-shirt calculations
			else if (inventory.inventoryItem.isCalculated && inventory.inventoryItem.calculationType === 'bluetshirt') {
				requiredQuantity = await calculateBlueTshirtQuantity(retreatId, inventory.inventoryItem.tshirtSize);
			}
			// Handle jacket calculations
			else if (inventory.inventoryItem.isCalculated && inventory.inventoryItem.calculationType === 'jacket') {
				requiredQuantity = await calculateJacketQuantity(retreatId, inventory.inventoryItem.tshirtSize);
			}
			// Use fixed quantity if specified, otherwise calculate using ratio
			else if (
				inventory.inventoryItem.requiredQuantity !== null &&
				inventory.inventoryItem.requiredQuantity !== undefined
			) {
				requiredQuantity = inventory.inventoryItem.requiredQuantity;
			} else {
				// Get count of active walkers for ratio-based calculations
				const walkerCount = await participantRepository.count({
					where: {
						retreatId,
						type: 'walker',
						isCancelled: false,
					},
				});
				requiredQuantity = Number((inventory.inventoryItem.ratio * walkerCount).toFixed(2));
			}

			inventory.requiredQuantity = requiredQuantity;
			inventory.isSufficient = inventory.currentQuantity >= requiredQuantity;
			return inventory;
		}),
	);

	await retreatInventoryRepository.save(updatedInventories);
	return updatedInventories;
};

// Helper function to calculate t-shirt quantities
const calculateTshirtQuantity = async (retreatId: string, tshirtSize: string | null | undefined): Promise<number> => {
	const participantRepository = AppDataSource.getRepository(Participant);
	
	if (!tshirtSize) return 0;

	// Get count of walkers with this t-shirt size
	const walkerCount = await participantRepository.count({
		where: {
			retreatId,
			type: 'walker',
			tshirtSize: tshirtSize as any,
			isCancelled: false,
		},
	});

	// Get count of servers who need white shirts and have this t-shirt size
	const serverCount = await participantRepository.count({
		where: {
			retreatId,
			type: 'server',
			tshirtSize: tshirtSize as any,
			needsWhiteShirt: true,
			isCancelled: false,
		},
	});

	return walkerCount + serverCount;
};

// Helper function to calculate blue t-shirt quantities
const calculateBlueTshirtQuantity = async (retreatId: string, tshirtSize: string | null | undefined): Promise<number> => {
	const participantRepository = AppDataSource.getRepository(Participant);
	
	if (!tshirtSize) return 0;

	// Get count of servers who need blue shirts and have this t-shirt size
	const serverCount = await participantRepository.count({
		where: {
			retreatId,
			type: 'server',
			tshirtSize: tshirtSize as any,
			needsBlueShirt: true,
			isCancelled: false,
		},
	});

	return serverCount;
};

// Helper function to calculate jacket quantities
const calculateJacketQuantity = async (retreatId: string, tshirtSize: string | null | undefined): Promise<number> => {
	const participantRepository = AppDataSource.getRepository(Participant);
	
	if (!tshirtSize) return 0;

	// Get count of servers who need jackets and have this t-shirt size
	const serverCount = await participantRepository.count({
		where: {
			retreatId,
			type: 'server',
			tshirtSize: tshirtSize as any,
			needsJacket: true,
			isCancelled: false,
		},
	});

	return serverCount;
};

export const getInventoryAlerts = async (retreatId: string) => {
	const retreatInventoryRepository = AppDataSource.getRepository(RetreatInventory);
	const alerts = await retreatInventoryRepository.find({
		where: {
			retreatId,
			isSufficient: false,
		},
		relations: ['inventoryItem', 'inventoryItem.category', 'inventoryItem.team'],
		order: { createdAt: 'ASC' },
	});

	// Sort alerts by item name
	const sortedAlerts = alerts.sort((a, b) =>
		a.inventoryItem.name.localeCompare(b.inventoryItem.name),
	);

	return sortedAlerts.map((alert) => ({
		id: alert.id,
		itemName: alert.inventoryItem.name,
		categoryName: alert.inventoryItem.category.name,
		teamName: alert.inventoryItem.team.name,
		requiredQuantity: alert.requiredQuantity,
		currentQuantity: alert.currentQuantity,
		deficit: Number((alert.requiredQuantity - alert.currentQuantity).toFixed(2)),
		unit: alert.inventoryItem.unit,
		notes: alert.notes,
	}));
};

// Default Inventory Creation
export const createDefaultInventoryForRetreat = async (retreat: Retreat) => {
	const retreatInventoryRepository = AppDataSource.getRepository(RetreatInventory);
	const itemRepository = AppDataSource.getRepository(InventoryItem);

	// Get all active inventory items
	const items = await itemRepository.find({ where: { isActive: true } });

	// Get initial walker count (will be 0 for new retreats)
	const participantRepository = AppDataSource.getRepository(Participant);
	const walkerCount = await participantRepository.count({
		where: {
			retreatId: retreat.id,
			type: 'walker',
			isCancelled: false,
		},
	});

	// Create retreat inventory items
	const newInventories = items.map((item) => {
		let requiredQuantity: number;

		// Use fixed quantity if specified, otherwise calculate using ratio
		if (item.requiredQuantity !== null && item.requiredQuantity !== undefined) {
			requiredQuantity = item.requiredQuantity;
		} else {
			requiredQuantity = Number((item.ratio * walkerCount).toFixed(2));
		}

		return retreatInventoryRepository.create({
			id: uuidv4(),
			retreatId: retreat.id,
			inventoryItemId: item.id,
			requiredQuantity,
			currentQuantity: 0,
			isSufficient: false,
		});
	});

	await retreatInventoryRepository.save(newInventories);
	return newInventories;
};

// Import/Export Services
export const exportInventoryToExcel = async (retreatId: string) => {
	const inventories = await getRetreatInventory(retreatId);

	const exportData = inventories.map((inventory) => ({
		Artículo: inventory.inventoryItem.name,
		Descripción: inventory.inventoryItem.description || '',
		Categoría: inventory.inventoryItem.category.name,
		Equipo: inventory.inventoryItem.team.name,
		'Ratio por Caminante': inventory.inventoryItem.ratio,
		'Cantidad Fija': inventory.inventoryItem.requiredQuantity || '',
		Unidad: inventory.inventoryItem.unit,
		'Cantidad Requerida': inventory.requiredQuantity,
		'Cantidad Actual': inventory.currentQuantity,
		'Estado Suficiente': inventory.isSufficient ? 'Sí' : 'No',
		Notas: inventory.notes || '',
	}));

	return exportData;
};

export const importInventoryFromExcel = async (retreatId: string, excelData: any[]) => {
	const retreatInventoryRepository = AppDataSource.getRepository(RetreatInventory);
	const itemRepository = AppDataSource.getRepository(InventoryItem);

	const results = {
		success: [],
		errors: [],
	} as { success: any[]; errors: any[] };

	for (const row of excelData) {
		try {
			// Find inventory item by name
			const item = await itemRepository.findOne({
				where: { name: row['Artículo'] || row['Articulo'] },
				relations: ['category', 'team'],
			});

			if (!item) {
				results.errors.push({
					row,
					error: `Artículo no encontrado: ${row['Artículo'] || row['Articulo']}`,
				});
				continue;
			}

			// Find or create retreat inventory
			let retreatInventory = await retreatInventoryRepository.findOne({
				where: { retreatId, inventoryItemId: item.id },
			});

			if (!retreatInventory) {
				retreatInventory = retreatInventoryRepository.create({
					id: uuidv4(),
					retreatId,
					inventoryItemId: item.id,
					requiredQuantity: Number(row['Cantidad Requerida'] || 0),
					currentQuantity: Number(row['Cantidad Actual'] || 0),
					isSufficient:
						Number(row['Cantidad Actual'] || 0) >= Number(row['Cantidad Requerida'] || 0),
					notes: row['Notas'] || '',
				});
			} else {
				retreatInventory.currentQuantity = Number(row['Cantidad Actual'] || 0);
				retreatInventory.notes = row['Notas'] || '';
				retreatInventory.isSufficient =
					retreatInventory.currentQuantity >= retreatInventory.requiredQuantity;
			}

			await retreatInventoryRepository.save(retreatInventory);
			results.success.push({ row, inventory: retreatInventory });
		} catch (error) {
			results.errors.push({
				row,
				error: `Error procesando fila: ${error instanceof Error ? error.message : 'Error desconocido'}`,
			});
		}
	}

	return results;
};
