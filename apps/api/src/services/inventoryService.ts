import { DataSource } from 'typeorm';
import { AppDataSource } from '../data-source';
import { InventoryCategory } from '../entities/inventoryCategory.entity';
import { InventoryTeam } from '../entities/inventoryTeam.entity';
import { InventoryTeam } from '../entities/inventoryTeam.entity';
import { InventoryItem } from '../entities/inventoryItem.entity';
import { RetreatInventory } from '../entities/retreatInventory.entity';
import { RetreatInventoryHistory } from '../entities/retreatInventoryHistory.entity';
import { Retreat } from '../entities/retreat.entity';
import { getRepositories } from '../utils/repositoryHelpers';
import { RetreatParticipant } from '../entities/retreatParticipant.entity';
import { RetreatShirtType } from '../entities/retreatShirtType.entity';
import { ParticipantShirtSize } from '../entities/participantShirtSize.entity';
import { v4 as uuidv4 } from 'uuid';

// Category Services
export const getInventoryCategories = async (dataSource?: DataSource) => {
	const repos = getRepositories(dataSource);
	return repos.inventoryCategory.find({ where: { isActive: true }, order: { name: 'ASC' } });
};

export const createInventoryCategory = async (
	categoryData: Partial<InventoryCategory>,
	dataSource?: DataSource,
) => {
	const repos = getRepositories(dataSource);
	const newCategory = repos.inventoryCategory.create({
		id: uuidv4(),
		...categoryData,
	});
	return repos.inventoryCategory.save(newCategory);
};

// Team Services
export const getInventoryTeams = async (dataSource?: DataSource) => {
	const repos = getRepositories(dataSource);
	return repos.inventoryTeam.find({ where: { isActive: true }, order: { name: 'ASC' } });
};

export const createInventoryTeam = async (
	teamData: Partial<InventoryTeam>,
	dataSource?: DataSource,
) => {
	const repos = getRepositories(dataSource);
	const newTeam = repos.inventoryTeam.create({
		id: uuidv4(),
		...teamData,
	});
	return repos.inventoryTeam.save(newTeam);
};

// Inventory Item Services
export const getInventoryItems = async (dataSource?: DataSource) => {
	const repos = getRepositories(dataSource);
	return repos.inventoryItem.find({
		where: { isActive: true },
		relations: ['category', 'team'],
		order: { name: 'ASC' },
	});
};

export const createInventoryItem = async (
	itemData: Partial<InventoryItem>,
	dataSource?: DataSource,
) => {
	const repos = getRepositories(dataSource);
	const newItem = repos.inventoryItem.create({
		id: uuidv4(),
		...itemData,
	});
	return repos.inventoryItem.save(newItem);
};

export const updateInventoryItem = async (
	id: string,
	itemData: Partial<InventoryItem>,
	dataSource?: DataSource,
) => {
	const repos = getRepositories(dataSource);
	const item = await repos.inventoryItem.findOne({ where: { id } });
	if (!item) {
		return null;
	}
	Object.assign(item, itemData);
	return repos.inventoryItem.save(item);
};

// Retreat Inventory Services
export const getRetreatInventory = async (
	retreatId: string,
	dataSource?: DataSource,
	includeExcluded = false,
) => {
	const repos = getRepositories(dataSource);
	const rows = await repos.retreatInventory.find({
		where: { retreatId },
		relations: [
			'inventoryItem',
			'inventoryItem.category',
			'inventoryItem.team',
			'customCategory',
			'customTeam',
			'retreatShirtType',
		],
		order: { createdAt: 'ASC' },
	});
	return includeExcluded ? rows : rows.filter((r) => !r.isExcluded);
};

/**
 * Devuelve el nombre de categoría para agrupar/filtrar.
 * Prioridad: customCategory > inventoryItem.category > "Camisetas" (si tiene
 * shirt type) > "Sin categoría".
 */
const categoryNameOf = (row: RetreatInventory): string => {
	if (row.customCategory?.name) return row.customCategory.name;
	if (row.inventoryItem?.category?.name) return row.inventoryItem.category.name;
	if (row.retreatShirtTypeId) return 'Camisetas';
	return 'Sin categoría';
};

const displayNameOf = (row: RetreatInventory): string => {
	if (row.inventoryItem?.name) return row.inventoryItem.name;
	if (row.customName) return row.customName;
	return '(sin nombre)';
};

export const getRetreatInventoryByCategory = async (retreatId: string, dataSource?: DataSource) => {
	// Devuelve TODOS los items (incluidos excluidos) para que el frontend
	// pueda mostrarlos al activar "Ver excluidos" sin hacer otra llamada.
	const inventories = await getRetreatInventory(retreatId, dataSource, true);

	const groupedByCategory = inventories.reduce(
		(acc, inventory) => {
			const categoryName = categoryNameOf(inventory);
			if (!acc[categoryName]) {
				acc[categoryName] = [];
			}
			acc[categoryName].push(inventory);
			return acc;
		},
		{} as Record<string, typeof inventories>,
	);

	const sortedCategories = Object.keys(groupedByCategory).sort();
	const sortedGrouped = {} as Record<string, typeof inventories>;
	for (const category of sortedCategories) {
		sortedGrouped[category] = groupedByCategory[category].sort((a, b) =>
			displayNameOf(a).localeCompare(displayNameOf(b)),
		);
	}
	return sortedGrouped;
};

