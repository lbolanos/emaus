/**
 * Tests for the per-retreat shirt types system.
 *
 * Covers:
 *  - CRUD operations on `retreat_shirt_type` (list/create/update/delete)
 *  - Default Mexican-style seeding ("Blanca con rosa", "Blanca Emaus", "Azul", "Chamarra")
 *  - `optionalForServers` / `requiredForWalkers` flags
 *  - Idempotency of `seedDefaultShirtTypes` (won't double-seed)
 */

import { setupTestDatabase, teardownTestDatabase, clearTestData } from '../test-setup';
import { TestDataFactory } from '../test-utils/testDataFactory';
import { Retreat } from '@/entities/retreat.entity';
import { House } from '@/entities/house.entity';
import { RetreatShirtType } from '@/entities/retreatShirtType.entity';
import { v4 as uuidv4 } from 'uuid';

import {
	listShirtTypes,
	createShirtType,
	updateShirtType,
	deleteShirtType,
	seedDefaultShirtTypes,
	validateSizesAgainstType,
	MEXICAN_DEFAULT_SIZES,
} from '@/services/shirtTypeService';

const getDS = () => TestDataFactory['testDataSource'];

async function makeRetreat(): Promise<string> {
	const ds = getDS();
	const houseRepo = ds.getRepository(House);
	const retreatRepo = ds.getRepository(Retreat);

	const house = houseRepo.create({
		id: uuidv4(),
		name: 'Test House',
		address1: '1',
		city: 'CDMX',
		state: 'CDMX',
		zipCode: '00000',
		country: 'MX',
		capacity: 30,
	} as any);
	await houseRepo.save(house);

	const retreat = retreatRepo.create({
		id: uuidv4(),
		parish: 'Test Parish',
		startDate: new Date('2030-01-01'),
		endDate: new Date('2030-01-03'),
		houseId: (house as any).id,
		isPublic: true,
	} as any);
	await retreatRepo.save(retreat);
	return (retreat as any).id;
}

