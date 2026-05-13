import { setupTestDatabase, teardownTestDatabase, clearTestData } from '../test-setup';
import { TestDataFactory } from '../test-utils/testDataFactory';
import { Retreat } from '@/entities/retreat.entity';
import { InventoryItem } from '@/entities/inventoryItem.entity';
import { InventoryCategory } from '@/entities/inventoryCategory.entity';
import { RetreatInventory } from '@/entities/retreatInventory.entity';
import { RetreatInventoryHistory } from '@/entities/retreatInventoryHistory.entity';
import { RetreatShirtType } from '@/entities/retreatShirtType.entity';
import { ParticipantShirtSize } from '@/entities/participantShirtSize.entity';
import {
	computeIsSufficient,
	updateRetreatInventory,
	bulkUpdateRetreatInventory,
	copyInventoryFromRetreat,
	getInventoryAlerts,
	getRetreatInventoryHistory,
	addCustomItemToRetreat,
	syncShirtItemsForRetreat,
	removeItemFromRetreat,
	bulkRemoveItemsFromRetreat,
	addItemToRetreat,
	getAvailableItemsForRetreat,
	getRetreatInventoryByCategory,
	calculateRequiredQuantities,
	getActualWalkerCount,
	getRetreatInventory,
	syncMissingCatalogItems,
} from '@/services/inventoryService';

/**
 * Tests para el módulo de inventario. Cubren:
 * - `computeIsSufficient` (helper puro): caso required=0, valores
 *   parsed como string (TypeORM/SQLite decimal), negativos.
 * - `updateRetreatInventory`: validación de `currentQuantity >= 0`,
 *   actualización de `boxLabel`, `status`, y registro en audit log.
 * - `bulkUpdateRetreatInventory`: aplica patch a varios items a la
 *   vez y reporta {updated, notFound}.
 * - `copyInventoryFromRetreat`: copia items con cantidad/notas/caja
 *   y respeta items con datos manuales (no pisa sin `overwrite`).
 * - `getInventoryAlerts`: NO devuelve items con required=0.
 * - `getRetreatInventoryHistory`: devuelve el log enriquecido.
 *
 * Nota: estos tests pasan el `testDataSource` a través de
 * `TestDataFactory['testDataSource']` y a las funciones del service
 * para aislar la BD de prueba.
 */