/**
 * Verdadero si la cantidad actual cubre la requerida. Trata
 * `required = 0` como suficiente (incluso con `current = 0`), porque
 * no necesitar nada no debería levantar alerta. Acepta cualquier tipo
 * coercible a número (TypeORM con SQLite a veces devuelve string para
 * columnas decimal).
 */
export const computeIsSufficient = (
	requiredQuantity: number | string | null | undefined,
	currentQuantity: number | string | null | undefined,
): boolean => {
	const required = Number(requiredQuantity ?? 0);
	const current = Number(currentQuantity ?? 0);
	if (!Number.isFinite(required) || required <= 0) return true;
	return current >= required;
};

export type RetreatInventoryStatus =
	| 'pending'
	| 'packed'
	| 'onsite'
	| 'consumed'
	| 'returned';

const VALID_STATUSES: RetreatInventoryStatus[] = [
	'pending',
	'packed',
	'onsite',
	'consumed',
	'returned',
];

type AuditableField = 'currentQuantity' | 'requiredQuantity' | 'boxLabel' | 'notes' | 'status';

const stringifyForAudit = (v: unknown): string | undefined => {
	if (v === null || v === undefined || v === '') return undefined;
	return String(v);
};

const recordHistory = async (
	inventoryRow: RetreatInventory,
	changes: { field: AuditableField; oldValue: unknown; newValue: unknown }[],
	userId: string | undefined,
	dataSource?: DataSource,
): Promise<void> => {
	const repos = getRepositories(dataSource);
	const rows = changes
		.filter((c) => stringifyForAudit(c.oldValue) !== stringifyForAudit(c.newValue))
		.map((c) =>
			repos.retreatInventoryHistory.create({
				id: uuidv4(),
				retreatInventoryId: inventoryRow.id,
				retreatId: inventoryRow.retreatId,
				inventoryItemId: inventoryRow.inventoryItemId ?? undefined,
				field: c.field,
				oldValue: stringifyForAudit(c.oldValue),
				newValue: stringifyForAudit(c.newValue),
				userId,
			}),
		);
	if (rows.length > 0) {
		await repos.retreatInventoryHistory.save(rows);
	}
};

export const updateRetreatInventory = async (
	retreatId: string,
	itemId: string,
	updateData: {
		currentQuantity?: number;
		notes?: string;
		boxLabel?: string | null;
		status?: RetreatInventoryStatus;
		ratioOverride?: number | null;
		requiredQtyOverride?: number | null;
		isExcluded?: boolean;
	},
	dataSource?: DataSource,
	userId?: string,
) => {
	const repos = getRepositories(dataSource);
	// itemId puede ser inventoryItem.id (clásico) o retreat_inventory.id (ad-hoc/shirt).
	let inventory = await repos.retreatInventory.findOne({
		where: { retreatId, inventoryItemId: itemId },
	});
	if (!inventory) {
		inventory = await repos.retreatInventory.findOne({
			where: { retreatId, id: itemId },
		});
	}

	if (!inventory) {
		return null;
	}

	const changes: { field: AuditableField; oldValue: unknown; newValue: unknown }[] = [];

	if (updateData.currentQuantity !== undefined) {
		const qty = Number(updateData.currentQuantity);
		if (!Number.isFinite(qty) || qty < 0) {
			throw new Error('currentQuantity debe ser un número >= 0');
		}
		changes.push({
			field: 'currentQuantity',
			oldValue: inventory.currentQuantity,
			newValue: qty,
		});
		inventory.currentQuantity = qty;
		inventory.isSufficient = computeIsSufficient(inventory.requiredQuantity, qty);
	}

	if (updateData.notes !== undefined) {
		changes.push({ field: 'notes', oldValue: inventory.notes ?? '', newValue: updateData.notes });
		inventory.notes = updateData.notes;
	}

	if (updateData.boxLabel !== undefined) {
		const newBox = updateData.boxLabel ?? undefined;
		changes.push({
			field: 'boxLabel',
			oldValue: inventory.boxLabel ?? '',
			newValue: newBox ?? '',
		});
		inventory.boxLabel = newBox;
	}

	if (updateData.status !== undefined) {
		if (!VALID_STATUSES.includes(updateData.status)) {
			throw new Error(`status inválido. Valores válidos: ${VALID_STATUSES.join(', ')}`);
		}
		changes.push({ field: 'status', oldValue: inventory.status, newValue: updateData.status });
		inventory.status = updateData.status;
	}

	if ('ratioOverride' in updateData) {
		inventory.ratioOverride =
			updateData.ratioOverride !== undefined ? updateData.ratioOverride : null;
	}

	if ('requiredQtyOverride' in updateData) {
		const newOverride =
			updateData.requiredQtyOverride !== undefined ? updateData.requiredQtyOverride : null;
		inventory.requiredQtyOverride = newOverride;
		// Aplicar inmediatamente si hay un valor
		if (newOverride !== null && newOverride !== undefined) {
			inventory.requiredQuantity = Math.ceil(Number(newOverride));
			inventory.isSufficient = computeIsSufficient(inventory.requiredQuantity, inventory.currentQuantity);
		}
	}

	if ('isExcluded' in updateData && updateData.isExcluded !== undefined) {
		inventory.isExcluded = updateData.isExcluded;
	}

	const saved = await repos.retreatInventory.save(inventory);
	if (changes.length > 0) {
		await recordHistory(saved, changes, userId, dataSource);
	}
	const reloaded = await repos.retreatInventory.findOne({
		where: { id: saved.id },
		relations: [
			'inventoryItem',
			'inventoryItem.category',
			'inventoryItem.team',
			'customCategory',
			'customTeam',
			'retreatShirtType',
		],
	});
	return reloaded ?? saved;
};

