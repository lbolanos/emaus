/**
 * Test de CreateWhatsappBridge20261107120000 (specs/whatsapp-inbox, M1).
 *
 * DataSource :memory: con las tablas mínimas de permisos (molde de
 * addParticipantIdentityUpdatePermission). Las tres tablas del puente las
 * crea la propia migración, así que el test valida el DDL real: columnas,
 * índices únicos, FKs, CHECK de status, seeds de permisos y round-trip.
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
		// Tablas mínimas de permisos, igual al schema real (molde del test de
		// participant:identity:update).
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
		// Stubs de las tablas padre: TypeORM activa PRAGMA foreign_keys=ON en
		// sqlite, así que los inserts de link necesitan retreat y users reales.
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

	it('up() crea las 3 tablas con sus columnas', async () => {
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

	it('los índices únicos del contrato están (uno por staff/retiro, dedupe, read-state)', async () => {
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

	it('las FKs apuntan a las tablas correctas con CASCADE', async () => {
		await migration.up(ds.createQueryRunner());

		expect(await foreignKeys('whatsapp_bridge_link')).toEqual(
			expect.arrayContaining(['retreat', 'users']),
		);
		expect(await foreignKeys('whatsapp_inbox_message')).toEqual([
			'whatsapp_bridge_link',
		]);
		expect(await foreignKeys('whatsapp_inbox_read_state')).toEqual(['users']);
	});

	it('el CHECK de status rechaza estados desconocidos y las FKs se enforcean', async () => {
		await migration.up(ds.createQueryRunner());

		await expect(
			ds.query(
				`INSERT INTO "whatsapp_bridge_link"
				 ("id", "retreatId", "userId", "status", "storePath")
				 VALUES ('l1', 'r1', 'u1', 'bogus', '/tmp/x')`,
			),
		).rejects.toThrow();
		// FK: un retreatId inexistente no inserta (TypeORM prende foreign_keys=ON).
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

	it('crea whatsappInbox:read y whatsappInbox:manage para exactamente 4 roles', async () => {
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

	it('es idempotente: up() dos veces no duplica nada', async () => {
		await migration.up(ds.createQueryRunner());
		await migration.up(ds.createQueryRunner());

		const permCount = await ds.query(
			`SELECT COUNT(*) AS c FROM "permissions" WHERE "resource" = 'whatsappInbox'`,
		);
		expect(permCount[0].c).toBe(2);
		await expect(rolesWithPermission('read')).resolves.toEqual(WA_ROLES);
		expect(await waTables()).toEqual(WA_TABLES);
	});

	it('down() borra tablas y permisos propios sin tocar los ajenos', async () => {
		await migration.up(ds.createQueryRunner());
		await migration.down(ds.createQueryRunner());

		expect(await waTables()).toEqual([]);
		const permCount = await ds.query(
			`SELECT COUNT(*) AS c FROM "permissions" WHERE "resource" = 'whatsappInbox'`,
		);
		expect(permCount[0].c).toBe(0);
		// participant:health de admin sobrevive.
		const health = await ds.query(`
			SELECT COUNT(*) AS c FROM "role_permissions" rp
			JOIN "permissions" p ON p."id" = rp."permissionId"
			WHERE p."operation" = 'health'
		`);
		expect(health[0].c).toBe(1);
	});

	it('tolera roles ausentes sin reventar (bases sembradas a medias)', async () => {
		await ds.query(`DELETE FROM "roles" WHERE "name" IN ('logistics', 'communications')`);

		await expect(migration.up(ds.createQueryRunner())).resolves.toBeUndefined();
		await expect(rolesWithPermission('read')).resolves.toEqual([
			'admin',
			'superadmin',
		]);
	});
});
