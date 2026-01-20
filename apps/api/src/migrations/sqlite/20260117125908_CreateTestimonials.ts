import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateTestimonials20260117125908 implements MigrationInterface {
	public async up(queryRunner: QueryRunner): Promise<void> {
		// Create testimonials table
		await queryRunner.query(`
			CREATE TABLE IF NOT EXISTS "testimonials" (
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

		// Create index for faster user testimonial lookups
		await queryRunner.query(`
			CREATE INDEX IF NOT EXISTS "IDX_testimonials_userId"
			ON "testimonials" ("userId")
		`);

		// Create index for faster retreat testimonial lookups
		await queryRunner.query(`
			CREATE INDEX IF NOT EXISTS "IDX_testimonials_retreatId"
			ON "testimonials" ("retreatId")
		`);

		// Add testimonialVisibilityDefault column to user_profiles table
		await queryRunner.query(`
			ALTER TABLE "user_profiles" ADD COLUMN "testimonialVisibilityDefault" varchar DEFAULT 'private'
		`);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		// Drop indexes
		await queryRunner.query(`DROP INDEX IF EXISTS "IDX_testimonials_retreatId"`);
		await queryRunner.query(`DROP INDEX IF EXISTS "IDX_testimonials_userId"`);

		// Drop testimonials table
		await queryRunner.query(`DROP TABLE IF EXISTS "testimonials"`);

		// Remove testimonialVisibilityDefault from user_profiles
		await queryRunner.query(
			`ALTER TABLE "user_profiles" DROP COLUMN "testimonialVisibilityDefault"`,
		);
	}
}