/**
 * Aplica el mismo conjunto de cambios a múltiples items a la vez.
 * Útil para "marcar 20 items como Caja 1" o "todos los del Botiquín
 * como packed" en un solo clic desde la UI.
 */
export const bulkUpdateRetreatInventory = async (
	retreatId: string,
	itemIds: string[],
	updateData: {
		boxLabel?: string | null;
		status?: RetreatInventoryStatus;
		notes?: string;
	},
	dataSource?: DataSource,
	userId?: string,
): Promise<{ updated: number; notFound: number }> => {
	if (!itemIds || itemIds.length === 0) return { updated: 0, notFound: 0 };
	if (
		updateData.boxLabel === undefined &&
		updateData.status === undefined &&
		updateData.notes === undefined
	) {
		return { updated: 0, notFound: 0 };
	}

	let updated = 0;
	let notFound = 0;
	for (const itemId of itemIds) {
		const result = await updateRetreatInventory(
			retreatId,
			itemId,
			updateData,
			dataSource,
			userId,
		);
		if (result) updated++;
		else notFound++;
	}
	return { updated, notFound };
};

/**
 * Elimina un item del retiro (no del catálogo global). El item sigue
 * disponible para ser re-agregado vía `addItemToRetreat`. Se borra
 * también el audit log asociado por CASCADE.
 */
export const removeItemFromRetreat = async (
	retreatId: string,
	itemId: string,
	dataSource?: DataSource,
): Promise<boolean> => {
	const repos = getRepositories(dataSource);
	let row = await repos.retreatInventory.findOne({
		where: { retreatId, inventoryItemId: itemId },
	});
	if (!row) {
		row = await repos.retreatInventory.findOne({
			where: { retreatId, id: itemId },
		});
	}
	if (!row) return false;
	await repos.retreatInventory.remove(row);
	return true;
};

export const bulkRemoveItemsFromRetreat = async (
	retreatId: string,
	itemIds: string[],
	dataSource?: DataSource,
): Promise<{ removed: number }> => {
	if (!itemIds || itemIds.length === 0) return { removed: 0 };
	let removed = 0;
	for (const itemId of itemIds) {
		if (await removeItemFromRetreat(retreatId, itemId, dataSource)) removed++;
	}
	return { removed };
};

/**
 * Agrega un item del catálogo global al inventario del retiro.
 * Calcula `requiredQuantity` con base en walkers o max_walkers.
 */
export const addItemToRetreat = async (
	retreatId: string,
	itemId: string,
	dataSource?: DataSource,
	overrides?: { ratioOverride?: number | null; requiredQtyOverride?: number | null },
): Promise<RetreatInventory | { error: string }> => {
	const repos = getRepositories(dataSource);

	const existing = await repos.retreatInventory.findOne({
		where: { retreatId, inventoryItemId: itemId },
	});
	if (existing) return { error: 'Este item ya está en el inventario del retiro.' };

	const item = await repos.inventoryItem.findOne({ where: { id: itemId, isActive: true } });
	if (!item) return { error: 'Item no encontrado en el catálogo.' };

	const retreat = await repos.retreat.findOne({ where: { id: retreatId } });
	if (!retreat) return { error: 'Retiro no encontrado.' };

	const ds = dataSource || AppDataSource;
	const walkerCount = await ds.getRepository(RetreatParticipant).count({
		where: { retreatId, type: 'walker', isCancelled: false },
	});
	const base = walkerCount > 0 ? walkerCount : retreat.max_walkers ?? 0;

	// requiredQtyOverride tiene la máxima prioridad
	let requiredQuantity: number;
	if (overrides?.requiredQtyOverride !== null && overrides?.requiredQtyOverride !== undefined) {
		requiredQuantity = Math.ceil(Number(overrides.requiredQtyOverride));
	} else if (item.requiredQuantity !== null && item.requiredQuantity !== undefined) {
		requiredQuantity = Number(item.requiredQuantity);
	} else {
		const effectiveRatio =
			overrides?.ratioOverride !== null && overrides?.ratioOverride !== undefined
				? Number(overrides.ratioOverride)
				: Number(item.ratio);
		requiredQuantity = Math.ceil(effectiveRatio * base);
	}

	const row = repos.retreatInventory.create({
		id: uuidv4(),
		retreatId,
		inventoryItemId: itemId,
		requiredQuantity,
		currentQuantity: 0,
		isSufficient: computeIsSufficient(requiredQuantity, 0),
		status: 'pending',
		ratioOverride: overrides?.ratioOverride ?? null,
		requiredQtyOverride: overrides?.requiredQtyOverride ?? null,
	});
	return repos.retreatInventory.save(row);
};

/**
 * Crea un item ad-hoc directamente en el inventario del retiro,
 * sin pasar por el catálogo global. `inventoryItemId` queda null.
 */
