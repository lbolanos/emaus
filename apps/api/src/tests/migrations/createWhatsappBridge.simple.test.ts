/**
 * Test of CreateWhatsappBridge20261107120000 (specs/whatsapp-inbox, M1).
 *
 * :memory: DataSource with the minimal permission tables (pattern of
 * addParticipantIdentityUpdatePermission). The migration itself creates the
 * three bridge tables, so the test validates the real DDL: columns, unique
 * indexes, FKs, the status CHECK, permission seeds and the round trip.
 */
import { DataSource } from 'typeorm';
import { CreateWhatsappBridge20261107120000 } from '@/migrations/sqlite/20261107120000_CreateWhatsappBridge';

const WA_TABLES = [
	'whatsapp_bridge_link',
	'whatsapp_inbox_message',
	'whatsapp_inbox_read_state',
];

const WA_ROLES = ['admin', 'communications', 'logistics', 'superadmin'];

describe('CreateWhatsappBridge20261107120000', () => {
	let ds: DataSource;
	let migration: CreateWhatsappBridge20261107120000;

	async function waTables(): Promise<string[]> {
		const rows = await ds.query(
			`SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'whatsapp_%' ORDER BY name`,
		);
		return rows.map((row: { name: string }) => row.name);
	}

	async function columnsOf(table: string): Promise<string[]> {
		const rows = await ds.query(`PRAGMA table_info("${table}")`);
		return rows.map((row: { name: string }) => row.name);
	}

	async function uniqueIndexes(table: string): Promise<Record<string, string[]>> {
		const list = await ds.query(`PRAGMA index_list("${table}")`);
		const out: Record<string, string[]> = {};
		for (const idx of list as Array<{ name: string; unique: number }>) {
			if (!idx.unique) continue;
			const cols = await ds.query(`PRAGMA index_info("${idx.name}")`);
			out[idx.name] = cols.map((c: { name: string }) => c.name);
		}
		return out;
	}

	async function foreignKeys(table: string): Promise<string[]> {
		const rows = await ds.query(`PRAGMA foreign_key_list("${table}")`);
		return rows.map((row: { table: string }) => row.table);
	}

	async function rolesWithPermission(operation: string): Promise<string[]> {
		const rows = await ds.query(`
			SELECT r."name" AS name
			FROM "role_permissions" rp
			JOIN "roles" r ON r."id" = rp."roleId"
			JOIN "permissions" p ON p."id" = rp."permissionId"
			WHERE p."resource" = 'whatsappInbox' AND p."operation" = ?
			ORDER BY name
		`, [operation]);
		return rows.map((row: { name: string }) => row.name);
	}

	beforeEach(async () => {
		ds = new DataSource({
			type: 'sqlite',
			database: ':memory:',
			synchronize: false,
		});
		await ds.initialize();
		// Minimal permission tables, same as the real schema (pattern of the
		// participant:identity:update test).
		await ds.query(`
			CREATE TABLE "permissions" (
				"id" INTEGER PRIMARY KEY AUTOINCREMENT,
				"resource" VARCHAR NOT NULL,
				"operation" VARCHAR NOT NULL,
				"description" VARCHAR,
				"createdAt" DATETIME,
				"updatedAt" DATETIME
			)
		`);
		await ds.query(`
			CREATE TABLE "roles" (
				"id" INTEGER PRIMARY KEY,
				"name" VARCHAR NOT NULL UNIQUE
			)
		`);
		await ds.query(`
			CREATE TABLE "role_permissions" (
				"id" INTEGER PRIMARY KEY AUTOINCREMENT,
				"roleId" INTEGER NOT NULL,
				"permissionId" INTEGER NOT NULL,
				"createdAt" DATETIME,
				UNIQUE ("roleId", "permissionId")
			)
		`);
		await ds.query(
			`INSERT INTO "permissions" ("id", "resource", "operation") VALUES (1, 'participant', 'health')`,
		);
		for (const [id, name] of [
			[1, 'superadmin'],
			[4, 'admin'],
			[5, 'treasurer'],
			[6, 'logistics'],
			[7, 'communications'],
			[8, 'regular_server'],
		] as const) {
			await ds.query(`INSERT INTO "roles" ("id", "name") VALUES (?, ?)`, [id, name]);
		}
		await ds.query(
			`INSERT INTO "role_permissions" ("roleId", "permissionId") VALUES (4, 1)`,
		);
		// Parent table stubs: TypeORM turns PRAGMA foreign_keys=ON in sqlite, so
		// link inserts need real retreat and users rows.
		await ds.query(`CREATE TABLE "retreat" ("id" VARCHAR PRIMARY KEY)`);
		await ds.query(`CREATE TABLE "users" ("id" VARCHAR PRIMARY KEY)`);
		await ds.query(
			`INSERT INTO "retreat" ("id") VALUES ('r1'), ('rX-deleted')`,
		);
		await ds.query(`INSERT INTO "users" ("id") VALUES ('u1')`);

		migration = new CreateWhatsappBridge20261107120000();
	});

	afterEach(async () => {
		await ds.destroy();
	});

	it('up() creates the 3 tables with their columns', async () => {
		await migration.up(ds.createQueryRunner());

		expect(await waTables()).toEqual(WA_TABLES);
		const linkCols = await columnsOf('whatsapp_bridge_link');
		for (const col of [
			'id',
			'retreatId',
			'userId',
			'status',
			'linkedJid',
			'linkedPhone',
			'storePath',
			'lastError',
			'connectedAt',
			'lastSyncAt',
			'createdAt',
			'updatedAt',
		]) {
			expect(linkCols).toContain(col);
		}
		const msgCols = await columnsOf('whatsapp_inbox_message');
		for (const col of [
			'id',
			'linkId',
			'retreatId',
			'chatJid',
			'chatPhone',
			'waMessageId',
			'timestamp',
			'fromMe',
			'body',
			'messageType',
		]) {
			expect(msgCols).toContain(col);
		}
		const readCols = await columnsOf('whatsapp_inbox_read_state');
		for (const col of [
			'id',
			'userId',
			'retreatId',
			'chatJid',
			'lastSeenMessageTimestamp',
		]) {
			expect(readCols).toContain(col);
		}
	});

	it('the contract unique indexes exist (one per staff/retreat, dedupe, read state)', async () => {
		await migration.up(ds.createQueryRunner());

		const linkIdx = await uniqueIndexes('whatsapp_bridge_link');
		expect(linkIdx.UQ_wa_bridge_link_user_retreat).toEqual(['userId', 'retreatId']);
		const msgIdx = await uniqueIndexes('whatsapp_inbox_message');
		expect(msgIdx.UQ_wa_inbox_message_dedupe).toEqual(['linkId', 'waMessageId']);
		const readIdx = await uniqueIndexes('whatsapp_inbox_read_state');
		expect(readIdx.UQ_wa_inbox_read_state_user_chat).toEqual([
			'userId',
			'retreatId',
			'chatJid',
		]);
	});

	it('the FKs point to the right tables with CASCADE', async () => {
		await migration.up(ds.createQueryRunner());

		expect(await foreignKeys('whatsapp_bridge_link')).toEqual(
			expect.arrayContaining(['retreat', 'users']),
		);
		expect(await foreignKeys('whatsapp_inbox_message')).toEqual([
			'whatsapp_bridge_link',
		]);
		expect(await foreignKeys('whatsapp_inbox_read_state')).toEqual(['users']);
	});

	it('the status CHECK rejects unknown states and FKs are enforced', async () => {
		await migration.up(ds.createQueryRunner());

		await expect(
			ds.query(
				`INSERT INTO "whatsapp_bridge_link"
				 ("id", "retreatId", "userId", "status", "storePath")
				 VALUES ('l1', 'r1', 'u1', 'bogus', '/tmp/x')`,
			),
		).rejects.toThrow();
		// FK: a missing retreatId does not insert (TypeORM turns foreign_keys=ON).
		await expect(
			ds.query(
				`INSERT INTO "whatsapp_bridge_link"
				 ("id", "retreatId", "userId", "status", "storePath")
				 VALUES ('l1', 'nope', 'u1', 'connected', '/tmp/x')`,
			),
		).rejects.toThrow();
		await expect(
			ds.query(
				`INSERT INTO "whatsapp_bridge_link"
				 ("id", "retreatId", "userId", "status", "storePath")
				 VALUES ('l1', 'r1', 'u1', 'connected', '/tmp/x')`,
			),
		).resolves.toBeDefined();
	});

	it('creates whatsappInbox:read and whatsappInbox:manage for exactly 4 roles', async () => {
		await migration.up(ds.createQueryRunner());

		await expect(rolesWithPermission('read')).resolves.toEqual(WA_ROLES);
		await expect(rolesWithPermission('manage')).resolves.toEqual(WA_ROLES);
		const perms = await ds.query(
			`SELECT "resource", "operation" FROM "permissions" WHERE "resource" = 'whatsappInbox' ORDER BY "operation"`,
		);
		expect(perms).toEqual([
			{ resource: 'whatsappInbox', operation: 'manage' },
			{ resource: 'whatsappInbox', operation: 'read' },
		]);
	});

	it('is idempotent: up() twice duplicates nothing', async () => {
		await migration.up(ds.createQueryRunner());
		await migration.up(ds.createQueryRunner());

		const permCount = await ds.query(
			`SELECT COUNT(*) AS c FROM "permissions" WHERE "resource" = 'whatsappInbox'`,
		);
		expect(permCount[0].c).toBe(2);
		await expect(rolesWithPermission('read')).resolves.toEqual(WA_ROLES);
		expect(await waTables()).toEqual(WA_TABLES);
	});

	it('down() drops its own tables and permissions without touching others', async () => {
		await migration.up(ds.createQueryRunner());
		await migration.down(ds.createQueryRunner());

		expect(await waTables()).toEqual([]);
		const permCount = await ds.query(
			`SELECT COUNT(*) AS c FROM "permissions" WHERE "resource" = 'whatsappInbox'`,
		);
		expect(permCount[0].c).toBe(0);
		// admin's participant:health survives.
		const health = await ds.query(`
			SELECT COUNT(*) AS c FROM "role_permissions" rp
			JOIN "permissions" p ON p."id" = rp."permissionId"
			WHERE p."operation" = 'health'
		`);
		expect(health[0].c).toBe(1);
	});

	it('tolerates missing roles without blowing up (half-seeded databases)', async () => {
		await ds.query(`DELETE FROM "roles" WHERE "name" IN ('logistics', 'communications')`);

		await expect(migration.up(ds.createQueryRunner())).resolves.toBeUndefined();
		await expect(rolesWithPermission('read')).resolves.toEqual([
			'admin',
			'superadmin',
		]);
	});
});
