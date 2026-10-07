import { setupTestDatabase, teardownTestDatabase, clearTestData } from '../test-setup';
import { TestDataFactory } from '../test-utils/testDataFactory';
import { AppDataSource } from '@/data-source';
import { DomainAuditLog } from '@/entities/domainAuditLog.entity';
import { RetreatShirtType } from '@/entities/retreatShirtType.entity';
import { RetreatShirtTypeSizePrice } from '@/entities/retreatShirtTypeSizePrice.entity';
import { createShirtType, updateShirtType, deleteShirtType } from '@/services/shirtTypeService';
import { auditContext } from '@/utils/auditContext';

// Bloque C de la auditoría de dominio: los tipos de playera definían costos y
// tallas sin rastro. Las tallas (`availableSizes`) y el detalle de precios por
// talla NO entran al diff: viajan resumidos en metadata (`sizes`,
// `sizePrices`, `sizePricesBefore/After`). La sincronización con el
// inventario que arrastra el create es derivada y no se audita.
describe('tipos de playera — auditoría de dominio', () => {
	beforeAll(async () => {
		await setupTestDatabase();
	});

	afterAll(async () => {
		await teardownTestDatabase();
	});

	beforeEach(async () => {
		// clearTestData no cubre los tipos de playera ni sus precios por talla:
		// hijas primero para no chocar con la FK del retiro.
		await clearTestData();
		await AppDataSource.getRepository(RetreatShirtTypeSizePrice).clear();
		await AppDataSource.getRepository(RetreatShirtType).clear();
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
	const priceRepo = () => AppDataSource.getRepository(RetreatShirtTypeSizePrice);

	it('create registra actor, tallas en metadata y NO audita la sync derivada', async () => {
		const actor = await TestDataFactory.createTestUser();
		const retreat = await TestDataFactory.createTestRetreat({ createdBy: actor.id });

		const created = await auditContext.run({ userId: actor.id, ip: '10.0.0.62' }, () =>
			createShirtType(retreat.id, {
				name: 'Blanca Emaus',
				color: 'white',
				availableSizes: ['S', 'M'],
				sizePrices: [
					{ size: 'S', price: 150 },
					{ size: 'M', price: 160 },
				],
			}),
		);
		expect(created).not.toBeNull();

		const rows = await waitForLogs((r) => rowsOf(r, 'shirt_type.create').length > 0);
		const row = rowsOf(rows, 'shirt_type.create')[0];
		expect(row.retreatId).toBe(retreat.id);
		expect(row.resourceId).toBe(created!.id);
		expect(row.actorUserId).toBe(actor.id);
		expect(row.ipAddress).toBe('10.0.0.62');
		expect(JSON.parse(row.newValues!)).toMatchObject({ name: 'Blanca Emaus', color: 'white' });
		// El array de tallas vive resumido en metadata, no en el diff.
		expect(meta(row)).toMatchObject({ sizes: ['S', 'M'], sizePrices: 2 });
		expect(JSON.parse(row.newValues!)).not.toHaveProperty('availableSizes');
		// La sync hacia retreat_inventory es derivada del create: ninguna fila.
		expect(rowsOf(rows, 'retreat_inventory.create')).toHaveLength(0);
	});

	it('update difa campos y cuenta los precios por talla antes/después', async () => {
		const retreat = await TestDataFactory.createTestRetreat();
		const created = await createShirtType(retreat.id, {
			name: 'Azul',
			availableSizes: ['S', 'M'],
			sizePrices: [
				{ size: 'S', price: 150 },
				{ size: 'M', price: 160 },
			],
		});
		// Flush §25.3: el update con sizePrices abre una transacción y el log
		// del create aún puede estar en vuelo.
		await waitForLogs((r) => rowsOf(r, 'shirt_type.create').length > 0);

		await updateShirtType(created!.id, { name: 'Azul marino', sizePrices: [{ size: 'S', price: 170 }] });

		const rows = await waitForLogs((r) => rowsOf(r, 'shirt_type.update').length > 0);
		const row = rowsOf(rows, 'shirt_type.update')[0];
		expect(row.retreatId).toBe(retreat.id);
		expect(JSON.parse(row.oldValues!)).toMatchObject({ name: 'Azul' });
		expect(JSON.parse(row.newValues!)).toMatchObject({ name: 'Azul marino' });
		// El replace completo de precios se cuenta, no se lista (montos = PII
		// financiera del retiro; con el diff de name basta para el rastro).
		expect(meta(row)).toMatchObject({ sizePricesBefore: 2, sizePricesAfter: 1 });
		expect(await priceRepo().count({ where: { shirtTypeId: created!.id } })).toBe(1);
	});

	it('delete cuenta los precios por talla ANTES de borrarlos', async () => {
		const retreat = await TestDataFactory.createTestRetreat();
		const created = await createShirtType(retreat.id, {
			name: 'Chamarra',
			availableSizes: ['X'],
			sizePrices: [{ size: 'X', price: 300 }],
		});
		await waitForLogs((r) => rowsOf(r, 'shirt_type.create').length > 0);

		const ok = await deleteShirtType(created!.id);
		expect(ok).toBe(true);

		const rows = await waitForLogs((r) => rowsOf(r, 'shirt_type.delete').length > 0);
		const row = rowsOf(rows, 'shirt_type.delete')[0];
		expect(row.retreatId).toBe(retreat.id);
		expect(JSON.parse(row.oldValues!)).toMatchObject({ name: 'Chamarra' });
		expect(meta(row)).toMatchObject({ sizes: ['X'], sizePrices: 1 });
	});
});
