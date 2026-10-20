import { setupTestDatabase, teardownTestDatabase } from '../test-setup';
import { AppDataSource } from '@/data-source';
import { AddDocumentFieldsToScheduleTemplate20261019120000 } from '@/migrations/sqlite/20261019120000_AddDocumentFieldsToScheduleTemplate';

/**
 * The test DB is synchronized from the entities, so both columns already exist.
 * down() removes them and up() must add them back: existing rows get
 * documentName NULL and documentAudience 'responsables', and a second up() is a
 * no-op (idempotency guard). After down() the entity no longer matches the table,
 * so everything here is raw SQL.
 */
describe('AddDocumentFieldsToScheduleTemplate — schedule_template document columns', () => {
	beforeAll(async () => {
		await setupTestDatabase();
	});
	afterAll(async () => {
		await teardownTestDatabase();
	});

	const columnNames = async (): Promise<string[]> =>
		(await AppDataSource.query(`PRAGMA table_info("schedule_template")`)).map(
			(c: { name: string }) => c.name,
		);

	it('down() drops the columns and up() restores them with defaults on existing rows', async () => {
		const migration = new AddDocumentFieldsToScheduleTemplate20261019120000();
		const qr = AppDataSource.createQueryRunner();
		try {
			await migration.down(qr);
			expect(await columnNames()).not.toEqual(
				expect.arrayContaining(['documentName']),
			);
			expect(await columnNames()).not.toEqual(
				expect.arrayContaining(['documentAudience']),
			);

			await qr.query(
				`INSERT INTO schedule_template (id, name) VALUES ('tpl-doc-1', 'Dinámica La Pared')`,
			);

			await migration.up(qr);
			expect(await columnNames()).toEqual(
				expect.arrayContaining(['documentName', 'documentAudience']),
			);
			const [row] = await qr.query(
				`SELECT documentName, documentAudience FROM schedule_template WHERE id = 'tpl-doc-1'`,
			);
			expect(row).toEqual({ documentName: null, documentAudience: 'responsables' });

			// Re-running up() must not die with "duplicate column name".
			await expect(migration.up(qr)).resolves.toBeUndefined();
		} finally {
			await qr.query(`DELETE FROM schedule_template WHERE id = 'tpl-doc-1'`);
			await qr.release();
		}
	});
});