describe('Inventory Service', () => {
	const getTestDS = () => TestDataFactory['testDataSource'];

	beforeAll(async () => {
		await setupTestDatabase();
	});

	afterAll(async () => {
		await teardownTestDatabase();
	});

	beforeEach(async () => {
		await clearTestData();
	});

	describe('computeIsSufficient', () => {
		it('returns true when requiredQuantity is 0 or undefined (no es necesario nada)', () => {
			expect(computeIsSufficient(0, 0)).toBe(true);
			expect(computeIsSufficient(0, 5)).toBe(true);
			expect(computeIsSufficient(null, 0)).toBe(true);
			expect(computeIsSufficient(undefined, 0)).toBe(true);
		});

		it('returns true when current >= required', () => {
			expect(computeIsSufficient(5, 5)).toBe(true);
			expect(computeIsSufficient(5, 10)).toBe(true);
		});

		it('returns false when current < required', () => {
			expect(computeIsSufficient(10, 5)).toBe(false);
			expect(computeIsSufficient(10, 0)).toBe(false);
		});

		it('parses string inputs (TypeORM SQLite decimal columns)', () => {
			expect(computeIsSufficient('10' as any, '10' as any)).toBe(true);
			expect(computeIsSufficient('10' as any, '5' as any)).toBe(false);
			expect(computeIsSufficient('0' as any, '0' as any)).toBe(true);
		});

		it('treats negative required as suficiente (no rompe)', () => {
			expect(computeIsSufficient(-5, 0)).toBe(true);
		});
	});

	describe('updateRetreatInventory', () => {
		let env: Awaited<ReturnType<typeof TestDataFactory.createCompleteTestEnvironment>>;

		beforeEach(async () => {
			env = await TestDataFactory.createCompleteTestEnvironment();
		});

		it('rejects negative currentQuantity', async () => {
			const item = env.retreatInventory[0];
			await expect(
				updateRetreatInventory(
					env.retreat.id,
					item.inventoryItemId,
					{ currentQuantity: -5 },
					getTestDS(),
				),
			).rejects.toThrow(/currentQuantity/);
		});

		it('updates boxLabel and persists', async () => {
			const item = env.retreatInventory[0];
			const updated = await updateRetreatInventory(
				env.retreat.id,
				item.inventoryItemId,
				{ boxLabel: 'Caja 1' },
				getTestDS(),
			);
			expect(updated?.boxLabel).toBe('Caja 1');
		});

		it('updates status and persists', async () => {
			const item = env.retreatInventory[0];
			const updated = await updateRetreatInventory(
				env.retreat.id,
				item.inventoryItemId,
				{ status: 'packed' },
				getTestDS(),
			);
			expect(updated?.status).toBe('packed');
		});

		it('rejects invalid status', async () => {
			const item = env.retreatInventory[0];
			await expect(
				updateRetreatInventory(
					env.retreat.id,
					item.inventoryItemId,
					{ status: 'unknown' as any },
					getTestDS(),
				),
			).rejects.toThrow(/status inválido/);
		});

		it('writes audit log entries on change', async () => {
			const item = env.retreatInventory[0];
			await updateRetreatInventory(
				env.retreat.id,
				item.inventoryItemId,
				{ boxLabel: 'Caja 1', status: 'packed' },
				getTestDS(),
				env.user.id,
			);
			const history = await getTestDS()
				.getRepository(RetreatInventoryHistory)
				.find({ where: { retreatId: env.retreat.id } });
			expect(history.length).toBeGreaterThanOrEqual(2);
			const fields = history.map((h) => h.field);
			expect(fields).toEqual(expect.arrayContaining(['boxLabel', 'status']));
			expect(history[0].userId).toBe(env.user.id);
		});

		it('does NOT write audit log when value is unchanged', async () => {
			const item = env.retreatInventory[0];
			// set once
			await updateRetreatInventory(
				env.retreat.id,
				item.inventoryItemId,
				{ boxLabel: 'Caja 1' },
				getTestDS(),
				env.user.id,
			);
			const before = await getTestDS()
				.getRepository(RetreatInventoryHistory)
				.count({ where: { retreatId: env.retreat.id, field: 'boxLabel' } });
			// set again to same value
			await updateRetreatInventory(
				env.retreat.id,
				item.inventoryItemId,
				{ boxLabel: 'Caja 1' },
				getTestDS(),
				env.user.id,
			);
			const after = await getTestDS()
				.getRepository(RetreatInventoryHistory)
				.count({ where: { retreatId: env.retreat.id, field: 'boxLabel' } });
			expect(after).toBe(before);
		});

		it('recalculates isSufficient on currentQuantity change', async () => {
			const item = env.retreatInventory[0];
			// set required = 10 and current = 5 → not sufficient
			await getTestDS()
				.getRepository(RetreatInventory)
				.update(item.id, { requiredQuantity: 10, currentQuantity: 5, isSufficient: false });

			const updated = await updateRetreatInventory(
				env.retreat.id,
				item.inventoryItemId,
				{ currentQuantity: 10 },
				getTestDS(),
			);
			expect(updated?.isSufficient).toBe(true);
		});
	});

	describe('bulkUpdateRetreatInventory', () => {
		let env: Awaited<ReturnType<typeof TestDataFactory.createCompleteTestEnvironment>>;

		beforeEach(async () => {
			env = await TestDataFactory.createCompleteTestEnvironment();
		});

		it('applies boxLabel to multiple items at once', async () => {
			const itemIds = env.retreatInventory.slice(0, 3).map((r) => r.inventoryItemId);
			const result = await bulkUpdateRetreatInventory(
				env.retreat.id,
				itemIds,
				{ boxLabel: 'Caja BULK' },
				getTestDS(),
				env.user.id,
			);
			expect(result).toEqual({ updated: 3, notFound: 0 });

			const rows = await getTestDS()
				.getRepository(RetreatInventory)
				.find({ where: { retreatId: env.retreat.id, boxLabel: 'Caja BULK' } });
			expect(rows.length).toBe(3);
		});

		it('reports notFound for itemIds without pivot row', async () => {
			const result = await bulkUpdateRetreatInventory(
				env.retreat.id,
				['00000000-0000-0000-0000-000000000000'],
				{ status: 'packed' },
				getTestDS(),
			);
			expect(result.notFound).toBe(1);
			expect(result.updated).toBe(0);
		});

		it('no-ops when patch is empty', async () => {
			const itemIds = env.retreatInventory.slice(0, 2).map((r) => r.inventoryItemId);
			const result = await bulkUpdateRetreatInventory(
				env.retreat.id,
				itemIds,
				{},
				getTestDS(),
			);
			expect(result).toEqual({ updated: 0, notFound: 0 });
		});
	});

	describe('copyInventoryFromRetreat', () => {
		let user: Awaited<ReturnType<typeof TestDataFactory.createTestUser>>;
		let sourceRetreat: Retreat;
		let targetRetreat: Retreat;
		let items: InventoryItem[];

		beforeEach(async () => {
			user = await TestDataFactory.createTestUser();
			sourceRetreat = await TestDataFactory.createTestRetreat({ createdBy: user.id });
			targetRetreat = await TestDataFactory.createTestRetreat({ createdBy: user.id });
			items = await TestDataFactory.createTestInventoryItems(3);

			// Source: 2 items con contenido, 1 sin contenido.
			const riRepo = getTestDS().getRepository(RetreatInventory);
			await riRepo.save([
				riRepo.create({
					retreatId: sourceRetreat.id,
					inventoryItemId: items[0].id,
					requiredQuantity: 0,
					currentQuantity: 10,
					isSufficient: true,
					boxLabel: 'Caja A',
					notes: 'Origen 1',
				}),
				riRepo.create({
					retreatId: sourceRetreat.id,
					inventoryItemId: items[1].id,
					requiredQuantity: 0,
					currentQuantity: 5,
					isSufficient: true,
					boxLabel: 'Caja B',
				}),
				riRepo.create({
					retreatId: sourceRetreat.id,
					inventoryItemId: items[2].id,
					requiredQuantity: 0,
					currentQuantity: 0,
					isSufficient: true,
				}),
			]);
		});

		it('copies content from source to empty target', async () => {
			const r = await copyInventoryFromRetreat(
				sourceRetreat.id,
				targetRetreat.id,
				{},
				getTestDS(),
			);
			expect(r.created).toBe(2);
			expect(r.copied).toBe(0);
			expect(r.skipped).toBe(0);

			const targetRows = await getTestDS()
				.getRepository(RetreatInventory)
				.find({ where: { retreatId: targetRetreat.id } });
			expect(targetRows.length).toBe(2);
			const labels = targetRows.map((r) => r.boxLabel).sort();
			expect(labels).toEqual(['Caja A', 'Caja B']);
		});

		it('skips items already manually filled in target without overwrite', async () => {
			const riRepo = getTestDS().getRepository(RetreatInventory);
			await riRepo.save(
				riRepo.create({
					retreatId: targetRetreat.id,
					inventoryItemId: items[0].id,
					requiredQuantity: 0,
					currentQuantity: 99,
					isSufficient: true,
					boxLabel: 'Caja TARGET',
				}),
			);
			const r = await copyInventoryFromRetreat(
				sourceRetreat.id,
				targetRetreat.id,
				{},
				getTestDS(),
			);
			expect(r.skipped).toBe(1);
			expect(r.created).toBe(1); // solo el otro item con contenido

			const targetItem0 = await riRepo.findOne({
				where: { retreatId: targetRetreat.id, inventoryItemId: items[0].id },
			});
			expect(targetItem0?.currentQuantity).toBe(99);
			expect(targetItem0?.boxLabel).toBe('Caja TARGET');
		});

		it('overwrites target when overwrite=true', async () => {
			const riRepo = getTestDS().getRepository(RetreatInventory);
			await riRepo.save(
				riRepo.create({
					retreatId: targetRetreat.id,
					inventoryItemId: items[0].id,
					requiredQuantity: 0,
					currentQuantity: 99,
					isSufficient: true,
					boxLabel: 'Caja TARGET',
				}),
			);
			const r = await copyInventoryFromRetreat(
				sourceRetreat.id,
				targetRetreat.id,
				{ overwrite: true },
				getTestDS(),
			);
			expect(r.copied + r.created).toBeGreaterThan(0);

			const targetItem0 = await riRepo.findOne({
				where: { retreatId: targetRetreat.id, inventoryItemId: items[0].id },
			});
			expect(Number(targetItem0?.currentQuantity)).toBe(10);
			expect(targetItem0?.boxLabel).toBe('Caja A');
		});

		it('rejects same source and target', async () => {
			await expect(
				copyInventoryFromRetreat(sourceRetreat.id, sourceRetreat.id, {}, getTestDS()),
			).rejects.toThrow(/no pueden ser el mismo/);
		});

		it('copia items que solo tienen overrides (sin cantidad ni caja)', async () => {
			const riRepo = getTestDS().getRepository(RetreatInventory);
			// items[2] tiene currentQuantity=0 en beforeEach; le añadimos overrides
			const sourceRow = await riRepo.findOne({
				where: { retreatId: sourceRetreat.id, inventoryItemId: items[2].id },
			});
			expect(sourceRow).not.toBeNull();
			await riRepo.update(sourceRow!.id, { ratioOverride: 5.0, requiredQtyOverride: 42 });

			const r = await copyInventoryFromRetreat(
				sourceRetreat.id,
				targetRetreat.id,
				{},
				getTestDS(),
			);
			expect(r.created + r.copied).toBeGreaterThan(0);

			const copied = await riRepo.findOne({
				where: { retreatId: targetRetreat.id, inventoryItemId: items[2].id },
			});
			expect(Number(copied?.ratioOverride)).toBe(5);
			expect(Number(copied?.requiredQtyOverride)).toBe(42);
		});

		it('copia isExcluded=true al destino', async () => {
			const riRepo = getTestDS().getRepository(RetreatInventory);
			// items[2] tiene currentQuantity=0; lo marcamos como excluido
			const sourceRow = await riRepo.findOne({
				where: { retreatId: sourceRetreat.id, inventoryItemId: items[2].id },
			});
			await riRepo.update(sourceRow!.id, { isExcluded: true });

			await copyInventoryFromRetreat(sourceRetreat.id, targetRetreat.id, {}, getTestDS());

			const copied = await riRepo.findOne({
				where: { retreatId: targetRetreat.id, inventoryItemId: items[2].id },
			});
			expect(copied?.isExcluded).toBe(true);
		});
	});

	describe('getInventoryAlerts', () => {
		let env: Awaited<ReturnType<typeof TestDataFactory.createCompleteTestEnvironment>>;

		beforeEach(async () => {
			env = await TestDataFactory.createCompleteTestEnvironment();
		});

		it('does NOT include rows with requiredQuantity = 0 (no real deficit)', async () => {
			const riRepo = getTestDS().getRepository(RetreatInventory);
			// Force a row to have required=0, current=0, isSufficient=false (estado pre-fix).
			await riRepo.update(env.retreatInventory[0].id, {
				requiredQuantity: 0,
				currentQuantity: 0,
				isSufficient: false,
			});
			// Y otra fila con required > 0 y current < required.
			await riRepo.update(env.retreatInventory[1].id, {
				requiredQuantity: 10,
				currentQuantity: 3,
				isSufficient: false,
			});

			const alerts = await getInventoryAlerts(env.retreat.id, getTestDS());
			const itemIds = alerts.map((a) => a.id);
			expect(itemIds).not.toContain(env.retreatInventory[0].id);
			expect(itemIds).toContain(env.retreatInventory[1].id);
		});
	});

	describe('getRetreatInventoryHistory', () => {
		it('returns enriched history rows', async () => {
			const env = await TestDataFactory.createCompleteTestEnvironment();
			const item = env.retreatInventory[0];
			await updateRetreatInventory(
				env.retreat.id,
				item.inventoryItemId,
				{ boxLabel: 'Caja 1' },
				getTestDS(),
				env.user.id,
			);
			const history = await getRetreatInventoryHistory(env.retreat.id, {}, getTestDS());
			expect(history.length).toBeGreaterThan(0);
			expect(history[0]).toHaveProperty('itemName');
			expect(history[0]).toHaveProperty('field');
			expect(history[0]).toHaveProperty('oldValue');
			expect(history[0]).toHaveProperty('newValue');
		});

		it('filters by itemId when provided', async () => {
			const env = await TestDataFactory.createCompleteTestEnvironment();
			const item1 = env.retreatInventory[0];
			const item2 = env.retreatInventory[1];

			await updateRetreatInventory(
				env.retreat.id,
				item1.inventoryItemId,
				{ boxLabel: 'A' },
				getTestDS(),
				env.user.id,
			);
			await updateRetreatInventory(
				env.retreat.id,
				item2.inventoryItemId,
				{ boxLabel: 'B' },
				getTestDS(),
				env.user.id,
			);

			const onlyItem1 = await getRetreatInventoryHistory(
				env.retreat.id,
				{ itemId: item1.inventoryItemId },
				getTestDS(),
			);
			expect(onlyItem1.length).toBeGreaterThan(0);
			expect(onlyItem1.every((h) => h.inventoryItemId === item1.inventoryItemId)).toBe(true);
		});
	});

	describe('addCustomItemToRetreat', () => {
		it('crea fila con inventoryItemId=null y customName', async () => {
			const env = await TestDataFactory.createCompleteTestEnvironment();
			const result = await addCustomItemToRetreat(
				env.retreat.id,
				{ customName: 'Café Marlboro 30g', customUnit: 'sobres', requiredQuantity: 5 },
				getTestDS(),
			);
			expect((result as any).error).toBeUndefined();
			const row = result as RetreatInventory;
			expect(row.inventoryItemId).toBeNull();
			expect(row.customName).toBe('Café Marlboro 30g');
			expect(row.customUnit).toBe('sobres');
			expect(Number(row.requiredQuantity)).toBe(5);
		});

		it('rechaza si customName está vacío', async () => {
			const env = await TestDataFactory.createCompleteTestEnvironment();
			const result = await addCustomItemToRetreat(
				env.retreat.id,
				{ customName: '   ' },
				getTestDS(),
			);
			expect((result as any).error).toMatch(/customName/);
		});

		it('rechaza si el retiro no existe', async () => {
			const result = await addCustomItemToRetreat(
				'00000000-0000-0000-0000-000000000000',
				{ customName: 'X' },
				getTestDS(),
			);
			expect((result as any).error).toMatch(/Retiro/);
		});
	});

	describe('syncShirtItemsForRetreat', () => {
		it('crea N filas por (tipo × talla) e idempotente', async () => {
			const env = await TestDataFactory.createCompleteTestEnvironment();
			const shirtRepo = getTestDS().getRepository(RetreatShirtType);
			await shirtRepo.save([
				shirtRepo.create({
					retreatId: env.retreat.id,
					name: 'Blanca',
					availableSizes: ['S', 'M'],
					sortOrder: 1,
				}),
				shirtRepo.create({
					retreatId: env.retreat.id,
					name: 'Azul',
					availableSizes: ['G'],
					sortOrder: 2,
				}),
			]);

			const r1 = await syncShirtItemsForRetreat(env.retreat.id, getTestDS());
			expect(r1.created).toBe(3); // 2 + 1
			const r2 = await syncShirtItemsForRetreat(env.retreat.id, getTestDS());
			expect(r2.created).toBe(0); // idempotente
			expect(r2.updated).toBe(3);
		});

		it('elimina filas obsoletas si currentQuantity = 0', async () => {
			const env = await TestDataFactory.createCompleteTestEnvironment();
			const shirtRepo = getTestDS().getRepository(RetreatShirtType);
			const tipo = await shirtRepo.save(
				shirtRepo.create({
					retreatId: env.retreat.id,
					name: 'Blanca',
					availableSizes: ['S', 'M'],
					sortOrder: 1,
				}),
			);
			await syncShirtItemsForRetreat(env.retreat.id, getTestDS());

			// Quitar talla M
			tipo.availableSizes = ['S'];
			await shirtRepo.save(tipo);

			const r = await syncShirtItemsForRetreat(env.retreat.id, getTestDS());
			expect(r.removed).toBe(1);
			expect(r.updated).toBe(1);
		});

		it('preserva filas obsoletas si currentQuantity > 0', async () => {
			const env = await TestDataFactory.createCompleteTestEnvironment();
			const shirtRepo = getTestDS().getRepository(RetreatShirtType);
			const tipo = await shirtRepo.save(
				shirtRepo.create({
					retreatId: env.retreat.id,
					name: 'Blanca',
					availableSizes: ['S', 'M'],
					sortOrder: 1,
				}),
			);
			await syncShirtItemsForRetreat(env.retreat.id, getTestDS());

			// Marcar la fila M con stock
			const riRepo = getTestDS().getRepository(RetreatInventory);
			const mRow = await riRepo.findOne({
				where: { retreatId: env.retreat.id, retreatShirtTypeId: tipo.id, shirtSize: 'M' },
			});
			if (!mRow) throw new Error('expected M row');
			await riRepo.update(mRow.id, { currentQuantity: 3 });

			tipo.availableSizes = ['S'];
			await shirtRepo.save(tipo);
			const r = await syncShirtItemsForRetreat(env.retreat.id, getTestDS());
			expect(r.removed).toBe(0);
			expect(r.skipped).toBe(1);
		});

		it('calcula requiredQuantity contando ParticipantShirtSize', async () => {
			const env = await TestDataFactory.createCompleteTestEnvironment();
			const shirtRepo = getTestDS().getRepository(RetreatShirtType);
			const tipo = await shirtRepo.save(
				shirtRepo.create({
					retreatId: env.retreat.id,
					name: 'Blanca',
					availableSizes: ['M'],
					sortOrder: 1,
				}),
			);
			// crear 2 participantes con shirt size M
			const p1 = await TestDataFactory.createTestParticipant(env.retreat.id);
			const p2 = await TestDataFactory.createTestParticipant(env.retreat.id);
			const sizeRepo = getTestDS().getRepository(ParticipantShirtSize);
			await sizeRepo.save([
				sizeRepo.create({ participantId: p1.id, shirtTypeId: tipo.id, size: 'M' }),
				sizeRepo.create({ participantId: p2.id, shirtTypeId: tipo.id, size: 'M' }),
			]);

			await syncShirtItemsForRetreat(env.retreat.id, getTestDS());
			const row = await getTestDS().getRepository(RetreatInventory).findOne({
				where: { retreatId: env.retreat.id, retreatShirtTypeId: tipo.id, shirtSize: 'M' },
			});
			expect(Number(row?.requiredQuantity)).toBe(2);
		});
	});

	// ---------------------------------------------------------------------------
	// calculateRequiredQuantities — calcBase
	// ---------------------------------------------------------------------------
	describe('calculateRequiredQuantities con calcBase', () => {
		it('usa walkerCount real con calcBase=actual', async () => {
			const user = await TestDataFactory.createTestUser();
			const retreat = await TestDataFactory.createTestRetreat({
				createdBy: user.id,
				max_walkers: 50,
			});
			const [item] = await TestDataFactory.createTestInventoryItems(1);
			// item tiene ratio=2 y está en el catálogo sin requiredQuantity fijo
			const riRepo = getTestDS().getRepository(RetreatInventory);
			await riRepo.save(
				riRepo.create({
					retreatId: retreat.id,
					inventoryItemId: item.id,
					requiredQuantity: 0,
					currentQuantity: 0,
					isSufficient: true,
				}),
			);
			// 0 caminantes inscritos → ratio × 0 = 0
			const rows = await calculateRequiredQuantities(retreat.id, getTestDS(), { calcBase: 'actual' });
			const row = rows.find((r) => r.inventoryItemId === item.id);
			expect(Number(row?.requiredQuantity)).toBe(0);
		});

		it('usa max_walkers con calcBase=expected', async () => {
			const user = await TestDataFactory.createTestUser();
			const retreat = await TestDataFactory.createTestRetreat({
				createdBy: user.id,
				max_walkers: 20,
			});
			const [item] = await TestDataFactory.createTestInventoryItems(1);
			// ratio=2, max_walkers=20 → expected = 40
			const riRepo = getTestDS().getRepository(RetreatInventory);
			await riRepo.save(
				riRepo.create({
					retreatId: retreat.id,
					inventoryItemId: item.id,
					requiredQuantity: 0,
					currentQuantity: 0,
					isSufficient: true,
				}),
			);
			const rows = await calculateRequiredQuantities(retreat.id, getTestDS(), { calcBase: 'expected' });
			const row = rows.find((r) => r.inventoryItemId === item.id);
			expect(Number(row?.requiredQuantity)).toBe(40); // ratio=2 × max_walkers=20
		});

		it('calcBase=expected hace fallback a actual cuando max_walkers no está configurado', async () => {
			const user = await TestDataFactory.createTestUser();
			// max_walkers = undefined
			const retreat = await TestDataFactory.createTestRetreat({ createdBy: user.id });
			const [item] = await TestDataFactory.createTestInventoryItems(1);
			// Crear 3 caminantes reales
			await Promise.all([
				TestDataFactory.createTestParticipant(retreat.id, { type: 'walker' }),
				TestDataFactory.createTestParticipant(retreat.id, { type: 'walker' }),
				TestDataFactory.createTestParticipant(retreat.id, { type: 'walker' }),
			]);
			const riRepo = getTestDS().getRepository(RetreatInventory);
			await riRepo.save(
				riRepo.create({
					retreatId: retreat.id,
					inventoryItemId: item.id,
					requiredQuantity: 0,
					currentQuantity: 0,
					isSufficient: true,
				}),
			);
			const rows = await calculateRequiredQuantities(retreat.id, getTestDS(), { calcBase: 'expected' });
			const row = rows.find((r) => r.inventoryItemId === item.id);
			// max_walkers=null → fallback a 3 caminantes reales → ratio=2 × 3 = 6
			expect(Number(row?.requiredQuantity)).toBe(6);
		});
	});

	describe('getActualWalkerCount', () => {
		it('devuelve el conteo de caminantes activos', async () => {
			const env = await TestDataFactory.createCompleteTestEnvironment();
			await TestDataFactory.createTestParticipant(env.retreat.id, { type: 'walker' });
			await TestDataFactory.createTestParticipant(env.retreat.id, { type: 'walker' });
			const count = await getActualWalkerCount(env.retreat.id, getTestDS());
			expect(count).toBe(2);
		});

		it('no cuenta servidores ni caminantes cancelados', async () => {
			const env = await TestDataFactory.createCompleteTestEnvironment();
			await TestDataFactory.createTestParticipant(env.retreat.id, { type: 'server' });
			await TestDataFactory.createTestParticipant(env.retreat.id, { type: 'walker', isCancelled: true });
			const count = await getActualWalkerCount(env.retreat.id, getTestDS());
			expect(count).toBe(0);
		});

		it('devuelve 0 para retiro sin participantes', async () => {
			const user = await TestDataFactory.createTestUser();
			const retreat = await TestDataFactory.createTestRetreat({ createdBy: user.id });
			const count = await getActualWalkerCount(retreat.id, getTestDS());
			expect(count).toBe(0);
		});
	});

	// ---------------------------------------------------------------------------
	// removeItemFromRetreat
	// ---------------------------------------------------------------------------
	describe('removeItemFromRetreat', () => {
		it('elimina por inventoryItemId y devuelve true', async () => {
			const env = await TestDataFactory.createCompleteTestEnvironment();
			const item = env.retreatInventory[0];
			const result = await removeItemFromRetreat(
				env.retreat.id,
				item.inventoryItemId,
				getTestDS(),
			);
			expect(result).toBe(true);
			const row = await getTestDS()
				.getRepository(RetreatInventory)
				.findOne({ where: { id: item.id } });
			expect(row).toBeNull();
		});

		it('elimina por retreat_inventory.id (item ad-hoc)', async () => {
			const env = await TestDataFactory.createCompleteTestEnvironment();
			const custom = (await addCustomItemToRetreat(
				env.retreat.id,
				{ customName: 'Item ad-hoc remove test' },
				getTestDS(),
			)) as RetreatInventory;

			const result = await removeItemFromRetreat(env.retreat.id, custom.id, getTestDS());
			expect(result).toBe(true);
			const row = await getTestDS()
				.getRepository(RetreatInventory)
				.findOne({ where: { id: custom.id } });
			expect(row).toBeNull();
		});

		it('devuelve false cuando el item no existe', async () => {
			const env = await TestDataFactory.createCompleteTestEnvironment();
			const result = await removeItemFromRetreat(
				env.retreat.id,
				'00000000-0000-0000-0000-000000000000',
				getTestDS(),
			);
			expect(result).toBe(false);
		});
	});

	// ---------------------------------------------------------------------------
	// bulkRemoveItemsFromRetreat
	// ---------------------------------------------------------------------------
	describe('bulkRemoveItemsFromRetreat', () => {
		it('elimina múltiples items y devuelve conteo correcto', async () => {
			const env = await TestDataFactory.createCompleteTestEnvironment();
			const ids = env.retreatInventory.slice(0, 3).map((r) => r.inventoryItemId);
			const result = await bulkRemoveItemsFromRetreat(env.retreat.id, ids, getTestDS());
			expect(result).toEqual({ removed: 3 });

			const remaining = await getTestDS()
				.getRepository(RetreatInventory)
				.find({ where: { retreatId: env.retreat.id } });
			expect(remaining.length).toBe(env.retreatInventory.length - 3);
		});

		it('devuelve 0 para array vacío sin tocar la BD', async () => {
			const env = await TestDataFactory.createCompleteTestEnvironment();
			const result = await bulkRemoveItemsFromRetreat(env.retreat.id, [], getTestDS());
			expect(result).toEqual({ removed: 0 });
		});

		it('cuenta solo los que existían (ignora ids no encontrados)', async () => {
			const env = await TestDataFactory.createCompleteTestEnvironment();
			const realId = env.retreatInventory[0].inventoryItemId;
			const fakeId = '00000000-0000-0000-0000-000000000000';
			const result = await bulkRemoveItemsFromRetreat(
				env.retreat.id,
				[realId, fakeId],
				getTestDS(),
			);
			expect(result).toEqual({ removed: 1 });
		});
	});

	// ---------------------------------------------------------------------------
	// addItemToRetreat
	// ---------------------------------------------------------------------------
	describe('addItemToRetreat', () => {
		it('agrega item del catálogo y calcula requiredQuantity por ratio', async () => {
			const user = await TestDataFactory.createTestUser();
			const retreat = await TestDataFactory.createTestRetreat({
				createdBy: user.id,
				max_walkers: 20,
			});
			const [item] = await TestDataFactory.createTestInventoryItems(1);

			const result = await addItemToRetreat(retreat.id, item.id, getTestDS());
			expect((result as any).error).toBeUndefined();
			const row = result as RetreatInventory;
			expect(row.inventoryItemId).toBe(item.id);
			expect(row.retreatId).toBe(retreat.id);
			expect(Number(row.currentQuantity)).toBe(0);
			// ratio=2.0 × max_walkers=20 = 40
			expect(Number(row.requiredQuantity)).toBe(40);
		});

		it('rechaza si el item ya está en el retiro', async () => {
			const env = await TestDataFactory.createCompleteTestEnvironment();
			const existingId = env.retreatInventory[0].inventoryItemId;
			const result = await addItemToRetreat(env.retreat.id, existingId, getTestDS());
			expect((result as any).error).toMatch(/ya está/);
		});

		it('rechaza si el item no existe en el catálogo', async () => {
			const env = await TestDataFactory.createCompleteTestEnvironment();
			const result = await addItemToRetreat(
				env.retreat.id,
				'00000000-0000-0000-0000-000000000000',
				getTestDS(),
			);
			expect((result as any).error).toMatch(/no encontrado/i);
		});

		it('rechaza si el retiro no existe', async () => {
			const [item] = await TestDataFactory.createTestInventoryItems(1);
			const result = await addItemToRetreat(
				'00000000-0000-0000-0000-000000000000',
				item.id,
				getTestDS(),
			);
			expect((result as any).error).toMatch(/Retiro/i);
		});
	});

	// ---------------------------------------------------------------------------
	// getAvailableItemsForRetreat
	// ---------------------------------------------------------------------------
	describe('getAvailableItemsForRetreat', () => {
		it('devuelve solo items no asignados al retiro', async () => {
			const env = await TestDataFactory.createCompleteTestEnvironment();
			const assignedIds = new Set(env.retreatInventory.map((r) => r.inventoryItemId));

			const available = await getAvailableItemsForRetreat(env.retreat.id, getTestDS());
			for (const it of available) {
				expect(assignedIds.has(it.id)).toBe(false);
			}
		});

		it('excluye items marcados como isCalculated', async () => {
			const env = await TestDataFactory.createCompleteTestEnvironment();
			// createTestInventoryItems ya crea categoryId + teamId válidos;
			// usamos la categoría/equipo que creó.
			const [baseItem] = await TestDataFactory.createTestInventoryItems(1);

			const itemRepo = getTestDS().getRepository(InventoryItem);
			const calcItem = await itemRepo.save(
				itemRepo.create({
					name: 'Camiseta calculada test',
					ratio: 1,
					unit: 'piezas',
					isCalculated: true,
					isActive: true,
					calculationType: 'tshirt',
					tshirtSize: 'M',
					categoryId: (baseItem as any).categoryId,
					teamId: (baseItem as any).teamId,
				}),
			);

			const available = await getAvailableItemsForRetreat(env.retreat.id, getTestDS());
			expect(available.some((it) => it.id === calcItem.id)).toBe(false);
		});

		it('incluye nombre, categoría y unidad en la respuesta', async () => {
			const user = await TestDataFactory.createTestUser();
			const retreat = await TestDataFactory.createTestRetreat({ createdBy: user.id });
			await TestDataFactory.createTestInventoryItems(3);

			const available = await getAvailableItemsForRetreat(retreat.id, getTestDS());
			expect(available.length).toBeGreaterThan(0);
			for (const it of available) {
				expect(it).toHaveProperty('name');
				expect(it).toHaveProperty('unit');
				expect(it).toHaveProperty('categoryName');
			}
		});
	});

	// ---------------------------------------------------------------------------
	// getRetreatInventoryByCategory
	// ---------------------------------------------------------------------------
	describe('getRetreatInventoryByCategory', () => {
		it('agrupa items por nombre de categoría del catálogo', async () => {
			const env = await TestDataFactory.createCompleteTestEnvironment();
			const grouped = await getRetreatInventoryByCategory(env.retreat.id, getTestDS());
			// TestDataFactory crea items con categoría "Test Category"
			expect(Object.keys(grouped)).toContain('Test Category');
		});

		it('agrupa items ad-hoc por customCategory.name', async () => {
			const env = await TestDataFactory.createCompleteTestEnvironment();
			// Crear categoría custom
			const catRepo = getTestDS().getRepository(InventoryCategory);
			const cat = await catRepo.save(
				catRepo.create({ name: 'Categoría Custom Test', description: '' }),
			);
			await addCustomItemToRetreat(
				env.retreat.id,
				{ customName: 'Item ad-hoc cat test', customCategoryId: cat.id },
				getTestDS(),
			);
			const grouped = await getRetreatInventoryByCategory(env.retreat.id, getTestDS());
			expect(Object.keys(grouped)).toContain('Categoría Custom Test');
		});

		it('agrupa items de camisetas bajo "Camisetas"', async () => {
			const env = await TestDataFactory.createCompleteTestEnvironment();
			const shirtRepo = getTestDS().getRepository(RetreatShirtType);
			await shirtRepo.save(
				shirtRepo.create({
					retreatId: env.retreat.id,
					name: 'Blanca',
					availableSizes: ['M'],
					sortOrder: 1,
				}),
			);
			await syncShirtItemsForRetreat(env.retreat.id, getTestDS());

			const grouped = await getRetreatInventoryByCategory(env.retreat.id, getTestDS());
			expect(Object.keys(grouped)).toContain('Camisetas');
		});

		it('ordena items dentro de cada grupo por nombre', async () => {
			const env = await TestDataFactory.createCompleteTestEnvironment();
			const grouped = await getRetreatInventoryByCategory(env.retreat.id, getTestDS());
			for (const [, items] of Object.entries(grouped)) {
				const names = items.map((it) => it.inventoryItem?.name || it.customName || '');
				const sorted = [...names].sort((a, b) => a.localeCompare(b));
				expect(names).toEqual(sorted);
			}
		});

		it('incluye items excluidos (para que el frontend pueda filtrarlos por pill)', async () => {
			const env = await TestDataFactory.createCompleteTestEnvironment();
			const item = env.retreatInventory[0];
			await getTestDS()
				.getRepository(RetreatInventory)
				.update(item.id, { isExcluded: true });

			const grouped = await getRetreatInventoryByCategory(env.retreat.id, getTestDS());
			const allRows = Object.values(grouped).flat();
			// El item excluido DEBE estar presente (el filtrado lo hace el frontend)
			expect(allRows.find((r) => r.id === item.id)).toBeDefined();
			expect(allRows.find((r) => r.id === item.id)?.isExcluded).toBe(true);
		});

		it('getRetreatInventory por defecto NO incluye excluidos, pero getRetreatInventoryByCategory SÍ', async () => {
			const env = await TestDataFactory.createCompleteTestEnvironment();
			const item = env.retreatInventory[0];
			await getTestDS()
				.getRepository(RetreatInventory)
				.update(item.id, { isExcluded: true });

			// getRetreatInventory (default) — filtra excluidos
			const direct = await getRetreatInventory(env.retreat.id, getTestDS());
			expect(direct.find((r) => r.id === item.id)).toBeUndefined();

			// getRetreatInventoryByCategory — incluye todos para el frontend
			const grouped = await getRetreatInventoryByCategory(env.retreat.id, getTestDS());
			const allRows = Object.values(grouped).flat();
			expect(allRows.find((r) => r.id === item.id)).toBeDefined();
		});
	});

	// ---------------------------------------------------------------------------
	// Overrides por retiro (ratioOverride, requiredQtyOverride, isExcluded)
	// ---------------------------------------------------------------------------
	describe('overrides por retiro', () => {
		describe('ratioOverride en calculateRequiredQuantities', () => {
			it('usa ratioOverride en lugar del ratio global cuando está definido', async () => {
				const user = await TestDataFactory.createTestUser();
				const retreat = await TestDataFactory.createTestRetreat({
					createdBy: user.id,
					max_walkers: 60,
				});
				const [item] = await TestDataFactory.createTestInventoryItems(1);
				// item tiene ratio=2.0; override = 5.0 → expected = ceil(5 × 60) = 300
				const riRepo = getTestDS().getRepository(RetreatInventory);
				await riRepo.save(
					riRepo.create({
						retreatId: retreat.id,
						inventoryItemId: item.id,
						requiredQuantity: 0,
						currentQuantity: 0,
						isSufficient: true,
						ratioOverride: 5.0,
					}),
				);
				const rows = await calculateRequiredQuantities(retreat.id, getTestDS(), {
					calcBase: 'expected',
				});
				const row = rows.find((r) => r.inventoryItemId === item.id);
				expect(Number(row?.requiredQuantity)).toBe(300); // 5 × 60
			});
		});

		describe('requiredQtyOverride en calculateRequiredQuantities', () => {
			it('usa requiredQtyOverride y no recalcula cuando está definido', async () => {
				const user = await TestDataFactory.createTestUser();
				const retreat = await TestDataFactory.createTestRetreat({
					createdBy: user.id,
					max_walkers: 60,
				});
				const [item] = await TestDataFactory.createTestInventoryItems(1);
				// override fijo = 99; ratio global = 2.0 → resultado debe ser 99
				const riRepo = getTestDS().getRepository(RetreatInventory);
				await riRepo.save(
					riRepo.create({
						retreatId: retreat.id,
						inventoryItemId: item.id,
						requiredQuantity: 0,
						currentQuantity: 0,
						isSufficient: true,
						requiredQtyOverride: 99,
					}),
				);
				const rows = await calculateRequiredQuantities(retreat.id, getTestDS(), {
					calcBase: 'expected',
				});
				const row = rows.find((r) => r.inventoryItemId === item.id);
				expect(Number(row?.requiredQuantity)).toBe(99);
			});

			it('updateRetreatInventory aplica requiredQtyOverride inmediatamente', async () => {
				const env = await TestDataFactory.createCompleteTestEnvironment();
				const item = env.retreatInventory[0];
				const updated = await updateRetreatInventory(
					env.retreat.id,
					item.inventoryItemId,
					{ requiredQtyOverride: 42 },
					getTestDS(),
				);
				expect(Number(updated?.requiredQtyOverride)).toBe(42);
				expect(Number(updated?.requiredQuantity)).toBe(42);
			});

			it('updateRetreatInventory limpia requiredQtyOverride con null', async () => {
				const env = await TestDataFactory.createCompleteTestEnvironment();
				const item = env.retreatInventory[0];
				// Primero fijar
				await updateRetreatInventory(
					env.retreat.id,
					item.inventoryItemId,
					{ requiredQtyOverride: 42 },
					getTestDS(),
				);
				// Luego limpiar
				const updated = await updateRetreatInventory(
					env.retreat.id,
					item.inventoryItemId,
					{ requiredQtyOverride: null },
					getTestDS(),
				);
				expect(updated?.requiredQtyOverride).toBeNull();
			});
		});

		describe('isExcluded', () => {
			it('getRetreatInventory excluye filas con isExcluded=true por defecto', async () => {
				const env = await TestDataFactory.createCompleteTestEnvironment();
				const item = env.retreatInventory[0];
				// Excluir el primer item
				await getTestDS()
					.getRepository(RetreatInventory)
					.update(item.id, { isExcluded: true });

				const rows = await getRetreatInventory(env.retreat.id, getTestDS());
				expect(rows.find((r) => r.id === item.id)).toBeUndefined();
			});

			it('getRetreatInventory incluye excluidos con includeExcluded=true', async () => {
				const env = await TestDataFactory.createCompleteTestEnvironment();
				const item = env.retreatInventory[0];
				await getTestDS()
					.getRepository(RetreatInventory)
					.update(item.id, { isExcluded: true });

				const rows = await getRetreatInventory(env.retreat.id, getTestDS(), true);
				expect(rows.find((r) => r.id === item.id)).toBeDefined();
			});

			it('calculateRequiredQuantities omite filas excluidas (no las modifica)', async () => {
				const user = await TestDataFactory.createTestUser();
				const retreat = await TestDataFactory.createTestRetreat({ createdBy: user.id, max_walkers: 60 });
				const [item] = await TestDataFactory.createTestInventoryItems(1);
				const riRepo = getTestDS().getRepository(RetreatInventory);
				const row = await riRepo.save(
					riRepo.create({
						retreatId: retreat.id,
						inventoryItemId: item.id,
						requiredQuantity: 777, // valor centinela
						currentQuantity: 0,
						isSufficient: false,
						isExcluded: true,
					}),
				);
				await calculateRequiredQuantities(retreat.id, getTestDS(), { calcBase: 'expected' });
				const after = await riRepo.findOne({ where: { id: row.id } });
				// El valor centinela 777 debe mantenerse intacto
				expect(Number(after?.requiredQuantity)).toBe(777);
			});

			it('getInventoryAlerts no incluye items excluidos', async () => {
				const env = await TestDataFactory.createCompleteTestEnvironment();
				const riRepo = getTestDS().getRepository(RetreatInventory);
				// Crear déficit en item excluido
				const item = env.retreatInventory[0];
				await riRepo.update(item.id, {
					requiredQuantity: 10,
					currentQuantity: 0,
					isSufficient: false,
					isExcluded: true,
				});
				const alerts = await getInventoryAlerts(env.retreat.id, getTestDS());
				expect(alerts.find((a) => a.id === item.id)).toBeUndefined();
			});

			it('updateRetreatInventory guarda isExcluded=true', async () => {
				const env = await TestDataFactory.createCompleteTestEnvironment();
				const item = env.retreatInventory[0];
				const updated = await updateRetreatInventory(
					env.retreat.id,
					item.inventoryItemId,
					{ isExcluded: true },
					getTestDS(),
				);
				expect(updated?.isExcluded).toBe(true);
			});
		});

		describe('addItemToRetreat con overrides', () => {
			it('aplica ratioOverride al agregar del catálogo', async () => {
				const user = await TestDataFactory.createTestUser();
				const retreat = await TestDataFactory.createTestRetreat({ createdBy: user.id, max_walkers: 10 });
				const [item] = await TestDataFactory.createTestInventoryItems(1);
				// ratio global = 2.0; override = 3.0 → ceil(3 × 10) = 30
				const result = await addItemToRetreat(retreat.id, item.id, getTestDS(), {
					ratioOverride: 3.0,
				}) as RetreatInventory;
				expect(Number(result.ratioOverride)).toBe(3);
				expect(Number(result.requiredQuantity)).toBe(30);
			});

			it('aplica requiredQtyOverride al agregar del catálogo (ignora ratio)', async () => {
				const user = await TestDataFactory.createTestUser();
				const retreat = await TestDataFactory.createTestRetreat({ createdBy: user.id, max_walkers: 10 });
				const [item] = await TestDataFactory.createTestInventoryItems(1);
				const result = await addItemToRetreat(retreat.id, item.id, getTestDS(), {
					requiredQtyOverride: 25,
				}) as RetreatInventory;
				expect(Number(result.requiredQtyOverride)).toBe(25);
				expect(Number(result.requiredQuantity)).toBe(25);
			});
		});
	});
});

