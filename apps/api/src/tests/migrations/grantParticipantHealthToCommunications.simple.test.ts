/**
 * Test de GrantParticipantHealthToCommunications (2026-10-07).
 *
 * Migración data-only: concede `participant:health` al rol `communications`.
 * Lo que hay que verificar es que concede exactamente eso — ni más roles ni
 * duplicados — y que el down() quita solo esa concesión (las de superadmin,
 * admin, treasurer y logistics deben sobrevivir).
 *
 * DataSource :memory: con las tres tablas mínimas: no depende del
 * setupTestDatabase ni de factories.
 */
import { DataSource } from 'typeorm';
import { GrantParticipantHealthToCommunications20261007100000 } from '@/migrations/sqlite/20261007100000_GrantParticipantHealthToCommunications';

describe('GrantParticipantHealthToCommunications20261007100000', () => {
	let ds: DataSource;
	let migration: GrantParticipantHealthToCommunications20261007100000;

	async function rolesWithHealth(): Promise<string[]> {
		const rows = await ds.query(`
			SELECT r."name" AS name
			FROM "role_permissions" rp
			JOIN "roles" r ON r."id" = rp."roleId"
			JOIN "permissions" p ON p."id" = rp."permissionId"
			WHERE p."resource" = 'participant' AND p."operation" = 'health'
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
		await ds.query(`
			CREATE TABLE "permissions" (
				"id" TEXT PRIMARY KEY,
				"resource" VARCHAR NOT NULL,
				"operation" VARCHAR NOT NULL,
				"description" VARCHAR
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
				"roleId" INTEGER NOT NULL,
				"permissionId" TEXT NOT NULL,
				PRIMARY KEY ("roleId", "permissionId")
			)
		`);

		await ds.query(
			`INSERT INTO "permissions" ("id", "resource", "operation") VALUES ('perm-health', 'participant', 'health')`,
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
		// Estado pre-migración: las concesiones originales de 20260914.
		for (const roleId of [1, 4, 5, 6]) {
			await ds.query(
				`INSERT INTO "role_permissions" ("roleId", "permissionId") VALUES (?, 'perm-health')`,
				[roleId],
			);
		}

		migration = new GrantParticipantHealthToCommunications20261007100000();
	});

	afterEach(async () => {
		await ds.destroy();
	});

	it('concede el permiso a communications y no toca ningún otro rol', async () => {
		await migration.up(ds.createQueryRunner());

		await expect(rolesWithHealth()).resolves.toEqual([
			'admin',
			'communications',
			'logistics',
			'superadmin',
			'treasurer',
		]);
	});

	it('es idempotente: correrlo dos veces no duplica la concesión', async () => {
		await migration.up(ds.createQueryRunner());
		await migration.up(ds.createQueryRunner());

		const count = await ds.query(
			`SELECT COUNT(*) AS c FROM "role_permissions"
			WHERE "roleId" = 7 AND "permissionId" = 'perm-health'`,
		);
		expect(count[0].c).toBe(1);
	});

	it('down() quita SOLO la concesión de communications', async () => {
		await migration.up(ds.createQueryRunner());
		await migration.down(ds.createQueryRunner());

		await expect(rolesWithHealth()).resolves.toEqual([
			'admin',
			'logistics',
			'superadmin',
			'treasurer',
		]);
	});

	it('up() no revienta si el permiso aún no existe (migración 20260914 pendiente)', async () => {
		await ds.query(`DELETE FROM "role_permissions"`);
		await ds.query(`DELETE FROM "permissions"`);

		await expect(migration.up(ds.createQueryRunner())).resolves.toBeUndefined();
	});
});