export const addCustomItemToRetreat = async (
	retreatId: string,
	payload: {
		customName: string;
		customUnit?: string;
		customCategoryId?: string | null;
		requiredQuantity?: number;
		currentQuantity?: number;
		notes?: string;
		boxLabel?: string;
		ratioOverride?: number | null;
		requiredQtyOverride?: number | null;
	},
	dataSource?: DataSource,
): Promise<RetreatInventory | { error: string }> => {
	if (!payload.customName || !payload.customName.trim()) {
		return { error: 'customName es requerido' };
	}
	const repos = getRepositories(dataSource);
	const retreat = await repos.retreat.findOne({ where: { id: retreatId } });
	if (!retreat) return { error: 'Retiro no encontrado' };

	const requiredQuantity = Number(payload.requiredQuantity ?? 0);
	const currentQuantity = Math.max(0, Number(payload.currentQuantity ?? 0));

	const row = repos.retreatInventory.create({
		id: uuidv4(),
		retreatId,
		inventoryItemId: null,
		requiredQuantity,
		currentQuantity,
		isSufficient: computeIsSufficient(requiredQuantity, currentQuantity),
		status: 'pending',
		customName: payload.customName.trim(),
		customUnit: payload.customUnit?.trim() || 'piezas',
		customCategoryId: payload.customCategoryId ?? null,
		notes: payload.notes,
		boxLabel: payload.boxLabel,
		ratioOverride: payload.ratioOverride ?? null,
		requiredQtyOverride: payload.requiredQtyOverride ?? null,
	});
	return repos.retreatInventory.save(row);
};

/**
 * Sincroniza el inventario del retiro con sus `RetreatShirtType`:
 *  - Crea una fila por (tipo × talla) si no existe.
 *  - Actualiza `requiredQuantity` contando `ParticipantShirtSize`.
 *  - Elimina filas obsoletas (tipo borrado / talla quitada) solo si
 *    `currentQuantity = 0`. Si tiene stock, se conserva (warning).
 *
 * Idempotente. Devuelve {created, updated, removed, skipped}.
 */
export const syncShirtItemsForRetreat = async (
	retreatId: string,
	dataSource?: DataSource,
): Promise<{ created: number; updated: number; removed: number; skipped: number }> => {
	const ds = dataSource || AppDataSource;
	const repos = getRepositories(dataSource);

	const shirtTypes = await ds.getRepository(RetreatShirtType).find({
		where: { retreatId },
		order: { sortOrder: 'ASC' },
	});

	// Buscar categoría Camisetas y equipo Recepción para asignar a las filas
	const camisetasCat = await ds
		.getRepository(InventoryCategory)
		.findOne({ where: { name: 'Camisetas' } });
	const recepcionTeam = await ds
		.getRepository(InventoryTeam)
		.findOne({ where: { name: 'Recepción' } });

	let created = 0;
	let updated = 0;

	// Set de tuplas (typeId, size) que sí debemos tener.
	const desired = new Set<string>();

	for (const t of shirtTypes) {
		const sizes: string[] = Array.isArray(t.availableSizes) ? t.availableSizes : [];
		for (const size of sizes) {
			desired.add(`${t.id}|${size}`);

			// Contar solo participantes activos (no cancelados) del retiro
			const count = await ds
				.createQueryBuilder(ParticipantShirtSize, 'pss')
				.innerJoin(
					'retreat_participants',
					'rp',
					'rp.participantId = pss.participantId AND rp.retreatId = :retreatId AND rp.isCancelled = 0',
					{ retreatId },
				)
				.where('pss.shirtTypeId = :typeId', { typeId: t.id })
				.andWhere('pss.size = :size', { size })
				.getCount();

			const requiredQuantity = count;
			const customName = `${t.name} · Talla ${size}`;

			const existing = await repos.retreatInventory.findOne({
				where: { retreatId, retreatShirtTypeId: t.id, shirtSize: size },
			});
			if (!existing) {
				const row = repos.retreatInventory.create({
					id: uuidv4(),
					retreatId,
					inventoryItemId: null,
					retreatShirtTypeId: t.id,
					shirtSize: size,
					customName,
					customUnit: 'piezas',
					customCategoryId: camisetasCat?.id ?? null,
					customTeamId: recepcionTeam?.id ?? null,
					requiredQuantity,
					currentQuantity: 0,
					isSufficient: computeIsSufficient(requiredQuantity, 0),
					status: 'pending',
				});
				await repos.retreatInventory.save(row);
				created++;
			} else {
				existing.customName = customName;
				existing.customCategoryId = camisetasCat?.id ?? existing.customCategoryId ?? null;
				existing.customTeamId = recepcionTeam?.id ?? existing.customTeamId ?? null;
				existing.requiredQuantity = requiredQuantity;
				existing.isSufficient = computeIsSufficient(requiredQuantity, existing.currentQuantity);
				await repos.retreatInventory.save(existing);
				updated++;
			}
		}
	}

	// Eliminar las obsoletas (tipo borrado o talla quitada): retreatShirtTypeId
	// NOT NULL pero la combinación no está en `desired` y currentQuantity = 0.
	const existingShirtRows = await repos.retreatInventory.find({
		where: { retreatId },
	});
	let removed = 0;
	let skipped = 0;
	for (const row of existingShirtRows) {
		if (!row.retreatShirtTypeId || !row.shirtSize) continue;
		const key = `${row.retreatShirtTypeId}|${row.shirtSize}`;
		if (desired.has(key)) continue;
		if (Number(row.currentQuantity ?? 0) > 0) {
			console.warn(
				`[syncShirtItemsForRetreat] fila obsoleta con stock — no se borra: ${row.customName}`,
			);
			skipped++;
			continue;
		}
		await repos.retreatInventory.remove(row);
		removed++;
	}

	return { created, updated, removed, skipped };
};

