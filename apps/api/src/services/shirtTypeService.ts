import { AppDataSource } from '../data-source';
import { RetreatShirtType } from '../entities/retreatShirtType.entity';

const repo = () => AppDataSource.getRepository(RetreatShirtType);

export const MEXICAN_DEFAULT_SIZES = ['S', 'M', 'G', 'X', '2'];

export type ShirtTypeInput = {
	name: string;
	color?: string | null;
	requiredForWalkers?: boolean;
	optionalForServers?: boolean;
	sortOrder?: number;
	availableSizes?: string[] | null;
};

const normalizeSizes = (sizes: string[] | null | undefined): string[] | null => {
	if (sizes === undefined) return [...MEXICAN_DEFAULT_SIZES];
	if (sizes === null) return null;
	const cleaned = sizes
		.map((s) => (typeof s === 'string' ? s.trim() : ''))
		.filter((s) => s.length > 0);
	return cleaned.length > 0 ? cleaned : null;
};

export const listShirtTypes = async (retreatId: string) => {
	return repo().find({
		where: { retreatId },
		order: { sortOrder: 'ASC', createdAt: 'ASC' },
	});
};

export const createShirtType = async (retreatId: string, data: ShirtTypeInput) => {
	const entity = repo().create({
		retreatId,
		name: data.name,
		color: data.color ?? null,
		requiredForWalkers: data.requiredForWalkers ?? false,
		optionalForServers: data.optionalForServers ?? true,
		sortOrder: data.sortOrder ?? 0,
		availableSizes: normalizeSizes(data.availableSizes),
	});
	return repo().save(entity);
};

export const updateShirtType = async (id: string, data: Partial<ShirtTypeInput>) => {
	const existing = await repo().findOne({ where: { id } });
	if (!existing) return null;
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

	if (Object.keys(updates).length > 0) {
		await repo().update({ id }, updates);
	}
	return repo().findOne({ where: { id } });
};

export const deleteShirtType = async (id: string) => {
	const result = await repo().delete({ id });
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
