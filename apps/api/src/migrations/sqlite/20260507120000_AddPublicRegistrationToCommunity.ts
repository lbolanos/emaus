import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Public community registration:
 *   1. Recrea la tabla community para permitir createdBy NULL (registro público sin usuario).
 *   2. Añade columnas de status (pending|active|rejected) + datos extra (parish, diocese, redes sociales,
 *      contacto del responsable, timestamps de aprobación y razón de rechazo).
 *   3. Backfill: comunidades existentes quedan en status='active'.
 */
export class AddPublicRegistrationToCommunity20260507120000 implements MigrationInterface {
	name = 'AddPublicRegistrationToCommunity20260507120000';
	timestamp = '20260507120000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		// SQLite no permite ALTER COLUMN ni DROP NOT NULL → recrear la tabla.
		await queryRunner.query(`PRAGMA foreign_keys = OFF`);

		await queryRunner.query(`
			CREATE TABLE "community_new" (
				"id" VARCHAR(36) PRIMARY KEY NOT NULL,
				"name" VARCHAR(200) NOT NULL,
				"description" TEXT,
				"address1" VARCHAR(255) NOT NULL,
				"address2" VARCHAR(255),
				"city" VARCHAR(255) NOT NULL,
				"state" VARCHAR(255) NOT NULL,
				"zipCode" VARCHAR(255) NOT NULL,
				"country" VARCHAR(255) NOT NULL,
				"latitude" REAL,
				"longitude" REAL,
				"googleMapsUrl" VARCHAR(500),
				"createdBy" VARCHAR(36),
				"status" VARCHAR(20) NOT NULL DEFAULT 'active' CHECK ("status" IN ('pending', 'active', 'rejected')),
				"parish" VARCHAR(255),
				"diocese" VARCHAR(255),
				"website" VARCHAR(500),
				"facebookUrl" VARCHAR(500),
				"instagramUrl" VARCHAR(500),
				"contactName" VARCHAR(255),
				"contactEmail" VARCHAR(255),
				"contactPhone" VARCHAR(50),
				"submittedAt" DATETIME,
				"approvedAt" DATETIME,
				"approvedBy" VARCHAR(36),
				"rejectionReason" TEXT,
				"defaultMeetingDayOfWeek" VARCHAR(20),
				"defaultMeetingInterval" INTEGER,
				"defaultMeetingTime" VARCHAR(5),
				"defaultMeetingDurationMinutes" INTEGER,
				"defaultMeetingDescription" TEXT,
				"createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
				"updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
				FOREIGN KEY ("createdBy") REFERENCES "users" ("id") ON DELETE SET NULL,
				FOREIGN KEY ("approvedBy") REFERENCES "users" ("id") ON DELETE SET NULL
			)
		`);

		// Copiar datos existentes — todas las comunidades previas quedan como 'active'.
		await queryRunner.query(`
			INSERT INTO "community_new" (
				"id", "name", "description", "address1", "address2", "city", "state",
				"zipCode", "country", "latitude", "longitude", "googleMapsUrl",
				"createdBy", "status", "createdAt", "updatedAt"
			)
			SELECT
				"id", "name", "description", "address1", "address2", "city", "state",
				"zipCode", "country", "latitude", "longitude", "googleMapsUrl",
				"createdBy", 'active', "createdAt", "updatedAt"
			FROM "community"
		`);

		await queryRunner.query(`DROP TABLE "community"`);
		await queryRunner.query(`ALTER TABLE "community_new" RENAME TO "community"`);

		await queryRunner.query(
			`CREATE INDEX IF NOT EXISTS "IDX_community_status" ON "community" ("status")`,
		);

		await queryRunner.query(`PRAGMA foreign_keys = ON`);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`PRAGMA foreign_keys = OFF`);
		await queryRunner.query(`DROP INDEX IF EXISTS "IDX_community_status"`);

		await queryRunner.query(`
			CREATE TABLE "community_old" (
				"id" VARCHAR(36) PRIMARY KEY NOT NULL,
				"name" VARCHAR(200) NOT NULL,
				"description" TEXT,
				"address1" VARCHAR(255) NOT NULL,
				"address2" VARCHAR(255),
				"city" VARCHAR(255) NOT NULL,
				"state" VARCHAR(255) NOT NULL,
				"zipCode" VARCHAR(255) NOT NULL,
				"country" VARCHAR(255) NOT NULL,
				"latitude" REAL,
				"longitude" REAL,
				"googleMapsUrl" VARCHAR(500),
				"createdBy" VARCHAR(36) NOT NULL,
				"createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
				"updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
				FOREIGN KEY ("createdBy") REFERENCES "users" ("id") ON DELETE RESTRICT
			)
		`);

		// Solo copiar comunidades que tienen createdBy y status='active' (las que cabían en el esquema viejo).
		await queryRunner.query(`
			INSERT INTO "community_old" (
				"id", "name", "description", "address1", "address2", "city", "state",
				"zipCode", "country", "latitude", "longitude", "googleMapsUrl",
				"createdBy", "createdAt", "updatedAt"
			)
			SELECT
				"id", "name", "description", "address1", "address2", "city", "state",
				"zipCode", "country", "latitude", "longitude", "googleMapsUrl",
				"createdBy", "createdAt", "updatedAt"
			FROM "community"
			WHERE "createdBy" IS NOT NULL
		`);

		await queryRunner.query(`DROP TABLE "community"`);
		await queryRunner.query(`ALTER TABLE "community_old" RENAME TO "community"`);
		await queryRunner.query(`PRAGMA foreign_keys = ON`);
	}
}