/**
 * Lista items activos del catálogo que aún NO están en el inventario
 * del retiro. Útil para el modal "Agregar items".
 */
export const getAvailableItemsForRetreat = async (
	retreatId: string,
	dataSource?: DataSource,
) => {
	const repos = getRepositories(dataSource);
	const existing = await repos.retreatInventory.find({
		where: { retreatId },
		select: ['inventoryItemId'],
	});
	const existingIds = new Set(existing.map((r) => r.inventoryItemId));

	const items = await repos.inventoryItem.find({
		where: { isActive: true },
		relations: ['category', 'team'],
		order: { name: 'ASC' },
	});
	return items
		.filter((it) => !existingIds.has(it.id) && !it.isCalculated)
		.map((it) => ({
			id: it.id,
			name: it.name,
			description: it.description ?? '',
			categoryName: it.category?.name ?? '',
			teamName: it.team?.name ?? '',
			unit: it.unit,
			requiredQuantity: it.requiredQuantity,
			ratio: it.ratio,
		}));
};

/**
 * Agrega al inventario del retiro todos los ítems activos del catálogo
 * global que aún no estén incluidos. Ignora ítems calculados (camisetas).
 * Devuelve el número de ítems añadidos.
 */
export const syncMissingCatalogItems = async (
	retreatId: string,
	dataSource?: DataSource,
): Promise<{ added: number }> => {
	const repos = getRepositories(dataSource);
	const ds = dataSource || AppDataSource;

	const existing = await repos.retreatInventory.find({
		where: { retreatId },
		select: ['inventoryItemId'],
	});
	const existingIds = new Set(existing.map((r) => r.inventoryItemId).filter(Boolean));

	const catalogItems = await repos.inventoryItem.find({
		where: { isActive: true },
	});
	const missing = catalogItems.filter((it) => !it.isCalculated && !existingIds.has(it.id));

	if (missing.length === 0) return { added: 0 };

	const retreat = await ds.getRepository(Retreat).findOne({ where: { id: retreatId } });
	const walkerCount = await ds.getRepository(RetreatParticipant).count({
		where: { retreatId, type: 'walker', isCancelled: false },
	});
	const base = walkerCount > 0 ? walkerCount : (retreat?.max_walkers ?? 0);

	const newRows = missing.map((item) => {
		const hasFixedQty = item.requiredQuantity !== null && item.requiredQuantity !== undefined;
		const requiredQuantity = hasFixedQty
			? Number(item.requiredQuantity)
			: Math.ceil(Number(item.ratio) * base);
		return repos.retreatInventory.create({
			id: uuidv4(),
			retreatId,
			inventoryItemId: item.id,
			requiredQuantity,
			currentQuantity: 0,
			isSufficient: computeIsSufficient(requiredQuantity, 0),
			status: 'pending',
			requiredQtyOverride: hasFixedQty ? Number(item.requiredQuantity) : null,
		});
	});

	await repos.retreatInventory.save(newRows);
	return { added: newRows.length };
};

export const getRetreatInventoryHistory = async (
	retreatId: string,
	options: { limit?: number; itemId?: string } = {},
	dataSource?: DataSource,
) => {
	const repos = getRepositories(dataSource);
	const where: any = { retreatId };
	if (options.itemId) where.inventoryItemId = options.itemId;
	const rows = await repos.retreatInventoryHistory.find({
		where,
		order: { createdAt: 'DESC' },
		take: options.limit ?? 200,
	});

	// Enriquecemos con nombre del item.
	const itemIds = Array.from(new Set(rows.map((r) => r.inventoryItemId)));
	const items =
		itemIds.length > 0
			? await repos.inventoryItem.find({ where: itemIds.map((id) => ({ id })) })
			: [];
	const nameById = new Map(items.map((it) => [it.id, it.name]));

	return rows.map((r) => ({
		id: r.id,
		retreatInventoryId: r.retreatInventoryId,
		inventoryItemId: r.inventoryItemId,
		itemName: nameById.get(r.inventoryItemId) || '(item eliminado)',
		field: r.field,
		oldValue: r.oldValue ?? null,
		newValue: r.newValue ?? null,
		userId: r.userId ?? null,
		createdAt: r.createdAt,
	}));
};

export type CalcBase = 'actual' | 'expected';

/**
 * Devuelve el número de caminantes activos (no cancelados) del retiro.
 * Reutilizable desde el controller para mostrar el conteo en el diálogo
 * de confirmación del frontend antes de ejecutar el recálculo.
 */
export const getActualWalkerCount = async (
	retreatId: string,
	dataSource?: DataSource,
): Promise<number> => {
	const ds = dataSource || AppDataSource;
	return ds.getRepository(RetreatParticipant).count({
		where: { retreatId, type: 'walker', isCancelled: false },
	});
};

