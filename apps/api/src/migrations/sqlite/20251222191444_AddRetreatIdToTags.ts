import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRetreatIdToTags20251222191444 implements MigrationInterface {
	public async up(queryRunner: QueryRunner): Promise<void> {
		const targetRetreatId = '274951b2-9d9e-4992-a201-3248dcd2a473';

		console.log('[MIGRATION] AddRetreatIdToTags - Starting...');
		console.log(`[MIGRATION] Target retreat ID: ${targetRetreatId}`);

		// Check if tags table exists (it might not exist if CreateTagSystem hasn't run yet)
		const tableExists = await queryRunner.query(`
			SELECT name FROM sqlite_master WHERE type='table' AND name='tags'
		`);

		if (tableExists.length === 0) {
			console.log('[MIGRATION] Tags table does not exist yet - CreateTagSystem will create it with retreatId. Skipping this migration.');
			return;
		}

		// Check if retreatId column already exists
		const tableInfo = await queryRunner.query(`PRAGMA table_info("tags")`);
		const hasRetreatId = tableInfo.some((col: any) => col.name === 'retreatId');

		if (hasRetreatId) {
			console.log('[MIGRATION] Tags table already has retreatId column. Skipping this migration.');
			return;
		}

		// 1. Verificar que el retiro existe
		console.log('[MIGRATION] Checking if target retreat exists...');
		const retreatExists = await queryRunner.query(`
			SELECT COUNT(*) as count FROM "retreat" WHERE "id" = '${targetRetreatId}'
		`);
		if (retreatExists[0].count === 0) {
			throw new Error(`Target retreat ${targetRetreatId} does not exist`);
		}
		console.log('[MIGRATION] Target retreat exists');

		// 2. Backup de la tabla tags
		console.log('[MIGRATION] Creating backup of tags table...');
		await queryRunner.query(`CREATE TABLE "tags_backup" AS SELECT * FROM "tags"`);
		console.log('[MIGRATION] Backup created');

		// 3. Agregar columna retreatId con default value
		console.log('[MIGRATION] Adding retreatId column to tags table...');
		await queryRunner.query(`
			ALTER TABLE "tags"
			ADD COLUMN "retreatId" varchar NOT NULL DEFAULT '${targetRetreatId}'
		`);
		console.log('[MIGRATION] retreatId column added');

		// 4. Recrear tabla con foreign key (SQLite no soporta ALTER CONSTRAINT directamente)
		console.log('[MIGRATION] Recreating tags table with foreign key constraint...');

		// Crear tabla nueva con todas las columnas y la foreign key
		await queryRunner.query(`
			CREATE TABLE "tags_new" (
				"id" varchar PRIMARY KEY,
				"name" varchar(100) NOT NULL,
				"color" varchar(50),
				"description" text,
				"retreatId" varchar NOT NULL,
				"createdAt" datetime DEFAULT (datetime('now')),
				"updatedAt" datetime DEFAULT (datetime('now')),
				FOREIGN KEY ("retreatId") REFERENCES "retreat"("id") ON DELETE CASCADE
			)
		`);

		// Copiar datos de la tabla vieja a la nueva
		await queryRunner.query(`
			INSERT INTO "tags_new" ("id", "name", "color", "description", "retreatId", "createdAt", "updatedAt")
			SELECT "id", "name", "color", "description", "retreatId", "createdAt", "updatedAt"
			FROM "tags"
		`);

		// Eliminar tabla vieja y renombrar la nueva
		await queryRunner.query(`DROP TABLE "tags"`);
		await queryRunner.query(`ALTER TABLE "tags_new" RENAME TO "tags"`);
		console.log('[MIGRATION] Tags table recreated with foreign key');

		// 5. Eliminar el índice único anterior en 'name' (si existe)
		try {
			await queryRunner.query(`DROP INDEX IF EXISTS "tags_name_unique"`);
		} catch (e) {
			// El índice puede no existir o tener otro nombre, continuar
		}

		// 6. Crear índice único compuesto (retreatId, name)
		console.log('[MIGRATION] Creating composite unique index on (retreatId, name)...');
		await queryRunner.query(`
			CREATE UNIQUE INDEX "idx_tags_retreatId_name"
			ON "tags"("retreatId", "name")
		`);
		console.log('[MIGRATION] Composite unique index created');

		// 7. Crear índice para filtrado por retreatId
		console.log('[MIGRATION] Creating index on retreatId...');
		await queryRunner.query(`
			CREATE INDEX "idx_tags_retreatId"
			ON "tags"("retreatId")
		`);
		console.log('[MIGRATION] Index on retreatId created');

		// 8. Log estadísticas de migración
		const tagCount = await queryRunner.query(`SELECT COUNT(*) as count FROM "tags"`);
		console.log(`[MIGRATION] Total tags migrated: ${tagCount[0].count}`);
		console.log('[MIGRATION] AddRetreatIdToTags - Completed successfully');
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		console.log('[MIGRATION ROLLBACK] AddRetreatIdToTags - Rolling back...');

		// Recrear tabla sin retreatId
		await queryRunner.query(`
			CREATE TABLE "tags_old" (
				"id" varchar PRIMARY KEY,
				"name" varchar(100) NOT NULL UNIQUE,
				"color" varchar(50),
				"description" text,
				"createdAt" datetime DEFAULT (datetime('now')),
				"updatedAt" datetime DEFAULT (datetime('now'))
			)
		`);

		// Copiar datos sin retreatId
		await queryRunner.query(`
			INSERT INTO "tags_old" ("id", "name", "color", "description", "createdAt", "updatedAt")
			SELECT "id", "name", "color", "description", "createdAt", "updatedAt"
			FROM "tags"
		`);

		// Eliminar tabla actual y renombrar
		await queryRunner.query(`DROP TABLE "tags"`);
		await queryRunner.query(`ALTER TABLE "tags_old" RENAME TO "tags"`);

		// Eliminar índices nuevos
		await queryRunner.query(`DROP INDEX IF EXISTS "idx_tags_retreatId_name"`);
		await queryRunner.query(`DROP INDEX IF EXISTS "idx_tags_retreatId"`);

		console.log('[MIGRATION ROLLBACK] AddRetreatIdToTags - Rollback completed');
	}
}
