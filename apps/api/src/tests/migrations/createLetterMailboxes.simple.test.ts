/**
 * Test de CreateLetterMailboxes (2026-11-05, specs/letters-email T2).
 *
 * Migration solo-add: 3 columnas de buzón en retreat_participants + índice
 * único parcial del código + tablas letters/letter_attachments + índices +
 * seed de permisos letter:read/update/print/manage con grants a
 * superadmin/admin/logistics/communications.
 *
 * Verifica: columnas e índices creados (por sqlite_master, no por el estado
 * del repo — la DB de test sincroniza desde entities SIN índices), el único
 * parcial rechaza códigos duplicados y acepta múltiples NULL, idempotencia del
 * up(), reversa completa del down(), y que los grants llegan exactamente a los
 * 4 roles. DataSource :memory: con las tablas mínimas.
 */
import { DataSource } from 'typeorm';
import { CreateLetterMailboxes20261105100000 } from '@/migrations/sqlite/20261105100000_CreateLetterMailboxes';

describe('CreateLetterMailboxes20261105100000', () => {
	let ds: DataSource;
	let migration: CreateLetterMailboxes20261105100000;

	async function indexExists(name: string): Promise<boolean> {
		const rows = await ds.query(`SELECT name FROM sqlite_master WHERE type='index' AND name=?`, [
			name,
		]);
		return rows.length > 0;
	}

	async function tableExists(name: string): Promise<boolean> {
		const rows = await ds.query(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`, [
			name,
		]);
		return rows.length > 0;
	}

	async function rpColumnNames(): Promise<string[]> {
		const rows = await ds.query(`PRAGMA table_info("retreat_participants")`);
		return (rows as { name: string }[]).map((r) => r.name);
	}

	async function rolesWithPermission(operation: string): Promise<string[]> {
		const rows = await ds.query(`
			SELECT r."name" AS name
			FROM "role_permissions" rp
			JOIN "roles" r ON r."id" = rp."roleId"
			JOIN "permissions" p ON p."id" = rp."permissionId"
			WHERE p."resource" = 'letter' AND p."operation" = ?
			ORDER BY name
		`, [operation]);
		return (rows as { name: string }[]).map((row) => row.name);
	}

	beforeEach(async () => {
		ds = new DataSource({ type: 'sqlite', database: ':memory:', synchronize: false });
		await ds.initialize();
		// retreat_participants SIN las columnas nuevas (estado pre-migration).
		await ds.query(`
			CREATE TABLE "retreat_participants" (
				"id" VARCHAR(36) PRIMARY KEY NOT NULL,
				"retreatId" VARCHAR(36) NOT NULL,
				"participantId" VARCHAR(36),
				"type" VARCHAR,
				"isCancelled" boolean NOT NULL DEFAULT 0
			)
		`);
		// Padres para las FKs de letters (FK enforcement off por defecto en los
		// tests, pero las tablas deben existir para que CREATE TABLE no falle).
		await ds.query(`CREATE TABLE "retreat" ("id" VARCHAR(36) PRIMARY KEY NOT NULL)`);
		await ds.query(`CREATE TABLE "users" ("id" VARCHAR(36) PRIMARY KEY NOT NULL)`);
		await ds.query(`
			CREATE TABLE "permissions" (
				"id" INTEGER PRIMARY KEY AUTOINCREMENT,
				"resource" VARCHAR NOT NULL,
				"operation" VARCHAR NOT NULL,
				"description" VARCHAR,
				UNIQUE ("resource", "operation")
			)
		`);
		await ds.query(`CREATE TABLE "roles" ("id" INTEGER PRIMARY KEY, "name" VARCHAR NOT NULL UNIQUE)`);
		await ds.query(`
			CREATE TABLE "role_permissions" (
				"id" INTEGER PRIMARY KEY AUTOINCREMENT,
				"roleId" INTEGER NOT NULL,
				"permissionId" INTEGER NOT NULL,
				UNIQUE ("roleId", "permissionId")
			)
		`);
		for (const [id, name] of [
			[1, 'superadmin'],
			[4, 'admin'],
			[6, 'logistics'],
			[7, 'communications'],
			[8, 'regular_server'],
		] as const) {
			await ds.query(`INSERT INTO "roles" ("id", "name") VALUES (?, ?)`, [id, name]);
		}
		migration = new CreateLetterMailboxes20261105100000();
	});

	afterEach(async () => {
		await ds.destroy();
	});

	it('up() crea columnas, índices, tablas y permisos con grants exactos', async () => {
		await migration.up(ds.createQueryRunner());

		const columns = await rpColumnNames();
		expect(columns).toContain('mailboxCode');
		expect(columns).toContain('mailboxEnabled');
		expect(columns).toContain('mailboxIssuedAt');

		expect(await indexExists('UQ_retreat_participants_mailbox_code')).toBe(true);
		expect(await indexExists('UQ_letters_message_id')).toBe(true);
		expect(await indexExists('IDX_letters_retreat_status')).toBe(true);
		expect(await tableExists('letters')).toBe(true);
		expect(await tableExists('letter_attachments')).toBe(true);

		// Los 4 permisos existen y llegan exactamente a superadmin/admin/logistics/
		// communications — regular_server fuera.
		for (const operation of ['read', 'update', 'print', 'manage']) {
			await expect(rolesWithPermission(operation)).resolves.toEqual([
				'admin',
				'communications',
				'logistics',
				'superadmin',
			]);
		}
	});

	it('el índice único parcial rechaza códigos duplicados y permite NULLs múltiples', async () => {
		await migration.up(ds.createQueryRunner());

		await ds.query(
			`INSERT INTO "retreat_participants" ("id", "retreatId", "mailboxCode") VALUES ('a1', 'r1', 'AB23CD45')`,
		);
		await expect(
			ds.query(
				`INSERT INTO "retreat_participants" ("id", "retreatId", "mailboxCode") VALUES ('a2', 'r1', 'AB23CD45')`,
			),
		).rejects.toThrow();
		// Sin código (NULL): varios rows, sin constraint.
		await ds.query(
			`INSERT INTO "retreat_participants" ("id", "retreatId") VALUES ('a3', 'r1')`,
		);
		await ds.query(
			`INSERT INTO "retreat_participants" ("id", "retreatId") VALUES ('a4', 'r1')`,
		);
	});

	it('up() es idempotente: correrlo dos veces no duplica nada', async () => {
		await migration.up(ds.createQueryRunner());
		await migration.up(ds.createQueryRunner());

		const permCount = await ds.query(
			`SELECT COUNT(*) AS c FROM "permissions" WHERE "resource" = 'letter'`,
		);
		expect(permCount[0].c).toBe(4);
		expect(await rpColumnNames().then((c) => c.filter((n) => n.startsWith('mailbox')).length)).toBe(3);
	});

	it('down() revierte todo: columnas, índices, tablas y permisos', async () => {
		await migration.up(ds.createQueryRunner());
		// Padres válidos para la FK de la carta de prueba (la DS de test sí
		// enforcea FKs — memoria reference_test_db_enforces_fks).
		await ds.query(`INSERT INTO "retreat" ("id") VALUES ('r1')`);
		await ds.query(
			`INSERT INTO "retreat_participants" ("id", "retreatId", "mailboxCode") VALUES ('a1', 'r1', 'AB23CD45')`,
		);
		// Deja una carta puesta para confirmar que down() la borra con la tabla.
		await ds.query(`
			INSERT INTO "letters" ("id", "retreatId", "retreatParticipantId", "fromEmail", "bodyText", "receivedAt")
			VALUES ('l1', 'r1', 'a1', 'alguien@ejemplo.com', 'hola', datetime('now'))
		`);
		await migration.down(ds.createQueryRunner());

		const columns = await rpColumnNames();
		expect(columns).not.toContain('mailboxCode');
		expect(columns).not.toContain('mailboxEnabled');
		expect(columns).not.toContain('mailboxIssuedAt');
		expect(await tableExists('letters')).toBe(false);
		expect(await tableExists('letter_attachments')).toBe(false);
		expect(await indexExists('UQ_retreat_participants_mailbox_code')).toBe(false);
		const permCount = await ds.query(
			`SELECT COUNT(*) AS c FROM "permissions" WHERE "resource" = 'letter'`,
		);
		expect(permCount[0].c).toBe(0);
	});

	it('tolera roles ausentes sin reventar (bases sembradas a medias)', async () => {
		await ds.query(`DELETE FROM "roles" WHERE "name" = 'communications'`);
		await expect(migration.up(ds.createQueryRunner())).resolves.toBeUndefined();
		await expect(rolesWithPermission('read')).resolves.toEqual(['admin', 'logistics', 'superadmin']);
	});
});
