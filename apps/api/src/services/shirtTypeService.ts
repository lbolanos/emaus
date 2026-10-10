import { EntityManager } from 'typeorm';
import { AppDataSource } from '../data-source';
import { RetreatShirtType } from '../entities/retreatShirtType.entity';
import { RetreatShirtTypeSizePrice } from '../entities/retreatShirtTypeSizePrice.entity';
import { domainAuditService } from './domainAuditService';

const repo = () => AppDataSource.getRepository(RetreatShirtType);

// `availableSizes` (array) va como metadata `sizes`; los overrides de precio
// por talla, como conteo — el detalle vive en la fila del tipo.
const SHIRT_AUDIT_FIELDS = [
	'name',
	'color',
	'requiredForWalkers',
	'optionalForServers',
	'sortOrder',
	'price',
];

const sizePriceCount = (shirtTypeId: string) =>
	AppDataSource.getRepository(RetreatShirtTypeSizePrice).count({
		where: { shirtTypeId },
	});

/**
 * Sincroniza el inventario del retiro con los tipos de playera actuales.
 * Lazy import para evitar ciclos entre shirtTypeService ↔ inventoryService.
 * Si la sincronización falla, log warning y continúa (no rompe la op CRUD).
 * NO se audita: consecuencia derivada del CRUD del tipo de playera que la
 * disparó (el evento raíz ya quedó registrado).
 */
const syncInventoryShirts = async (retreatId: string): Promise<void> => {
	try {
		const inv = await import('./inventoryService');
		await inv.syncShirtItemsForRetreat(retreatId);
	} catch (e) {
		console.warn('[shirtTypeService] no se pudo sincronizar inventario:', e);
	}
};

export const MEXICAN_DEFAULT_SIZES = ['S', 'M', 'G', 'X', '2'];

/**
 * Normaliza un precio de entrada: negativo, no-numérico o infinito → NULL
 * (equivale a "sin cargo"); positivo → redondeado a centavos. El controller
 * no envuelve estas funciones en try/catch, así que rechazar con throw no
 * llegaría al cliente como 400 — clampear es la opción segura que no
 * depende de eso.
 */
const normalizePrice = (price: number | null | undefined): number | null => {
	if (price == null) return null;
	const n = Number(price);
	if (!Number.isFinite(n) || n <= 0) return null;
	return Math.round(n * 100) / 100;
};

export type ShirtTypeInput = {
	name: string;
	color?: string | null;
	requiredForWalkers?: boolean;
	optionalForServers?: boolean;
	sortOrder?: number;
	availableSizes?: string[] | null;
	/** Precio de la prenda para el servidor que la pide. NULL = sin cargo. */
	price?: number | null;
	/**
	 * Per-size price overrides. Array (not a record) so numeric-like sizes
	 * such as '2' keep their order and don't hit JS key-reordering quirks.
	 * Semantics: undefined in PATCH = leave untouched; []/null = delete all;
	 * entries with null/<=0/non-finite price are dropped (= "use the base").
	 */
	sizePrices?: Array<{ size: string; price: number | null }> | null;
};

const normalizeSizes = (sizes: string[] | null | undefined): string[] | null => {
	if (sizes === undefined) return [...MEXICAN_DEFAULT_SIZES];
	if (sizes === null) return null;
	const cleaned = sizes
		.map((s) => (typeof s === 'string' ? s.trim() : ''))
		.filter((s) => s.length > 0);
	return cleaned.length > 0 ? cleaned : null;
};

/**
 * Normalizes per-size price overrides: trimmed sizes (empty ones dropped),
 * price clamped like the base one (null/<=0/non-finite = "use the base", so
 * no row), and deduped per size (last entry wins).
 */
