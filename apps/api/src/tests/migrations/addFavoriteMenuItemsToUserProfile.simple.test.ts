import { setupTestDatabase, teardownTestDatabase } from '../test-setup';
import { AppDataSource } from '@/data-source';
import { AddFavoriteMenuItemsToUserProfile20261019210000 } from '@/migrations/sqlite/20261019210000_AddFavoriteMenuItemsToUserProfile';

/**
 * The test DB is synchronized from the entities, so favoriteMenuItems already
 * exists. down() drops it and up() must add it back: existing rows get NULL
 * (never seeded), and a second up() is a no-op (idempotency guard). After
 * down() the entity no longer matches the table, so everything here is raw
 * SQL — and the test DB enforces FKs, so the user row is inserted first.
 */
describe('AddFavoriteMenuItemsToUserProfile — user_profiles favorite column', () => {
	beforeAll(async () => {
		await setupTestDatabase();
	});
	afterAll(async () => {
		await teardownTestDatabase();
	});

	const columnNames = async (): Promise<string[]> =>
		(await AppDataSource.query(`PRAGMA table_info("user_profiles")`)).map(
			(c: { name: string }) => c.name,
		);

	it('down() drops the column and up() restores it as NULL on existing rows', async () => {
		const migration = new AddFavoriteMenuItemsToUserProfile20261019210000();
		const qr = AppDataSource.createQueryRunner();
		const userId = '11111111-1111-4111-8111-111111111111';
		try {
			await migration.down(qr);
			expect(await columnNames()).not.toEqual(
				expect.arrayContaining(['favoriteMenuItems']),
			);

			await qr.query(
				`INSERT INTO users (id, email, displayName, password, createdAt, updatedAt)
				 VALUES ('${userId}', 'fav-mig@test.local', 'Fav Migration', 'x', datetime('now'), datetime('now'))`,
			);
			await qr.query(`INSERT INTO user_profiles (userId) VALUES ('${userId}')`);

			await migration.up(qr);
			expect(await columnNames()).toEqual(
				expect.arrayContaining(['favoriteMenuItems']),
			);
			const [row] = await qr.query(
				`SELECT favoriteMenuItems FROM user_profiles WHERE userId = '${userId}'`,
			);
			expect(row).toEqual({ favoriteMenuItems: null });

			// Re-running up() must not die with "duplicate column name".
			await expect(migration.up(qr)).resolves.toBeUndefined();
		} finally {
			await qr.query(`DELETE FROM user_profiles WHERE userId = '${userId}'`);
			await qr.query(`DELETE FROM users WHERE id = '${userId}'`);
			await qr.release();
		}
	});
});
