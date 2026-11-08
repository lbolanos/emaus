/**
 * Test of AddRetreatWhatsappInboxEnabled20261108120000 (specs/whatsapp-inbox
 * v1.1, D13): guarded ADD COLUMN on `retreat` — simple template.
 */
import { DataSource } from 'typeorm';
import { AddRetreatWhatsappInboxEnabled20261108120000 } from '@/migrations/sqlite/20261108120000_AddRetreatWhatsappInboxEnabled';

describe('AddRetreatWhatsappInboxEnabled20261108120000', () => {
	let ds: DataSource;
	let migration: AddRetreatWhatsappInboxEnabled20261108120000;

	async function hasColumn(): Promise<boolean> {
		const cols = await ds.query(`PRAGMA table_info("retreat")`);
		return (cols as Array<{ name: string }>).some((c) => c.name === 'whatsappInboxEnabled');
	}

	beforeEach(async () => {
		ds = new DataSource({ type: 'sqlite', database: ':memory:', synchronize: false });
		await ds.initialize();
		await ds.query(`CREATE TABLE "retreat" ("id" VARCHAR PRIMARY KEY, "parish" VARCHAR)`);
		await ds.query(
			`INSERT INTO "retreat" ("id", "parish") VALUES ('r1', 'San Agustín')`,
		);
		migration = new AddRetreatWhatsappInboxEnabled20261108120000();
	});

	afterEach(async () => {
		await ds.destroy();
	});

	it('up() adds the column with default 0 without touching rows', async () => {
		await migration.up(ds.createQueryRunner());

		expect(await hasColumn()).toBe(true);
		const row = await ds.query(`SELECT whatsappInboxEnabled AS v FROM "retreat" WHERE id='r1'`);
		expect(row[0].v).toBe(0);
	});

	it('is idempotent: re-running does not blow up (PRAGMA guard)', async () => {
		await migration.up(ds.createQueryRunner());
		await expect(migration.up(ds.createQueryRunner())).resolves.toBeUndefined();
	});

	it('down() removes the column (native DROP COLUMN)', async () => {
		await migration.up(ds.createQueryRunner());
		await migration.down(ds.createQueryRunner());

		expect(await hasColumn()).toBe(false);
		const row = await ds.query(`SELECT parish FROM "retreat" WHERE id='r1'`);
		expect(row[0].parish).toBe('San Agustín');
	});
});