const normalizeSizePrices = (
	input: Array<{ size: string; price: number | null }> | null | undefined,
): Array<{ size: string; price: number }> => {
	if (!input) return [];
	const bySize = new Map<string, number>();
	for (const entry of input) {
		const size = typeof entry?.size === 'string' ? entry.size.trim() : '';
		if (!size) continue;
		const price = normalizePrice(entry?.price);
		if (price == null) continue;
		bySize.set(size, price);
	}
	return [...bySize].map(([size, price]) => ({ size, price }));
};

const saveSizePrices = async (
	entityManager: EntityManager,
	shirtTypeId: string,
	sizePrices: Array<{ size: string; price: number }>,
) => {
	const priceRepo = entityManager.getRepository(RetreatShirtTypeSizePrice);
	if (sizePrices.length > 0) {
		await priceRepo.save(
			sizePrices.map((sp) =>
				priceRepo.create({
					shirtTypeId,
					size: sp.size,
					price: sp.price,
				}),
			),
		);
	}
};

export const listShirtTypes = async (retreatId: string) => {
	// relations feeds BOTH the admin view and the public registration endpoint
	// (retreatController.getRetreatBy*Public calls this same service).
	return repo().find({
		where: { retreatId },
		order: { sortOrder: 'ASC', createdAt: 'ASC' },
		relations: ['sizePrices'],
	});
};

export const createShirtType = async (retreatId: string, data: ShirtTypeInput) => {
	const sizePrices = normalizeSizePrices(data.sizePrices);
	const savedType = await AppDataSource.transaction(async (em) => {
		const typeRepo = em.getRepository(RetreatShirtType);
		const entity = typeRepo.create({
			retreatId,
			name: data.name,
			color: data.color ?? null,
			requiredForWalkers: data.requiredForWalkers ?? false,
			optionalForServers: data.optionalForServers ?? true,
			sortOrder: data.sortOrder ?? 0,
			availableSizes: normalizeSizes(data.availableSizes),
			price: normalizePrice(data.price),
		});
		const saved = await typeRepo.save(entity);
		await saveSizePrices(em, saved.id, sizePrices);
		return saved;
	});
	await syncInventoryShirts(retreatId);
	// Re-fetch with overrides so the response carries them.
	const created = await repo().findOne({
		where: { id: savedType.id },
		relations: ['sizePrices'],
	});
	// Log DESPUÉS de cerrar la transacción (riesgo §25.3): fire-and-forget
	// dentro de la ventana transaccional revienta el commit con better-sqlite3.
	if (created) {
		void domainAuditService.logCreate('shirt_type', created.id, created, {
			retreatId,
			fields: SHIRT_AUDIT_FIELDS,
			metadata: {
				sizes: created.availableSizes ?? [],
				sizePrices: created.sizePrices?.length ?? 0,
			},
		});
	}
	return created;
};

export const updateShirtType = async (id: string, data: Partial<ShirtTypeInput>) => {
	const existing = await repo().findOne({ where: { id } });
	if (!existing) return null;
	const pricesBefore = 'sizePrices' in data ? await sizePriceCount(id) : null;
	// Build a clean updates object — only the fields the client actually sent.
	// Avoids TypeORM change-detection issues with simple-json columns when entire
	// entity is round-tripped (createdAt/updatedAt strings, etc).
	const updates: Record<string, any> = {};
	if ('name' in data) updates.name = data.name;
	if ('color' in data) updates.color = data.color ?? null;
	if ('requiredForWalkers' in data) updates.requiredForWalkers = !!data.requiredForWalkers;
	if ('optionalForServers' in data) updates.optionalForServers = !!data.optionalForServers;
	if ('sortOrder' in data) updates.sortOrder = data.sortOrder ?? 0;
	if ('availableSizes' in data) updates.availableSizes = normalizeSizes(data.availableSizes);
	// NULL limpia el precio (sin cargo); negativo/no-numérico también cae a null.
	if ('price' in data) updates.price = normalizePrice(data.price);

	if (Object.keys(updates).length > 0) {
		await repo().update({ id }, updates);
	}
	// Full replace when the client sent the array at all ('sizePrices' in data,
	// same convention as 'price'): delete every override, insert the new set.
	if ('sizePrices' in data) {
		const sizePrices = normalizeSizePrices(data.sizePrices);
		await AppDataSource.transaction(async (em) => {
			await em.getRepository(RetreatShirtTypeSizePrice).delete({ shirtTypeId: id });
			await saveSizePrices(em, id, sizePrices);
		});
	}
	const updated = await repo().findOne({ where: { id }, relations: ['sizePrices'] });
	if (updated) {
		// La sync corre ANTES de disparar el log (riesgo §25.3): el INSERT
		// fire-and-forget podía aterrizar dentro de una ventana transaccional
		// de la sync y el catch-all de ésta se lo tragaba — inventario
		// desincronizado en silencio.
		await syncInventoryShirts(updated.retreatId);
		void domainAuditService.logUpdate('shirt_type', id, existing, updated, {
			retreatId: updated.retreatId,
			fields: SHIRT_AUDIT_FIELDS,
			metadata: {
				sizes: updated.availableSizes ?? [],
				...(pricesBefore !== null
					? { sizePricesBefore: pricesBefore, sizePricesAfter: updated.sizePrices?.length ?? 0 }
					: {}),
			},
		});
	}
	return updated;
};