// Ratio Calculation Services
export const calculateRequiredQuantities = async (
	retreatId: string,
	dataSource?: DataSource,
	options?: { calcBase?: CalcBase },
) => {
	const repos = getRepositories(dataSource);

	// Resolver la base UNA vez para todos los items de ratio.
	// Usa RetreatParticipant (retreat_participants) donde type e isCancelled son columnas reales.
	const actualCount = await getActualWalkerCount(retreatId, dataSource);
	const retreat = await repos.retreat.findOne({
		where: { id: retreatId },
		select: ['id', 'max_walkers'],
	});
	const walkerBase =
		options?.calcBase === 'expected'
			? (retreat?.max_walkers ?? actualCount) // fallback a actuales si max_walkers no configurado
			: actualCount;

	// Get all retreat inventory items
	const inventories = await repos.retreatInventory.find({
		where: { retreatId },
		relations: ['inventoryItem'],
	});

	const ds = dataSource || AppDataSource;

	// Calculate required quantities and update
	const updatedInventories = await Promise.all(
		inventories.map(async (inventory) => {
			// Items excluidos de este retiro: mantener sin cambios.
			if (inventory.isExcluded) return inventory;

			let requiredQuantity: number;

			// Override fijo para este retiro: tiene prioridad sobre todo.
			if (
				inventory.requiredQtyOverride !== null &&
				inventory.requiredQtyOverride !== undefined
			) {
				inventory.requiredQuantity = Math.ceil(Number(inventory.requiredQtyOverride));
				inventory.isSufficient = computeIsSufficient(
					inventory.requiredQuantity,
					inventory.currentQuantity,
				);
				return inventory;
			}

			// Items vinculados a un RetreatShirtType + talla: contar
			// ParticipantShirtSize filtrando participantes cancelados.
			if (inventory.retreatShirtTypeId && inventory.shirtSize) {
				requiredQuantity = await ds
					.createQueryBuilder(ParticipantShirtSize, 'pss')
					.innerJoin(
						'retreat_participants',
						'rp',
						'rp.participantId = pss.participantId AND rp.retreatId = :retreatId AND rp.isCancelled = 0',
						{ retreatId },
					)
					.where('pss.shirtTypeId = :typeId', { typeId: inventory.retreatShirtTypeId })
					.andWhere('pss.size = :size', { size: inventory.shirtSize })
					.getCount();
				inventory.requiredQuantity = requiredQuantity;
				inventory.isSufficient = computeIsSufficient(requiredQuantity, inventory.currentQuantity);
				return inventory;
			}

			// Items ad-hoc (sin inventoryItem y sin shirtType): se mantiene su
			// requiredQuantity manual.
			if (!inventory.inventoryItem) {
				inventory.isSufficient = computeIsSufficient(
					inventory.requiredQuantity,
					inventory.currentQuantity,
				);
				return inventory;
			}

			// Handle t-shirt calculations
			if (
				inventory.inventoryItem.isCalculated &&
				inventory.inventoryItem.calculationType === 'tshirt'
			) {
				requiredQuantity = await calculateTshirtQuantity(
					retreatId,
					inventory.inventoryItem.tshirtSize,
					dataSource,
				);
			}
			// Handle blue t-shirt calculations
			else if (
				inventory.inventoryItem.isCalculated &&
				inventory.inventoryItem.calculationType === 'bluetshirt'
			) {
				requiredQuantity = await calculateBlueTshirtQuantity(
					retreatId,
					inventory.inventoryItem.tshirtSize,
					dataSource,
				);
			}
			// Handle jacket calculations
			else if (
				inventory.inventoryItem.isCalculated &&
				inventory.inventoryItem.calculationType === 'jacket'
			) {
				requiredQuantity = await calculateJacketQuantity(
					retreatId,
					inventory.inventoryItem.tshirtSize,
					dataSource,
				);
			}
			// Use fixed quantity if specified, otherwise calculate using ratio
			else if (
				inventory.inventoryItem.requiredQuantity !== null &&
				inventory.inventoryItem.requiredQuantity !== undefined
			) {
				requiredQuantity = inventory.inventoryItem.requiredQuantity;
			} else {
				// Ratio × walkerBase. ratioOverride tiene prioridad sobre el ratio global.
				const effectiveRatio =
					inventory.ratioOverride !== null && inventory.ratioOverride !== undefined
						? Number(inventory.ratioOverride)
						: inventory.inventoryItem.ratio;
				requiredQuantity = Math.ceil(effectiveRatio * walkerBase);
			}

			inventory.requiredQuantity = requiredQuantity;
			inventory.isSufficient = computeIsSufficient(requiredQuantity, inventory.currentQuantity);
			return inventory;
		}),
	);

	await repos.retreatInventory.save(updatedInventories);
	return updatedInventories;
};

// Helper function to calculate t-shirt quantities
const calculateTshirtQuantity = async (
	retreatId: string,
	tshirtSize: string | null | undefined,
	dataSource?: DataSource,
): Promise<number> => {
	const repos = getRepositories(dataSource);

	if (!tshirtSize) return 0;

	// Get count of walkers with this t-shirt size
	const walkerCount = await repos.participant.count({
		where: {
			retreatId,
			type: 'walker',
			tshirtSize: tshirtSize as any,
			isCancelled: false,
		},
	});

	// Get count of servers who need white shirts and have this t-shirt size
	const serverCount = await repos.participant.count({
		where: {
			retreatId,
			type: 'server',
			needsWhiteShirt: tshirtSize,
			isCancelled: false,
		},
	});

	return walkerCount + serverCount;
};

