/**
 * Functional test para AddRetreatFeesMealsAndDebts20260610120000.
 * Verifica: columnas nuevas en retreat / retreat_participants, tabla
 * participant_debts, y que down()/up() hacen el roundtrip correctamente.
 */
import { setupTestDatabase, teardownTestDatabase, clearTestData } from '../test-setup';
import { TestDataFactory } from '../test-utils/testDataFactory';

describe('AddRetreatFeesMealsAndDebts20260610120000', () => {
	let migration: any;

	beforeAll(async () => {
		await setupTestDatabase();
		const mod = await import(
			'@/migrations/sqlite/20260610120000_AddRetreatFeesMealsAndDebts'
		);
		migration = new mod.AddRetreatFeesMealsAndDebts20260610120000();
	});

	afterAll(async () => {
		await teardownTestDatabase();
	});

	beforeEach(async () => {
		await clearTestData();
	});

	const cols = async (ds: any, table: string): Promise<string[]> =>
		(await ds.query(`PRAGMA table_info(${table})`)).map((c: any) => c.name);

	const tableExists = async (ds: any, table: string): Promise<boolean> =>
		(
			await ds.query(
				`SELECT name FROM sqlite_master WHERE type='table' AND name='${table}'`,
			)
		).length > 0;

	it('agrega el cobro del servidor y el valor de comida en retreat', async () => {
		const ds = TestDataFactory.getDataSource();
		const names = await cols(ds, 'retreat');
		expect(names).toEqual(expect.arrayContaining(['serverFeeAmount', 'mealCost']));
	});

	it('agrega mealCount / takesFridayMeal en retreat_participants', async () => {
		const ds = TestDataFactory.getDataSource();
		const names = await cols(ds, 'retreat_participants');
		expect(names).toEqual(expect.arrayContaining(['mealCount', 'takesFridayMeal']));
	});

	it('crea la tabla participant_debts', async () => {
		const ds = TestDataFactory.getDataSource();
		expect(await tableExists(ds, 'participant_debts')).toBe(true);
		const names = await cols(ds, 'participant_debts');
		expect(names).toEqual(
			expect.arrayContaining([
				'id',
				'participantId',
				'retreatId',
				'amount',
				'description',
				'recordedBy',
				'createdAt',
				'updatedAt',
			]),
		);
	});

	it('down() elimina columnas + tabla y up() las recrea', async () => {
		const ds = TestDataFactory.getDataSource();
		const qr = ds.createQueryRunner();

		await migration.down(qr);
		expect(await tableExists(ds, 'participant_debts')).toBe(false);
		let retreatCols = await cols(ds, 'retreat');
		expect(retreatCols).not.toContain('serverFeeAmount');
		expect(retreatCols).not.toContain('mealCost');
		let rpCols = await cols(ds, 'retreat_participants');
		expect(rpCols).not.toContain('mealCount');
		expect(rpCols).not.toContain('takesFridayMeal');

		await migration.up(qr);
		expect(await tableExists(ds, 'participant_debts')).toBe(true);
		retreatCols = await cols(ds, 'retreat');
		expect(retreatCols).toEqual(expect.arrayContaining(['serverFeeAmount', 'mealCost']));
		rpCols = await cols(ds, 'retreat_participants');
		expect(rpCols).toEqual(expect.arrayContaining(['mealCount', 'takesFridayMeal']));

		await qr.release();
	});
});