export const deleteShirtType = async (id: string) => {
	const target = await repo().findOne({ where: { id } });
	// Contado ANTES: el delete explícito de abajo ya se llevó las filas.
	const pricesBefore = target ? await sizePriceCount(id) : 0;
	// Explicit delete of overrides before the type: defends environments where
	// SQLite FK enforcement is off and CASCADE would not fire.
	await AppDataSource.getRepository(RetreatShirtTypeSizePrice).delete({ shirtTypeId: id });
	const result = await repo().delete({ id });
	if (target) {
		// La sync va primero, el log después — mismo orden §25.3 que el update.
		await syncInventoryShirts(target.retreatId);
		void domainAuditService.logDelete('shirt_type', id, target, {
			retreatId: target.retreatId,
			fields: SHIRT_AUDIT_FIELDS,
			metadata: {
				sizes: target.availableSizes ?? [],
				sizePrices: pricesBefore,
			},
		});
	}
	return (result.affected ?? 0) > 0;
};

/**
 * Returns true when `size` is acceptable for the given shirt type.
 * Backward-compat: if the type has no `availableSizes` configured, all sizes pass.
 */
export const validateSizesAgainstType = async (
	shirtTypeId: string,
	size: string,
): Promise<boolean> => {
	const type = await repo().findOne({ where: { id: shirtTypeId } });
	if (!type) return false;
	const allowed = type.availableSizes;
	if (!allowed || allowed.length === 0) return true;
	return allowed.includes(size);
};

// Default Mexican style shirt types seeded for new retreats.
// NO se audita: es semilla automática al crear el retiro — la traza vive en
// retreat.create (igual que las responsabilidades y equipos por defecto).
const MEXICAN_DEFAULT_SHIRTS: ShirtTypeInput[] = [
	{ name: 'Blanca con rosa', color: 'white', sortOrder: 1 },
	{ name: 'Blanca Emaus', color: 'white', sortOrder: 2 },
	{ name: 'Azul', color: 'blue', sortOrder: 3 },
	{ name: 'Chamarra', color: null, sortOrder: 4 },
];

export const seedDefaultShirtTypes = async (retreatId: string) => {
	const existing = await repo().count({ where: { retreatId } });
	if (existing > 0) return;
	const rows = MEXICAN_DEFAULT_SHIRTS.map((s) =>
		repo().create({
			retreatId,
			name: s.name,
			color: s.color ?? null,
			requiredForWalkers: false,
			optionalForServers: true,
			sortOrder: s.sortOrder ?? 0,
			availableSizes: [...MEXICAN_DEFAULT_SIZES],
		}),
	);
	await repo().save(rows);
};