describe('Shirt Type Service', () => {
	beforeAll(async () => {
		await setupTestDatabase();
	});

	afterAll(async () => {
		await teardownTestDatabase();
	});

	beforeEach(async () => {
		await clearTestData();
	});

	describe('seedDefaultShirtTypes', () => {
		it('seeds the four Mexican-style defaults in the correct order', async () => {
			const retreatId = await makeRetreat();
			await seedDefaultShirtTypes(retreatId);

			const types = await listShirtTypes(retreatId);
			expect(types).toHaveLength(4);
			expect(types.map((t) => t.name)).toEqual([
				'Blanca con rosa',
				'Blanca Emaus',
				'Azul',
				'Chamarra',
			]);
			expect(types.map((t) => t.sortOrder)).toEqual([1, 2, 3, 4]);
		});

		it('marks defaults as optional for servers and not required for walkers', async () => {
			const retreatId = await makeRetreat();
			await seedDefaultShirtTypes(retreatId);

			const types = await listShirtTypes(retreatId);
			for (const t of types) {
				expect(t.optionalForServers).toBe(true);
				expect(t.requiredForWalkers).toBe(false);
			}
		});

		it('seeds Mexican size list as availableSizes on every default', async () => {
			const retreatId = await makeRetreat();
			await seedDefaultShirtTypes(retreatId);

			const types = await listShirtTypes(retreatId);
			for (const t of types) {
				expect(t.availableSizes).toEqual(MEXICAN_DEFAULT_SIZES);
			}
		});

		it('is idempotent — does not duplicate when called twice', async () => {
			const retreatId = await makeRetreat();
			await seedDefaultShirtTypes(retreatId);
			await seedDefaultShirtTypes(retreatId);

			const types = await listShirtTypes(retreatId);
			expect(types).toHaveLength(4);
		});
	});

	describe('createShirtType', () => {
		it('creates a custom shirt type for a retreat', async () => {
			const retreatId = await makeRetreat();
			const created = await createShirtType(retreatId, {
				name: 'Roja',
				color: 'red',
				requiredForWalkers: false,
				optionalForServers: true,
				sortOrder: 5,
			});

			expect(created.id).toBeTruthy();
			expect(created.name).toBe('Roja');
			expect(created.retreatId).toBe(retreatId);
		});

		it('applies sensible defaults for missing fields', async () => {
			const retreatId = await makeRetreat();
			const created = await createShirtType(retreatId, { name: 'Verde' });

			expect(created.optionalForServers).toBe(true);
			expect(created.requiredForWalkers).toBe(false);
			expect(created.sortOrder).toBe(0);
		});

		it('falls back to Mexican sizes when availableSizes is omitted', async () => {
			const retreatId = await makeRetreat();
			const created = await createShirtType(retreatId, { name: 'Sin tallas' });
			expect(created.availableSizes).toEqual(MEXICAN_DEFAULT_SIZES);
		});

		it('accepts and persists a custom availableSizes list (Colombia)', async () => {
			const retreatId = await makeRetreat();
			const created = await createShirtType(retreatId, {
				name: 'Roja',
				availableSizes: ['XS', 'S', 'M', 'L', 'XL', 'XXL'],
			});
			expect(created.availableSizes).toEqual(['XS', 'S', 'M', 'L', 'XL', 'XXL']);
		});

		it('trims and drops empty strings in availableSizes', async () => {
			const retreatId = await makeRetreat();
			const created = await createShirtType(retreatId, {
				name: 'Trim test',
				availableSizes: [' S ', '', ' M ', '  '],
			});
			expect(created.availableSizes).toEqual(['S', 'M']);
		});
	});

	describe('listShirtTypes', () => {
		it('returns shirts only for the requested retreat, ordered by sortOrder', async () => {
			const retreatA = await makeRetreat();
			const retreatB = await makeRetreat();

			await createShirtType(retreatA, { name: 'A2', sortOrder: 2 });
			await createShirtType(retreatA, { name: 'A1', sortOrder: 1 });
			await createShirtType(retreatB, { name: 'B1', sortOrder: 1 });

			const a = await listShirtTypes(retreatA);
			const b = await listShirtTypes(retreatB);

			expect(a.map((t) => t.name)).toEqual(['A1', 'A2']);
			expect(b.map((t) => t.name)).toEqual(['B1']);
		});

		it('returns empty array for retreats with no shirt types', async () => {
			const retreatId = await makeRetreat();
			const types = await listShirtTypes(retreatId);
			expect(types).toEqual([]);
		});
	});

	describe('updateShirtType', () => {
		it('updates name, color, and flags', async () => {
			const retreatId = await makeRetreat();
			const created = await createShirtType(retreatId, { name: 'Old' });

			const updated = await updateShirtType(created.id, {
				name: 'New',
				color: 'navy',
				requiredForWalkers: true,
			});

			expect(updated).not.toBeNull();
			expect(updated!.name).toBe('New');
			expect(updated!.color).toBe('navy');
			expect(updated!.requiredForWalkers).toBe(true);
		});

		it('returns null when shirt type does not exist', async () => {
			const result = await updateShirtType(uuidv4(), { name: 'X' });
			expect(result).toBeNull();
		});

		it('updates availableSizes', async () => {
			const retreatId = await makeRetreat();
			const created = await createShirtType(retreatId, { name: 'X' });
			const updated = await updateShirtType(created.id, {
				availableSizes: ['S', 'M', 'L', 'XL'],
			});
			expect(updated!.availableSizes).toEqual(['S', 'M', 'L', 'XL']);
		});

		it('persists availableSizes to DB across reload', async () => {
			const retreatId = await makeRetreat();
			const created = await createShirtType(retreatId, {
				name: 'X',
				availableSizes: ['S', 'M', 'G', 'X', '2'],
			});
			await updateShirtType(created.id, {
				availableSizes: ['S', 'M', 'L', 'XL', 'XXL'],
			});
			// Re-fetch from DB (different repo instance) to confirm persistence.
			const reloaded = await listShirtTypes(retreatId);
			const found = reloaded.find((t) => t.id === created.id);
			expect(found?.availableSizes).toEqual(['S', 'M', 'L', 'XL', 'XXL']);
		});
	});

	describe('validateSizesAgainstType', () => {
		it('accepts a size present in availableSizes', async () => {
			const retreatId = await makeRetreat();
			const t = await createShirtType(retreatId, {
				name: 'Test',
				availableSizes: ['S', 'M', 'L'],
			});
			expect(await validateSizesAgainstType(t.id, 'M')).toBe(true);
		});

		it('rejects a size not in availableSizes', async () => {
			const retreatId = await makeRetreat();
			const t = await createShirtType(retreatId, {
				name: 'Test',
				availableSizes: ['S', 'M', 'L'],
			});
			expect(await validateSizesAgainstType(t.id, 'XXL')).toBe(false);
		});

		it('accepts any size when availableSizes is null (backward compat)', async () => {
			const retreatId = await makeRetreat();
			const t = await createShirtType(retreatId, {
				name: 'Test',
				availableSizes: null,
			});
			expect(await validateSizesAgainstType(t.id, 'WHATEVER')).toBe(true);
		});

		it('returns false when shirt type does not exist', async () => {
			expect(await validateSizesAgainstType(uuidv4(), 'M')).toBe(false);
		});
	});

	describe('deleteShirtType', () => {
		it('deletes an existing shirt type', async () => {
			const retreatId = await makeRetreat();
			const created = await createShirtType(retreatId, { name: 'ToDelete' });

			const ok = await deleteShirtType(created.id);
			expect(ok).toBe(true);

			const remaining = await listShirtTypes(retreatId);
			expect(remaining).toHaveLength(0);
		});

		it('returns false when shirt type does not exist', async () => {
			const ok = await deleteShirtType(uuidv4());
			expect(ok).toBe(false);
		});
	});
});