// ---------------------------------------------------------------------------
// New shirt-size feature tests
// ---------------------------------------------------------------------------

describe('updateRetreatInventory – reloads relations', () => {
	const getTestDS = () => TestDataFactory['testDataSource'];

	beforeAll(async () => {
		await setupTestDatabase();
	});

	afterAll(async () => {
		await teardownTestDatabase();
	});

	beforeEach(async () => {
		await clearTestData();
	});

	it('returned item includes inventoryItem relation (not null)', async () => {
		const env = await TestDataFactory.createCompleteTestEnvironment();
		const item = env.retreatInventory[0];
		const updated = await updateRetreatInventory(
			env.retreat.id,
			item.inventoryItemId,
			{ status: 'packed' },
			getTestDS(),
		);
		expect(updated).not.toBeNull();
		expect(updated?.inventoryItem).not.toBeNull();
		expect(updated?.inventoryItem?.id).toBe(item.inventoryItemId);
	});
});

describe('syncMissingCatalogItems', () => {
	const getTestDS = () => TestDataFactory['testDataSource'];

	beforeAll(async () => {
		await setupTestDatabase();
	});

	afterAll(async () => {
		await teardownTestDatabase();
	});

	beforeEach(async () => {
		await clearTestData();
	});

	it('returns 0 when all catalog items already in retreat inventory', async () => {
		const env = await TestDataFactory.createCompleteTestEnvironment();
		// env already has all inventory items linked to the retreat
		const result = await syncMissingCatalogItems(env.retreat.id, getTestDS());
		expect(result.added).toBe(0);
	});

	it('creates rows for catalog items not yet in retreat inventory', async () => {
		const env = await TestDataFactory.createCompleteTestEnvironment();
		// Create a new catalog item that is NOT yet in the retreat inventory
		const [extraItem] = await TestDataFactory.createTestInventoryItems(1);
		const result = await syncMissingCatalogItems(env.retreat.id, getTestDS());
		expect(result.added).toBe(1);
		const row = await getTestDS()
			.getRepository(RetreatInventory)
			.findOne({ where: { retreatId: env.retreat.id, inventoryItemId: extraItem.id } });
		expect(row).not.toBeNull();
	});

	it('does not duplicate items already present', async () => {
		const env = await TestDataFactory.createCompleteTestEnvironment();
		// Run twice — second call should add nothing
		await syncMissingCatalogItems(env.retreat.id, getTestDS());
		const result2 = await syncMissingCatalogItems(env.retreat.id, getTestDS());
		expect(result2.added).toBe(0);
	});
});

