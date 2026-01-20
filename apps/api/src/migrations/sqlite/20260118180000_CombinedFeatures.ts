import { MigrationInterface, QueryRunner } from 'typeorm';

export class CombinedFeatures20260118180000 implements MigrationInterface {
	public async up(queryRunner: QueryRunner): Promise<void> {
		// ==================== TESTIMONIALS ====================

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
				FOREIGN KEY ("retreatId") REFERENCES "retreat"("id") ON DELETE SET NULL
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

		// ==================== RETREAT MEMORY FIELDS ====================

		// Add memory photo URL field to retreat table
		await queryRunner.query(`
			ALTER TABLE "retreat" ADD COLUMN "memoryPhotoUrl" varchar
		`);

		// Add music playlist URL field to retreat table
		await queryRunner.query(`
			ALTER TABLE "retreat" ADD COLUMN "musicPlaylistUrl" varchar
		`);

		// ==================== PARTICIPANT HISTORY ====================

		// Create participant_history table
		await queryRunner.query(`
			CREATE TABLE IF NOT EXISTS "participant_history" (
				"id" varchar PRIMARY KEY NOT NULL,
				"userId" varchar NOT NULL,
				"participantId" varchar,
				"retreatId" varchar NOT NULL,
				"roleInRetreat" varchar NOT NULL CHECK("roleInRetreat" IN ('walker', 'server', 'leader', 'coordinator', 'charlista')),
				"isPrimaryRetreat" boolean DEFAULT false NOT NULL,
				"notes" text,
				"metadata" json,
				"createdAt" datetime DEFAULT (datetime('now')) NOT NULL,
				FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE,
				FOREIGN KEY ("participantId") REFERENCES "participants"("id") ON DELETE SET NULL,
				FOREIGN KEY ("retreatId") REFERENCES "retreat"("id") ON DELETE CASCADE
			)
		`);

		// Create indexes for faster lookups
		await queryRunner.query(`
			CREATE INDEX IF NOT EXISTS "IDX_participant_history_userId"
			ON "participant_history" ("userId")
		`);

		await queryRunner.query(`
			CREATE INDEX IF NOT EXISTS "IDX_participant_history_retreatId"
			ON "participant_history" ("retreatId")
		`);

		await queryRunner.query(`
			CREATE INDEX IF NOT EXISTS "IDX_participant_history_participantId"
			ON "participant_history" ("participantId")
		`);

		// Backfill data from existing participants
		// For each participant that has a userId, create a history entry
		await queryRunner.query(`
			INSERT INTO "participant_history" (
				"id", "userId", "participantId", "retreatId", "roleInRetreat",
				"isPrimaryRetreat", "createdAt"
			)
			SELECT
				lower(hex(randomblob(16))) || '-' || lower(hex(randomblob(8))) || '-4' || substr(lower(hex(randomblob(4))), 2) || '-' || substr('89ab', abs(random()) * 2 + 1, 1) || substr(lower(hex(randomblob(4))), 2) || '-' || lower(hex(randomblob(12))),
				p."userId",
				p.id,
				p."retreatId",
				CASE p.type
					WHEN 'walker' THEN 'walker'
					WHEN 'server' THEN 'server'
					WHEN 'partial_server' THEN 'server'
					ELSE 'server'
				END,
				0,
				datetime('now')
			FROM "participants" p
			WHERE p."userId" IS NOT NULL
		`);

		// Mark primary retreats for each user
		// The primary retreat is the one where they were a walker (caminante)
		// If no walker retreat exists, the oldest retreat becomes primary
		await queryRunner.query(`
			UPDATE "participant_history"
			SET "isPrimaryRetreat" = 1
			WHERE id IN (
				SELECT ph.id
				FROM "participant_history" ph
				WHERE ph."roleInRetreat" = 'walker'
					AND NOT EXISTS (
						SELECT 1
						FROM "participant_history" ph2
						WHERE ph2."userId" = ph."userId"
							AND ph2."roleInRetreat" = 'walker'
							AND ph2."createdAt" < ph."createdAt"
					)
			)
		`);

		// For users who never walked (servers only), mark their oldest retreat as primary
		await queryRunner.query(`
			UPDATE "participant_history"
			SET "isPrimaryRetreat" = 1
			WHERE id IN (
				SELECT ph.id
				FROM "participant_history" ph
				WHERE ph."userId" NOT IN (
						SELECT DISTINCT "userId"
						FROM "participant_history"
						WHERE "roleInRetreat" = 'walker'
					)
					AND NOT EXISTS (
						SELECT 1
						FROM "participant_history" ph2
						WHERE ph2."userId" = ph."userId"
							AND ph2."createdAt" < ph."createdAt"
					)
			)
		`);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		// ==================== PARTICIPANT HISTORY ====================

		// Drop indexes
		await queryRunner.query(`DROP INDEX IF EXISTS "IDX_participant_history_participantId"`);
		await queryRunner.query(`DROP INDEX IF EXISTS "IDX_participant_history_retreatId"`);
		await queryRunner.query(`DROP INDEX IF EXISTS "IDX_participant_history_userId"`);

		// Drop participant_history table
		await queryRunner.query(`DROP TABLE IF EXISTS "participant_history"`);

		// ==================== RETREAT MEMORY FIELDS ====================

		// Remove memory fields from retreat table
		await queryRunner.query(`
			ALTER TABLE "retreat" DROP COLUMN "memoryPhotoUrl"
		`);

		await queryRunner.query(`
			ALTER TABLE "retreat" DROP COLUMN "musicPlaylistUrl"
		`);

		// ==================== TESTIMONIALS ====================

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
