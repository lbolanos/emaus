import { MigrationInterface, QueryRunner } from 'typeorm';

export class FixTestimonialsRetreatFk20260118150000 implements MigrationInterface {
	public async up(queryRunner: QueryRunner): Promise<void> {
		// Step 1: Create new table with correct foreign key
		await queryRunner.query(`
			CREATE TABLE "testimonials_new" (
				"id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
				"userId" varchar NOT NULL,
				"retreatId" varchar,
				"content" text NOT NULL,
				"visibility" varchar NOT NULL DEFAULT 'private',
				"allowLandingPage" boolean DEFAULT false NOT NULL,
				"approvedForLanding" boolean DEFAULT false NOT NULL,
				"createdAt" datetime DEFAULT (datetime('now')) NOT NULL,
				"updatedAt" datetime DEFAULT (datetime('now')) NOT NULL,
				FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE,
				FOREIGN KEY ("retreatId") REFERENCES "retreat"("id") ON DELETE SET NULL
			)
		`);

		// Step 2: Copy data from old table to new table
		await queryRunner.query(`
			INSERT INTO "testimonials_new" ("id", "userId", "retreatId", "content", "visibility", "allowLandingPage", "approvedForLanding", "createdAt", "updatedAt")
			SELECT "id", "userId", "retreatId", "content", "visibility", "allowLandingPage", "approvedForLanding", "createdAt", "updatedAt"
			FROM "testimonials"
		`);

		// Step 3: Drop old table
		await queryRunner.query(`DROP TABLE "testimonials"`);

		// Step 4: Rename new table to original name
		await queryRunner.query(`ALTER TABLE "testimonials_new" RENAME TO "testimonials"`);

		// Step 5: Recreate indexes
		await queryRunner.query(`
			CREATE INDEX IF NOT EXISTS "IDX_testimonials_userId"
			ON "testimonials" ("userId")
		`);

		await queryRunner.query(`
			CREATE INDEX IF NOT EXISTS "IDX_testimonials_retreatId"
			ON "testimonials" ("retreatId")
		`);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		// Revert by recreating with wrong FK (for rollback only)
		await queryRunner.query(`
			CREATE TABLE "testimonials_old" (
				"id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
				"userId" varchar NOT NULL,
				"retreatId" varchar,
				"content" text NOT NULL,
				"visibility" varchar NOT NULL DEFAULT 'private',
				"allowLandingPage" boolean DEFAULT false NOT NULL,
				"approvedForLanding" boolean DEFAULT false NOT NULL,
				"createdAt" datetime DEFAULT (datetime('now')) NOT NULL,
				"updatedAt" datetime DEFAULT (datetime('now')) NOT NULL,
				FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE,
				FOREIGN KEY ("retreatId") REFERENCES "retreats"("id") ON DELETE SET NULL
			)
		`);

		await queryRunner.query(`
			INSERT INTO "testimonials_old" ("id", "userId", "retreatId", "content", "visibility", "allowLandingPage", "approvedForLanding", "createdAt", "updatedAt")
			SELECT "id", "userId", "retreatId", "content", "visibility", "allowLandingPage", "approvedForLanding", "createdAt", "updatedAt"
			FROM "testimonials"
		`);

		await queryRunner.query(`DROP TABLE "testimonials"`);
		await queryRunner.query(`ALTER TABLE "testimonials_old" RENAME TO "testimonials"`);

		await queryRunner.query(`DROP INDEX IF EXISTS "IDX_testimonials_userId"`);
		await queryRunner.query(`DROP INDEX IF EXISTS "IDX_testimonials_retreatId"`);

		await queryRunner.query(`
			CREATE INDEX IF NOT EXISTS "IDX_testimonials_userId"
			ON "testimonials" ("userId")
		`);

		await queryRunner.query(`
			CREATE INDEX IF NOT EXISTS "IDX_testimonials_retreatId"
			ON "testimonials" ("retreatId")
		`);
	}
}