// Helper function to calculate blue t-shirt quantities
const calculateBlueTshirtQuantity = async (
	retreatId: string,
	tshirtSize: string | null | undefined,
	dataSource?: DataSource,
): Promise<number> => {
	const repos = getRepositories(dataSource);

	if (!tshirtSize) return 0;

	// Get count of servers who need blue shirts and have this specific blue shirt size
	const serverCount = await repos.participant.count({
		where: {
			retreatId,
			type: 'server',
			needsBlueShirt: tshirtSize,
			isCancelled: false,
		},
	});

	return serverCount;
};

// Helper function to calculate jacket quantities
const calculateJacketQuantity = async (
	retreatId: string,
	tshirtSize: string | null | undefined,
	dataSource?: DataSource,
): Promise<number> => {
	const repos = getRepositories(dataSource);

	if (!tshirtSize) return 0;

	// Get count of servers who need jackets and have this specific jacket size
	const serverCount = await repos.participant.count({
		where: {
			retreatId,
			type: 'server',
			needsJacket: tshirtSize,
			isCancelled: false,
		},
	});

	return serverCount;
};

export const getInventoryAlerts = async (retreatId: string, dataSource?: DataSource) => {
	const repos = getRepositories(dataSource);
	const candidates = await repos.retreatInventory.find({
		where: { retreatId },
		relations: ['inventoryItem', 'inventoryItem.category', 'inventoryItem.team'],
		order: { createdAt: 'ASC' },
	});

	// Filtra alertas reales: requiredQuantity > 0 y currentQuantity por debajo.
	// Items excluidos o con requiredQuantity = 0 no generan alerta.
	const alerts = candidates.filter((row) => {
		if (row.isExcluded) return false;
		const required = Number(row.requiredQuantity ?? 0);
		const current = Number(row.currentQuantity ?? 0);
		return required > 0 && current < required;
	});

	const nameOf = (a: RetreatInventory): string =>
		a.inventoryItem?.name || a.customName || '(sin nombre)';
	const sortedAlerts = alerts.sort((a, b) => nameOf(a).localeCompare(nameOf(b)));

	return sortedAlerts.map((alert) => ({
		id: alert.id,
		itemName: nameOf(alert),
		categoryName:
			alert.inventoryItem?.category?.name ||
			alert.customCategory?.name ||
			(alert.retreatShirtTypeId ? 'Camisetas' : 'Sin categoría'),
		teamName: alert.inventoryItem?.team?.name || '',
		requiredQuantity: alert.requiredQuantity,
		currentQuantity: alert.currentQuantity,
		deficit: Math.ceil(Number(alert.requiredQuantity ?? 0) - Number(alert.currentQuantity ?? 0)),
		unit: alert.inventoryItem?.unit || alert.customUnit || 'piezas',
		notes: alert.notes,
		boxLabel: alert.boxLabel,
	}));
};

// Default Inventory Creation
export const createDefaultInventoryForRetreat = async (
	retreat: Retreat,
	dataSource?: DataSource,
) => {
	const repos = getRepositories(dataSource);

	// Get all active inventory items
	const items = await repos.inventoryItem.find({ where: { isActive: true } });

	// Si el retiro aún no tiene caminantes inscritos, usa max_walkers
	// como base. Así las alertas tienen sentido desde el primer minuto.
	const ds = dataSource || AppDataSource;
	const walkerCount = await ds.getRepository(RetreatParticipant).count({
		where: {
			retreatId: retreat.id,
			type: 'walker',
			isCancelled: false,
		},
	});
	const base = walkerCount > 0 ? walkerCount : retreat.max_walkers ?? 0;

	// Create retreat inventory items
	const newInventories = items.map((item) => {
		let requiredQuantity: number;
		// Si el catálogo tiene cantidad fija, se propaga también a requiredQtyOverride
		// para que sea editable por retiro sin modificar el catálogo global.
		const hasFixedQty = item.requiredQuantity !== null && item.requiredQuantity !== undefined;

		if (hasFixedQty) {
			requiredQuantity = Number(item.requiredQuantity);
		} else {
			requiredQuantity = Math.ceil(Number(item.ratio) * base);
		}

		return repos.retreatInventory.create({
			id: uuidv4(),
			retreatId: retreat.id,
			inventoryItemId: item.id,
			requiredQuantity,
			currentQuantity: 0,
			isSufficient: computeIsSufficient(requiredQuantity, 0),
			status: 'pending',
			requiredQtyOverride: hasFixedQty ? Number(item.requiredQuantity) : null,
		});
	});

	await repos.retreatInventory.save(newInventories);
	return newInventories;
};

/**
 * Copia el inventario físico de un retiro a otro. Para cada item del
 * retiro fuente con `currentQuantity > 0` o `boxLabel` definido, se
 * asegura que exista la fila pivote en el retiro destino y se le
 * copia `currentQuantity`, `notes` y `boxLabel`. No pisa items del
 * destino con cantidades manuales ya cargadas, a menos que `overwrite
 * = true`.
 *
 * Útil para retiros recurrentes: "el coordinador toma el inventario
 * empacado del retiro anterior y lo arrastra al siguiente".
 */
