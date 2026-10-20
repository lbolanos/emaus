import { setupTestDatabase, teardownTestDatabase, clearTestData } from '../test-setup';
import { TestDataFactory } from '../test-utils/testDataFactory';
import { AppDataSource } from '@/data-source';
import { AddTableMemoryPhoto20261019150000 } from '@/migrations/sqlite/20261019150000_AddTableMemoryPhoto';

/**
 * Seed-and-verify for the table memory-photo columns. The test DB uses
 * `synchronize` from the entities, so the columns already exist here — the
 * guards make `up()` a functional no-op that must still run clean, and
 * `down()`/`up()` prove the real ALTER TABLEs round-trip.
 */
describe('AddTableMemoryPhoto20261019150000 — photo columns on tables', () => {
	beforeAll(async () => {
		await setupTestDatabase();
	});
	afterAll(async () => {
		await teardownTestDatabase();
	});
	beforeEach(async () => {
		await clearTestData();
	});

	it('up() is idempotent when the columns already exist (entity-synchronized schema)', async () => {
		const migration = new AddTableMemoryPhoto20261019150000();
		const qr = AppDataSource.createQueryRunner();

		await migration.up(qr);
		await migration.up(qr); // must not die with "duplicate column name"

		const columns: { name: string }[] = await qr.query(`PRAGMA table_info("tables")`);
		expect(columns.some((c) => c.name === 'photoUrl')).toBe(true);
		expect(columns.some((c) => c.name === 'photoS3Key')).toBe(true);

		await qr.release();
	});

	it('keeps existing table rows intact through up() and a down()+up() round-trip', async () => {
		const retreat = await TestDataFactory.createTestRetreat({});
		await TestDataFactory.createTestTables(retreat.id, 2);

		const migration = new AddTableMemoryPhoto20261019150000();
		const qr = AppDataSource.createQueryRunner();

		const countOfTables = async () => {
			const rows = await qr.query(`SELECT COUNT(*) AS c FROM "tables"`);
			return Number(rows[0].c);
		};
		const before = await countOfTables();
		expect(before).toBeGreaterThanOrEqual(2);

		await migration.up(qr);
		// New columns are nullable: seeded rows survive with NULL photo.
		expect(await countOfTables()).toBe(before);
		const photos = await qr.query(`SELECT photoUrl, photoS3Key FROM "tables"`);
		expect(photos.every((r: any) => r.photoUrl === null && r.photoS3Key === null)).toBe(true);

		await migration.down(qr);
		let columns: { name: string }[] = await qr.query(`PRAGMA table_info("tables")`);
		expect(columns.some((c) => c.name === 'photoUrl')).toBe(false);
		expect(columns.some((c) => c.name === 'photoS3Key')).toBe(false);
		// Rows survive the DROP COLUMN too.
		expect(await countOfTables()).toBe(before);

		await migration.up(qr);
		columns = await qr.query(`PRAGMA table_info("tables")`);
		expect(columns.some((c) => c.name === 'photoUrl')).toBe(true);
		expect(columns.some((c) => c.name === 'photoS3Key')).toBe(true);
		expect(await countOfTables()).toBe(before);

		await qr.release();
	});
});
