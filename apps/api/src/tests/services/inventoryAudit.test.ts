import { setupTestDatabase, teardownTestDatabase, clearTestData } from '../test-setup';
import { TestDataFactory } from '../test-utils/testDataFactory';
import { AppDataSource } from '@/data-source';
import { DomainAuditLog } from '@/entities/domainAuditLog.entity';
import {
	createInventoryCategory,
	createInventoryTeam,
	createInventoryItem,
	updateInventoryItem,
	addItemToRetreat,
	addCustomItemToRetreat,
	updateRetreatInventory,
	removeItemFromRetreat,
	syncMissingCatalogItems,
	calculateRequiredQuantities,
} from '@/services/inventoryService';
import { auditContext } from '@/utils/auditContext';

// Bloque C de la auditoría de dominio: el inventario mutaba sin rastro — quién
// cambió cantidades, quién quitó un ítem del retiro. El catálogo global
// (categorías e ítems) no tiene retreatId porque se comparte entre retiros;
// las filas del retiro sí lo llevan. `description` y `notes` nunca entran al
// log: viaja su tamaño (`descriptionChars` / `notesChars`).
describe('inventario — auditoría de dominio', () => {
	beforeAll(async () => {
		await setupTestDatabase();
	});

	afterAll(async () => {
		await teardownTestDatabase();
	});

	beforeEach(async () => {
		// clearTestData no cubre el historial por-campo (hija de retreat_inventory):
		// correrla primero y luego la tabla que quedó.
		await clearTestData();
		await AppDataSource.query('DELETE FROM retreat_inventory_history');
	});

	const auditRepo = () => AppDataSource.getRepository(DomainAuditLog);

	async function waitForLogs(
		predicate: (rows: DomainAuditLog[]) => boolean,
		tries = 60,
		delayMs = 5,
	): Promise<DomainAuditLog[]> {
		for (let i = 0; i < tries; i++) {
			const rows = await auditRepo().find();
			if (predicate(rows)) return rows;
			await new Promise((r) => setTimeout(r, delayMs));
		}
		return auditRepo().find();
	}

	const rowsOf = (rows: DomainAuditLog[], action: string) => rows.filter((r) => r.action === action);
	const meta = (row: DomainAuditLog) => JSON.parse(row.metadata ?? '{}');
	// Para las aserciones negativas: dar tiempo al insert fire-and-forget.
	const settle = (ms = 150) => new Promise((r) => setTimeout(r, ms));

	it('catálogo global: categoría e ítem dejan fila con retreatId null', async () => {
		const cat = await createInventoryCategory({
			name: 'Limpieza',
			isActive: true,
			description: 'Productos de limpieza',
		});
		const team = await createInventoryTeam({ name: 'Cocina', isActive: true });
		const item = await createInventoryItem({
			name: 'Cloro',
			unit: 'litros',
			ratio: 0.5,
			isActive: true,
			categoryId: cat.id,
			teamId: team.id,
			description: 'Sin fragancia',
		});

		const rows = await waitForLogs((r) => rowsOf(r, 'inventory_item.create').length > 0);

		const catRow = rowsOf(rows, 'inventory_category.create')[0];
		expect(catRow).toBeDefined();
		// El catálogo es global: no vive dentro de un retiro.
		expect(catRow.retreatId).toBeNull();
		expect(JSON.parse(catRow.newValues!)).toMatchObject({ name: 'Limpieza' });
		// La descripción es free text: solo su tamaño entra al log.
		expect(JSON.parse(catRow.newValues!)).not.toHaveProperty('description');
		expect(meta(catRow).descriptionChars).toBe('Productos de limpieza'.length);

		const itemRow = rowsOf(rows, 'inventory_item.create')[0];
		expect(itemRow.retreatId).toBeNull();
		expect(JSON.parse(itemRow.newValues!)).toMatchObject({ name: 'Cloro', unit: 'litros' });
		expect(meta(itemRow)).toMatchObject({ categoryId: cat.id, teamId: team.id });

		await updateInventoryItem(item.id, { name: 'Cloro gel' });
		const rows2 = await waitForLogs((r) => rowsOf(r, 'inventory_item.update').length > 0);
		const upd = rowsOf(rows2, 'inventory_item.update')[0];
		expect(upd.retreatId).toBeNull();
		expect(JSON.parse(upd.oldValues!)).toMatchObject({ name: 'Cloro' });
		expect(JSON.parse(upd.newValues!)).toMatchObject({ name: 'Cloro gel' });
	});

	it('inventario del retiro: alta, edición con historial, no-op silencioso y baja', async () => {
		const actor = await TestDataFactory.createTestUser();
		const retreat = await TestDataFactory.createTestRetreat({ createdBy: actor.id });
		const cat = await createInventoryCategory({ name: 'General', isActive: true });
		const team = await createInventoryTeam({ name: 'Cocina', isActive: true });
		const item = await createInventoryItem({
			name: 'Toallas',
			unit: 'piezas',
			ratio: 1,
			isActive: true,
			categoryId: cat.id,
			teamId: team.id,
		});

		let added: Awaited<ReturnType<typeof addItemToRetreat>>;
		await auditContext.run({ userId: actor.id, ip: '10.0.0.61' }, async () => {
			added = await addItemToRetreat(retreat.id, item.id);
			expect(added).not.toHaveProperty('error');
		});

		let rows = await waitForLogs((r) => rowsOf(r, 'retreat_inventory.create').length > 0);
		const addRow = rowsOf(rows, 'retreat_inventory.create')[0];
		expect(addRow.retreatId).toBe(retreat.id);
		expect(addRow.resourceId).toBe(added!.id);
		expect(addRow.actorUserId).toBe(actor.id);
		expect(addRow.ipAddress).toBe('10.0.0.61');
		expect(meta(addRow)).toMatchObject({ itemName: 'Toallas', source: 'catalog' });
		// El diff del alta es la configuración inicial, no un cambio.
		expect(JSON.parse(addRow.newValues!)).toMatchObject({ currentQuantity: 0 });

		const NOTES = 'Comprado en Costco';
		await auditContext.run({ userId: actor.id }, async () => {
			await updateRetreatInventory(retreat.id, item.id, { currentQuantity: 5, notes: NOTES });
		});
		rows = await waitForLogs((r) => rowsOf(r, 'retreat_inventory.update').length > 0);
		const updRow = rowsOf(rows, 'retreat_inventory.update')[0];
		expect(updRow.retreatId).toBe(retreat.id);
		expect(JSON.parse(updRow.oldValues!)).toMatchObject({ currentQuantity: 0 });
		expect(JSON.parse(updRow.newValues!)).toMatchObject({ currentQuantity: 5 });
		expect(meta(updRow)).toMatchObject({ itemName: 'Toallas', notesChars: NOTES.length });
		// Las notas son free text: nunca entran al diff.
		expect(JSON.parse(updRow.newValues!)).not.toHaveProperty('notes');

		// Guardar lo mismo sin nada auditado no debe ensuciar el log.
		const updatesBefore = rowsOf(rows, 'retreat_inventory.update').length;
		await updateRetreatInventory(retreat.id, item.id, { isExcluded: false });
		await settle();
		rows = await auditRepo().find();
		expect(rowsOf(rows, 'retreat_inventory.update').length).toBe(updatesBefore);

		await auditContext.run({ userId: actor.id }, async () => {
			await removeItemFromRetreat(retreat.id, item.id);
		});
		rows = await waitForLogs((r) => rowsOf(r, 'retreat_inventory.delete').length > 0);
		const delRow = rowsOf(rows, 'retreat_inventory.delete')[0];
		expect(delRow.retreatId).toBe(retreat.id);
		expect(meta(delRow)).toMatchObject({ itemName: 'Toallas', source: 'catalog' });
		// El historial por-campo se cuenta ANTES del delete (la FK es CASCADE):
		// el update de arriba dejó 2 filas (currentQuantity y notes).
		expect(meta(delRow).historyRows).toBe(2);
	});

	it('ítem ad-hoc y agregados de sincronización / recálculo', async () => {
		const retreat = await TestDataFactory.createTestRetreat();
		const cat = await createInventoryCategory({ name: 'General', isActive: true });
		const team = await createInventoryTeam({ name: 'Cocina', isActive: true });
		await createInventoryItem({
			name: 'Bolsas de basura',
			unit: 'piezas',
			requiredQuantity: 10,
			isActive: true,
			categoryId: cat.id,
			teamId: team.id,
		});

		const custom = await addCustomItemToRetreat(retreat.id, {
			customName: 'Hielo',
			requiredQuantity: 4,
			currentQuantity: 2,
			notes: 'Para las bebidas',
		});
		expect(custom).not.toHaveProperty('error');

		let rows = await waitForLogs((r) => rowsOf(r, 'retreat_inventory.create').length > 0);
		const customRow = rowsOf(rows, 'retreat_inventory.create')[0];
		expect(customRow.retreatId).toBe(retreat.id);
		expect(meta(customRow)).toMatchObject({
			source: 'custom',
			hasCustomCategory: false,
			notesChars: 'Para las bebidas'.length,
		});
		expect(JSON.parse(customRow.newValues!)).toMatchObject({ customName: 'Hielo', currentQuantity: 2 });

		const { added } = await syncMissingCatalogItems(retreat.id);
		expect(added).toBeGreaterThanOrEqual(1);
		rows = await waitForLogs((r) => rowsOf(r, 'retreat_inventory.sync_catalog').length > 0);
		const syncRow = rowsOf(rows, 'retreat_inventory.sync_catalog')[0];
		// Agregado: resourceId = el retiro completo, no una fila de inventario.
		expect(syncRow.resourceId).toBe(retreat.id);
		expect(syncRow.retreatId).toBe(retreat.id);
		expect(meta(syncRow).added).toBe(added);

		await calculateRequiredQuantities(retreat.id);
		rows = await waitForLogs((r) => rowsOf(r, 'retreat_inventory.recalculate').length > 0);
		const calcRow = rowsOf(rows, 'retreat_inventory.recalculate')[0];
		expect(calcRow.resourceId).toBe(retreat.id);
		expect(meta(calcRow)).toMatchObject({ calcBase: 'actual', items: 2 });
	});
});
