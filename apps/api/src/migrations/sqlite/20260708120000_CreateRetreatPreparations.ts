import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Preparaciones semanales previas al retiro (calendario público + documentos).
 *
 * Dos tablas:
 *  - retreat_preparation           (entrada del calendario: sesión semanal o festivo)
 *  - retreat_preparation_document  (documentos adjuntos por sesión; S3 public-assets)
 *
 * `transaction = false`: requerido por el guard sqliteSafePattern por el
 * DROP TABLE del down(); el up() solo hace CREATE/INSERT.
 */
export class CreateRetreatPreparations20260708120000 implements MigrationInterface {
	name = 'CreateRetreatPreparations20260708120000';
	timestamp = '20260708120000';
	transaction = false;

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`
			CREATE TABLE "retreat_preparation" (
				"id" varchar PRIMARY KEY NOT NULL,
				"retreatId" varchar NOT NULL,
				"type" varchar NOT NULL DEFAULT 'session',
				"weekNumber" integer,
				"title" varchar NOT NULL,
				"description" text,
				"date" date,
				"time" varchar(5),
				"sortOrder" integer NOT NULL DEFAULT 0,
				"createdAt" datetime NOT NULL DEFAULT (datetime('now')),
				"updatedAt" datetime NOT NULL DEFAULT (datetime('now')),
				FOREIGN KEY ("retreatId") REFERENCES "retreat" ("id") ON DELETE CASCADE
			)
		`);
		await queryRunner.query(
			`CREATE INDEX "IDX_retreat_preparation_retreat_date" ON "retreat_preparation" ("retreatId", "date")`,
		);

		await queryRunner.query(`
			CREATE TABLE "retreat_preparation_document" (
				"id" varchar PRIMARY KEY NOT NULL,
				"preparationId" varchar NOT NULL,
				"kind" varchar NOT NULL DEFAULT 'file',
				"content" text,
				"fileName" varchar NOT NULL,
				"mimeType" varchar NOT NULL,
				"sizeBytes" integer NOT NULL DEFAULT 0,
				"url" text NOT NULL,
				"storageKey" varchar,
				"sortOrder" integer NOT NULL DEFAULT 0,
				"createdAt" datetime NOT NULL DEFAULT (datetime('now')),
				FOREIGN KEY ("preparationId") REFERENCES "retreat_preparation" ("id") ON DELETE CASCADE
			)
		`);
		await queryRunner.query(
			`CREATE INDEX "IDX_retreat_preparation_document_prep" ON "retreat_preparation_document" ("preparationId")`,
		);

		// Permisos
		await queryRunner.query(`
			INSERT OR IGNORE INTO "permissions" ("resource", "operation", "description") VALUES
			('retreatPreparation', 'read', 'View pre-retreat weekly preparations calendar'),
			('retreatPreparation', 'manage', 'Create, edit, skip and attach documents to weekly preparations')
		`);

		const perms = await queryRunner.query(
			`SELECT id, resource, operation FROM "permissions" WHERE "resource" = 'retreatPreparation'`,
		);
		const permMap: Record<string, number> = {};
		perms.forEach((p: any) => (permMap[`${p.resource}:${p.operation}`] = p.id));

		const rolesResult = await queryRunner.query(`SELECT id, name FROM "roles"`);
		const roles: Record<string, number> = {};
		rolesResult.forEach((r: any) => (roles[r.name] = r.id));

		// Espejo de la matriz de roles de preRetreatTask.
		const grants: Array<{ role: string; perms: string[] }> = [
			{ role: 'superadmin', perms: ['retreatPreparation:read', 'retreatPreparation:manage'] },
			{ role: 'admin', perms: ['retreatPreparation:read', 'retreatPreparation:manage'] },
			{ role: 'region_admin', perms: ['retreatPreparation:read', 'retreatPreparation:manage'] },
			{ role: 'communications', perms: ['retreatPreparation:read'] },
			{ role: 'treasurer', perms: ['retreatPreparation:read'] },
			{ role: 'logistics', perms: ['retreatPreparation:read', 'retreatPreparation:manage'] },
			{ role: 'regular_server', perms: ['retreatPreparation:read'] },
			{ role: 'regular', perms: ['retreatPreparation:read'] },
		];

		for (const { role, perms: ps } of grants) {
			const roleId = roles[role];
			if (!roleId) continue;
			for (const permKey of ps) {
				const permId = permMap[permKey];
				if (!permId) continue;
				const exists = await queryRunner.query(
					`SELECT COUNT(*) AS c FROM "role_permissions" WHERE "roleId" = ? AND "permissionId" = ?`,
					[roleId, permId],
				);
				if (exists[0].c === 0) {
					await queryRunner.query(
						`INSERT INTO "role_permissions" ("roleId", "permissionId") VALUES (?, ?)`,
						[roleId, permId],
					);
				}
			}
		}
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			`DELETE FROM "role_permissions" WHERE "permissionId" IN (SELECT id FROM "permissions" WHERE "resource" = 'retreatPreparation')`,
		);
		await queryRunner.query(`DELETE FROM "permissions" WHERE "resource" = 'retreatPreparation'`);
		await queryRunner.query(`DROP INDEX IF EXISTS "IDX_retreat_preparation_document_prep"`);
		await queryRunner.query(`DROP TABLE IF EXISTS "retreat_preparation_document"`);
		await queryRunner.query(`DROP INDEX IF EXISTS "IDX_retreat_preparation_retreat_date"`);
		await queryRunner.query(`DROP TABLE IF EXISTS "retreat_preparation"`);
	}
}
