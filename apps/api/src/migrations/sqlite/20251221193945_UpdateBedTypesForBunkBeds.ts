import { MigrationInterface, QueryRunner } from 'typeorm';

export class UpdateBedTypesForBunkBeds20251221193945 implements MigrationInterface {
	name = 'UpdateBedTypesForBunkBeds';
	timestamp = '20251221193945';

	public async up(queryRunner: QueryRunner): Promise<void> {
		console.log('[MIGRATION] UpdateBedTypesForBunkBeds - Starting...');

		// Step 1: Drop the view that depends on retreat_bed
		await queryRunner.query(`DROP VIEW IF EXISTS participant_bed_assignments`);

		// Step 2: Recreate bed table with new CHECK constraint (SQLite doesn't support ALTER CONSTRAINT)
		console.log('[MIGRATION] Recreating bed table with new constraint...');

		// Create new bed table with updated constraint
		await queryRunner.query(`
			CREATE TABLE "bed_new" (
				"id" VARCHAR(36) PRIMARY KEY NOT NULL,
				"roomNumber" VARCHAR(255) NOT NULL,
				"bedNumber" VARCHAR(255) NOT NULL,
				"floor" INTEGER,
				"type" TEXT NOT NULL DEFAULT ('normal') CHECK ("type" IN ('normal', 'litera_abajo', 'litera_arriba', 'colchon')),
				"defaultUsage" TEXT NOT NULL DEFAULT ('caminante') CHECK ("defaultUsage" IN ('caminante', 'servidor')),
				"houseId" VARCHAR(36) NOT NULL,
				FOREIGN KEY ("houseId") REFERENCES "house" ("id") ON DELETE CASCADE
			)
		`);

		// Copy data, transforming 'litera' to 'litera_abajo' during the insert
		await queryRunner.query(`
			INSERT INTO "bed_new" ("id", "roomNumber", "bedNumber", "floor", "type", "defaultUsage", "houseId")
			SELECT "id", "roomNumber", "bedNumber", "floor",
				CASE WHEN "type" = 'litera' THEN 'litera_abajo' ELSE "type" END,
				"defaultUsage", "houseId"
			FROM "bed"
		`);

		// Drop old table and rename new table
		await queryRunner.query(`DROP TABLE "bed"`);
		await queryRunner.query(`ALTER TABLE "bed_new" RENAME TO "bed"`);
		console.log('[MIGRATION] Bed table recreated with new constraint');

		// Step 3: Recreate retreat_bed table with new CHECK constraint
		console.log('[MIGRATION] Recreating retreat_bed table with new constraint...');

		await queryRunner.query(`
			CREATE TABLE "retreat_bed_new" (
				"id" VARCHAR(36) PRIMARY KEY NOT NULL,
				"roomNumber" VARCHAR(255) NOT NULL,
				"bedNumber" VARCHAR(255) NOT NULL,
				"floor" INTEGER,
				"type" TEXT NOT NULL CHECK ("type" IN ('normal', 'litera_abajo', 'litera_arriba', 'colchon')),
				"defaultUsage" TEXT NOT NULL CHECK ("defaultUsage" IN ('caminante', 'servidor')),
				"retreatId" VARCHAR(36) NOT NULL,
				"participantId" VARCHAR(36),
				FOREIGN KEY ("retreatId") REFERENCES "retreat" ("id") ON DELETE CASCADE,
				FOREIGN KEY ("participantId") REFERENCES "participants" ("id") ON DELETE SET NULL
			)
		`);

		// Copy data, transforming 'litera' to 'litera_abajo' during the insert
		await queryRunner.query(`
			INSERT INTO "retreat_bed_new" ("id", "roomNumber", "bedNumber", "floor", "type", "defaultUsage", "retreatId", "participantId")
			SELECT "id", "roomNumber", "bedNumber", "floor",
				CASE WHEN "type" = 'litera' THEN 'litera_abajo' ELSE "type" END,
				"defaultUsage", "retreatId", "participantId"
			FROM "retreat_bed"
		`);

		// Drop old table and rename new table
		await queryRunner.query(`DROP TABLE "retreat_bed"`);
		await queryRunner.query(`ALTER TABLE "retreat_bed_new" RENAME TO "retreat_bed"`);
		console.log('[MIGRATION] Retreat_bed table recreated with new constraint');

		// Step 4: Recreate the view
		await queryRunner.query(`
			CREATE VIEW participant_bed_assignments AS
			SELECT p.id as participantId,
				p.firstName,
				p.lastName,
				p.retreatId,
				rb.id as retreatBedId,
				rb.roomNumber,
				rb.bedNumber,
				rb.floor,
				rb.type as bedType,
				rb.defaultUsage
			FROM participants p
			LEFT JOIN retreat_bed rb ON rb.participantId = p.id
			WHERE p.isCancelled = 0
		`);

		// Log statistics
		const bedCount = await queryRunner.query(`SELECT COUNT(*) as count FROM "bed"`);
		const retreatBedCount = await queryRunner.query(`SELECT COUNT(*) as count FROM "retreat_bed"`);
		console.log(`[MIGRATION] Total beds migrated: ${bedCount[0].count}`);
		console.log(`[MIGRATION] Total retreat beds migrated: ${retreatBedCount[0].count}`);
		console.log('[MIGRATION] UpdateBedTypesForBunkBeds - Completed successfully');
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		console.log('[MIGRATION ROLLBACK] UpdateBedTypesForBunkBeds - Rolling back...');

		// Step 1: Revert all 'litera_abajo' and 'litera_arriba' back to 'litera'
		await queryRunner.query(`
			UPDATE "bed"
			SET "type" = 'litera'
			WHERE "type" IN ('litera_abajo', 'litera_arriba')
		`);

		await queryRunner.query(`
			UPDATE "retreat_bed"
			SET "type" = 'litera'
			WHERE "type" IN ('litera_abajo', 'litera_arriba')
		`);

		// Step 2: Recreate bed table with original constraint
		await queryRunner.query(`
			CREATE TABLE "bed_old" (
				"id" VARCHAR(36) PRIMARY KEY NOT NULL,
				"roomNumber" VARCHAR(255) NOT NULL,
				"bedNumber" VARCHAR(255) NOT NULL,
				"floor" INTEGER,
				"type" TEXT NOT NULL DEFAULT ('normal') CHECK ("type" IN ('normal', 'litera', 'colchon')),
				"defaultUsage" TEXT NOT NULL DEFAULT ('caminante') CHECK ("defaultUsage" IN ('caminante', 'servidor')),
				"houseId" VARCHAR(36) NOT NULL,
				FOREIGN KEY ("houseId") REFERENCES "house" ("id") ON DELETE CASCADE
			)
		`);

		await queryRunner.query(`
			INSERT INTO "bed_old" ("id", "roomNumber", "bedNumber", "floor", "type", "defaultUsage", "houseId")
			SELECT "id", "roomNumber", "bedNumber", "floor", "type", "defaultUsage", "houseId"
			FROM "bed"
		`);

		await queryRunner.query(`DROP TABLE "bed"`);
		await queryRunner.query(`ALTER TABLE "bed_old" RENAME TO "bed"`);

		// Step 3: Recreate retreat_bed table with original constraint
		await queryRunner.query(`
			CREATE TABLE "retreat_bed_old" (
				"id" VARCHAR(36) PRIMARY KEY NOT NULL,
				"roomNumber" VARCHAR(255) NOT NULL,
				"bedNumber" VARCHAR(255) NOT NULL,
				"floor" INTEGER,
				"type" TEXT NOT NULL CHECK ("type" IN ('normal', 'litera', 'colchon')),
				"defaultUsage" TEXT NOT NULL CHECK ("defaultUsage" IN ('caminante', 'servidor')),
				"retreatId" VARCHAR(36) NOT NULL,
				"participantId" VARCHAR(36),
				FOREIGN KEY ("retreatId") REFERENCES "retreat" ("id") ON DELETE CASCADE,
				FOREIGN KEY ("participantId") REFERENCES "participants" ("id") ON DELETE SET NULL
			)
		`);

		await queryRunner.query(`
			INSERT INTO "retreat_bed_old" ("id", "roomNumber", "bedNumber", "floor", "type", "defaultUsage", "retreatId", "participantId")
			SELECT "id", "roomNumber", "bedNumber", "floor", "type", "defaultUsage", "retreatId", "participantId"
			FROM "retreat_bed"
		`);

		await queryRunner.query(`DROP TABLE "retreat_bed"`);
		await queryRunner.query(`ALTER TABLE "retreat_bed_old" RENAME TO "retreat_bed"`);

		console.log('[MIGRATION ROLLBACK] UpdateBedTypesForBunkBeds - Rollback completed');
	}
}
