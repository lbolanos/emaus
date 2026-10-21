/**
 * Functional checks for AddRegistrationOpenToRetreat20261021130000.
 *
 * The column separates registration openness from landing visibility. The
 * migration default is 1 ON PURPOSE: every existing public retreat must keep
 * accepting registrations exactly as before the deploy. New retreats are born
 * closed via the entity default (false), not via this column default.
 *
 * Verified here: up() is idempotent (the dev API auto-applies pending
 * migrations on every nodemon restart), and a down()/up() round trip keeps
 * pre-existing rows open (registrationOpen = 1).
 */
import { setupTestDatabase, teardownTestDatabase, clearTestData } from '../test-setup';
import { TestDataFactory } from '../test-utils/testDataFactory';

describe('AddRegistrationOpenToRetreat20261021130000', () => {
	let migration: any;

	beforeAll(async () => {
		await setupTestDatabase();
		const mod = await import(
			'@/migrations/sqlite/20261021130000_AddRegistrationOpenToRetreat'
		);
		migration = new mod.AddRegistrationOpenToRetreat20261021130000();
	});

	afterAll(async () => {
		await teardownTestDatabase();
	});

	beforeEach(async () => {
		await clearTestData();
	});

	async function runUp() {
		const ds = TestDataFactory.getDataSource();
		const qr = ds.createQueryRunner();
		await migration.up(qr);
		await qr.release();
	}

	async function runDown() {
		const ds = TestDataFactory.getDataSource();
		const qr = ds.createQueryRunner();
		await migration.down(qr);
		await qr.release();
	}

	async function columnExists(): Promise<boolean> {
		const ds = TestDataFactory.getDataSource();
		const columns: { name: string }[] = await ds.query(`PRAGMA table_info("retreat")`);
		return columns.some((c) => c.name === 'registrationOpen');
	}

	it('up() is idempotent when the column already exists (entity-sync test DB)', async () => {
		// The test schema is created from entities, so the column is there
		// already — same situation as a re-run in dev after a partial apply.
		expect(await columnExists()).toBe(true);
		await expect(runUp()).resolves.toBeUndefined();
		await expect(runUp()).resolves.toBeUndefined();
		expect(await columnExists()).toBe(true);
	});

	it('down()/up() round trip keeps existing rows open (DEFAULT 1)', async () => {
		const retreat = await TestDataFactory.createTestRetreat();

		await runDown();
		expect(await columnExists()).toBe(false);

		await runUp();
		expect(await columnExists()).toBe(true);

		const rows = await TestDataFactory.getDataSource().query(
			`SELECT registrationOpen FROM retreat WHERE id = ?`,
			[retreat.id],
		);
		expect(rows).toHaveLength(1);
		// SQLite stores booleans as 0/1; 1 = open (behavior preserved).
		expect(Number(rows[0].registrationOpen)).toBe(1);
	});
});