export const copyInventoryFromRetreat = async (
	sourceRetreatId: string,
	targetRetreatId: string,
	options: { overwrite?: boolean } = {},
	dataSource?: DataSource,
) => {
	if (sourceRetreatId === targetRetreatId) {
		throw new Error('El retiro origen y destino no pueden ser el mismo.');
	}
	const repos = getRepositories(dataSource);

	const sourceRows = await repos.retreatInventory.find({
		where: { retreatId: sourceRetreatId },
		relations: ['inventoryItem'],
	});

	let copied = 0;
	let skipped = 0;
	let created = 0;

	for (const source of sourceRows) {
		const hasContent =
			Number(source.currentQuantity ?? 0) > 0 ||
			(source.boxLabel && source.boxLabel.trim() !== '') ||
			(source.notes && source.notes.trim() !== '') ||
			source.ratioOverride != null ||
			source.requiredQtyOverride != null ||
			source.isExcluded;
		if (!hasContent) continue;

		if (!source.inventoryItemId) continue; // ad-hoc o shirt-type: no se copia entre retiros
		const existing = await repos.retreatInventory.findOne({
			where: { retreatId: targetRetreatId, inventoryItemId: source.inventoryItemId },
		});

		if (existing) {
			const hasManualEntry =
				Number(existing.currentQuantity ?? 0) > 0 ||
				(existing.notes && existing.notes.trim() !== '') ||
				(existing.boxLabel && existing.boxLabel.trim() !== '');
			if (hasManualEntry && !options.overwrite) {
				skipped++;
				continue;
			}
			existing.currentQuantity = Number(source.currentQuantity ?? 0);
			existing.notes = source.notes ?? undefined;
			existing.boxLabel = source.boxLabel ?? undefined;
			existing.ratioOverride = source.ratioOverride ?? null;
			existing.requiredQtyOverride = source.requiredQtyOverride ?? null;
			existing.isExcluded = source.isExcluded ?? false;
			existing.isSufficient = computeIsSufficient(
				existing.requiredQuantity,
				existing.currentQuantity,
			);
			await repos.retreatInventory.save(existing);
			copied++;
		} else {
			// El item del catálogo aún no está como pivote en el destino → crear.
			const created_row = repos.retreatInventory.create({
				id: uuidv4(),
				retreatId: targetRetreatId,
				inventoryItemId: source.inventoryItemId,
				requiredQuantity: 0,
				currentQuantity: Number(source.currentQuantity ?? 0),
				isSufficient: computeIsSufficient(0, Number(source.currentQuantity ?? 0)),
				notes: source.notes ?? undefined,
				boxLabel: source.boxLabel ?? undefined,
				ratioOverride: source.ratioOverride ?? null,
				requiredQtyOverride: source.requiredQtyOverride ?? null,
				isExcluded: source.isExcluded ?? false,
			});
			await repos.retreatInventory.save(created_row);
			created++;
		}
	}

	return { copied, created, skipped };
};

// Import/Export Services
export const exportInventoryToExcel = async (retreatId: string, dataSource?: DataSource) => {
	const inventories = await getRetreatInventory(retreatId, dataSource);

	const exportData = inventories.map((inventory) => ({
		Artículo: inventory.inventoryItem?.name || inventory.customName || '',
		Descripción: inventory.inventoryItem?.description || '',
		Categoría:
			inventory.inventoryItem?.category?.name ||
			inventory.customCategory?.name ||
			(inventory.retreatShirtTypeId ? 'Camisetas' : ''),
		Equipo: inventory.inventoryItem?.team?.name || '',
		'Ratio por Caminante': inventory.inventoryItem?.ratio ?? '',
		'Cantidad Fija': inventory.inventoryItem?.requiredQuantity || '',
		Unidad: inventory.inventoryItem?.unit || inventory.customUnit || 'piezas',
		'Cantidad Requerida': inventory.requiredQuantity,
		'Cantidad Actual': inventory.currentQuantity,
		'Estado Suficiente': inventory.isSufficient ? 'Sí' : 'No',
		Caja: inventory.boxLabel || '',
		Estado: inventory.status || 'pending',
		Notas: inventory.notes || '',
	}));

	return exportData;
};

export const importInventoryFromExcel = async (
	retreatId: string,
	excelData: any[],
	dataSource?: DataSource,
) => {
	const repos = getRepositories(dataSource);

	const results = {
		success: [],
		errors: [],
	} as { success: any[]; errors: any[] };

	for (const row of excelData) {
		try {
			// Find inventory item by name
			const item = await repos.inventoryItem.findOne({
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
			let retreatInventory = await repos.retreatInventory.findOne({
				where: { retreatId, inventoryItemId: item.id },
			});

			const newCurrent = Math.max(0, Number(row['Cantidad Actual'] || 0));
			const importedRequired = Number(row['Cantidad Requerida'] || 0);
			const importedNotes = row['Notas'] || '';
			const importedBox = row['Caja'] || '';

			if (!retreatInventory) {
				retreatInventory = repos.retreatInventory.create({
					id: uuidv4(),
					retreatId,
					inventoryItemId: item.id,
					requiredQuantity: importedRequired,
					currentQuantity: newCurrent,
					isSufficient: computeIsSufficient(importedRequired, newCurrent),
					notes: importedNotes,
					boxLabel: importedBox || undefined,
				});
			} else {
				retreatInventory.currentQuantity = newCurrent;
				retreatInventory.notes = importedNotes;
				if (importedBox) retreatInventory.boxLabel = importedBox;
				retreatInventory.isSufficient = computeIsSufficient(
					retreatInventory.requiredQuantity,
					newCurrent,
				);
			}

			await repos.retreatInventory.save(retreatInventory);
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
