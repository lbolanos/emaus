/**
 * AddWhatsappInboxMessageActions20261108140000 (specs/whatsapp-inbox v1.3):
 * guarded ADD COLUMN on whatsapp_inbox_message — simple template.
 */
import { DataSource } from 'typeorm';
import { AddWhatsappInboxMessageActions20261108140000 } from '@/migrations/sqlite/20261108140000_AddWhatsappInboxMessageActions';

const NEW_COLUMNS = [
	'mediaMime',
	'mediaFileName',
	'paymentId',
	'paymentRegisteredById',
	'paymentRegisteredAt',
	'letterId',
	'letterAddedById',
	'letterAddedAt',
];

describe('AddWhatsappInboxMessageActions20261108140000', () => {
	let ds: DataSource;
	let migration: AddWhatsappInboxMessageActions20261108140000;

	async function columns(): Promise<string[]> {
		const cols = await ds.query(`PRAGMA table_info("whatsapp_inbox_message")`);
		return (cols as Array<{ name: string }>).map((c) => c.name);
	}

	beforeEach(async () => {
		ds = new DataSource({ type: 'sqlite', database: ':memory:', synchronize: false });
		await ds.initialize();
		await ds.query(
			`CREATE TABLE "whatsapp_inbox_message" ("id" VARCHAR PRIMARY KEY, "body" TEXT)`,
		);
		await ds.query(`INSERT INTO "whatsapp_inbox_message" ("id", "body") VALUES ('m1', 'hola')`);
		migration = new AddWhatsappInboxMessageActions20261108140000();
	});

	afterEach(async () => {
		await ds.destroy();
	});

	it('up() adds every column as nullable without touching rows', async () => {
		await migration.up(ds.createQueryRunner());

		const cols = await columns();
		for (const name of NEW_COLUMNS) expect(cols).toContain(name);
		const row = await ds.query(
			`SELECT body, paymentId, letterId FROM "whatsapp_inbox_message" WHERE id='m1'`,
		);
		expect(row[0]).toEqual({ body: 'hola', paymentId: null, letterId: null });
	});

	it('is idempotent (PRAGMA guard)', async () => {
		await migration.up(ds.createQueryRunner());
		await expect(migration.up(ds.createQueryRunner())).resolves.toBeUndefined();
	});

	it('down() drops the columns and keeps the data', async () => {
		await migration.up(ds.createQueryRunner());
		await migration.down(ds.createQueryRunner());

		const cols = await columns();
		for (const name of NEW_COLUMNS) expect(cols).not.toContain(name);
		const row = await ds.query(`SELECT body FROM "whatsapp_inbox_message" WHERE id='m1'`);
		expect(row[0].body).toBe('hola');
	});
});