describe('shirt count excludes cancelled participants', () => {
	const getTestDS = () => TestDataFactory['testDataSource'];

	beforeAll(async () => {
		await setupTestDatabase();
	});

	afterAll(async () => {
		await teardownTestDatabase();
	});

	beforeEach(async () => {
		await clearTestData();
	});

	it('cancelled participant shirt size is not counted in requiredQuantity', async () => {
		const env = await TestDataFactory.createCompleteTestEnvironment();
		const shirtRepo = getTestDS().getRepository(RetreatShirtType);
		const tipo = await shirtRepo.save(
			shirtRepo.create({
				retreatId: env.retreat.id,
				name: 'Blanca',
				availableSizes: ['M'],
				sortOrder: 1,
			}),
		);

		// Create one active + one cancelled participant, both with shirt size M
		const active = await TestDataFactory.createTestParticipant(env.retreat.id, { type: 'walker' });
		const cancelled = await TestDataFactory.createTestParticipant(env.retreat.id, {
			type: 'walker',
			isCancelled: true,
		} as any);

		const sizeRepo = getTestDS().getRepository(ParticipantShirtSize);
		await sizeRepo.save([
			sizeRepo.create({ participantId: active.id, shirtTypeId: tipo.id, size: 'M' }),
			sizeRepo.create({ participantId: cancelled.id, shirtTypeId: tipo.id, size: 'M' }),
		]);

		await syncShirtItemsForRetreat(env.retreat.id, getTestDS());

		const row = await getTestDS().getRepository(RetreatInventory).findOne({
			where: { retreatId: env.retreat.id, retreatShirtTypeId: tipo.id, shirtSize: 'M' },
		});
		// Only the active participant should be counted
		expect(Number(row?.requiredQuantity)).toBe(1);
	});
});
