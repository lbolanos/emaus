/**
 * Test de AddParticipantIdentityUpdatePermission (2026-10-19).
 *
 * Migración data-only: crea `participant:identity:update` (D2 de
 * specs/participant-email-change) y lo concede a superadmin y admin — el
 * "administrador del retiro" de la operación real. NOTA: la spec habla de un
 * rol Coordinator que no existe en la base (deviation D2, ver tasks.md);
 * quien atiende inscripciones en la práctica es admin.
 *
 * Verifica que concede EXACTAMENTE eso — ni más roles ni duplicados — y que
 * down() borra solo este permiso y sus concesiones (otro permiso de
 * participant debe sobrevivir).
 *
 * DataSource :memory: con las tres tablas mínimas.
 */
import { DataSource } from 'typeorm';
import { AddParticipantIdentityUpdatePermission20261019120000 } from '@/migrations/sqlite/20261019120000_AddParticipantIdentityUpdatePermission';

describe('AddParticipantIdentityUpdatePermission20261019120000', () => {
	let ds: DataSource;
	let migration: AddParticipantIdentityUpdatePermission20261019120000;

	async function rolesWithPermission(): Promise<string[]> {
		const rows = await ds.query(`
			SELECT r."name" AS name
			FROM "role_permissions" rp
			JOIN "roles" r ON r."id" = rp."roleId"
			JOIN "permissions" p ON p."id" = rp."permissionId"
			WHERE p."resource" = 'participant' AND p."operation" = 'identity:update'
			ORDER BY name
		`);
		return rows.map((row: { name: string }) => row.name);
	}

	beforeEach(async () => {
		ds = new DataSource({
			type: 'sqlite',
			database: ':memory:',
			synchronize: false,
		});
		await ds.initialize();
		// Schema igual al real (INTEGER PRIMARY KEY AUTOINCREMENT en los ids): la
		// migración inserta sin id y lee el generado — con un TEXT PK a secas los
		// ids quedarían NULL y los JOIN no matchean.
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

		// Un permiso preexistente de participant, concedido a admin: down() de la
		// migración nueva no debe tocarlo.
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

		migration = new AddParticipantIdentityUpdatePermission20261019120000();
	});

	afterEach(async () => {
		await ds.destroy();
	});

	it('crea el permiso y lo concede a superadmin y admin, nadie más', async () => {
		await migration.up(ds.createQueryRunner());

		await expect(rolesWithPermission()).resolves.toEqual(['admin', 'superadmin']);
		// El permiso queda registrado con resource+operation correctos.
		const perm = await ds.query(
			`SELECT "resource", "operation" FROM "permissions" WHERE "operation" = 'identity:update'`,
		);
		expect(perm).toEqual([{ resource: 'participant', operation: 'identity:update' }]);
	});

	it('es idempotente: correrlo dos veces no duplica permiso ni concesiones', async () => {
		await migration.up(ds.createQueryRunner());
		await migration.up(ds.createQueryRunner());

		const permCount = await ds.query(
			`SELECT COUNT(*) AS c FROM "permissions" WHERE "operation" = 'identity:update'`,
		);
		expect(permCount[0].c).toBe(1);
		await expect(rolesWithPermission()).resolves.toEqual(['admin', 'superadmin']);
	});

	it('down() borra el permiso y sus concesiones sin tocar otros permisos', async () => {
		await migration.up(ds.createQueryRunner());
		await migration.down(ds.createQueryRunner());

		const permCount = await ds.query(
			`SELECT COUNT(*) AS c FROM "permissions" WHERE "operation" = 'identity:update'`,
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
		await ds.query(`DELETE FROM "roles" WHERE "name" = 'admin'`);

		await expect(migration.up(ds.createQueryRunner())).resolves.toBeUndefined();
		await expect(rolesWithPermission()).resolves.toEqual(['superadmin']);
	});
});
