import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateSocialSystem20260116150000 implements MigrationInterface {
	public async up(queryRunner: QueryRunner): Promise<void> {
		// Create user_profiles table
		await queryRunner.query(`
			CREATE TABLE IF NOT EXISTS "user_profiles" (
				"userId" varchar PRIMARY KEY NOT NULL,
				"bio" text,
				"location" varchar,
				"website" varchar,
				"showEmail" boolean DEFAULT false NOT NULL,
				"showPhone" boolean DEFAULT false NOT NULL,
				"showRetreats" boolean DEFAULT true NOT NULL,
				"interests" text,
				"skills" text,
				FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
			)
		`);

		// Create friends table
		await queryRunner.query(`
			CREATE TABLE IF NOT EXISTS "friends" (
				"userId" varchar NOT NULL,
				"friendId" varchar NOT NULL,
				"status" varchar NOT NULL DEFAULT 'pending',
				"createdAt" datetime DEFAULT (datetime('now')) NOT NULL,
				"respondedAt" datetime,
				"initiatedByUser" boolean DEFAULT true NOT NULL,
				PRIMARY KEY ("userId", "friendId"),
				FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE,
				FOREIGN KEY ("friendId") REFERENCES "users"("id") ON DELETE CASCADE
			)
		`);

		// Create unique index on friends to prevent duplicate relationships
		await queryRunner.query(`
			CREATE UNIQUE INDEX IF NOT EXISTS "UQ_friends_user_friend"
			ON "friends" ("userId", "friendId")
		`);

		// Create follows table
		await queryRunner.query(`
			CREATE TABLE IF NOT EXISTS "follows" (
				"id" varchar PRIMARY KEY NOT NULL,
				"followerId" varchar NOT NULL,
				"followingId" varchar NOT NULL,
				"createdAt" datetime DEFAULT (datetime('now')) NOT NULL,
				FOREIGN KEY ("followerId") REFERENCES "users"("id") ON DELETE CASCADE,
				FOREIGN KEY ("followingId") REFERENCES "users"("id") ON DELETE CASCADE
			)
		`);

		// Create unique index on follows to prevent duplicate follows
		await queryRunner.query(`
			CREATE UNIQUE INDEX IF NOT EXISTS "UQ_follows_follower_following"
			ON "follows" ("followerId", "followingId")
		`);

		// Create user_activities table
		await queryRunner.query(`
			CREATE TABLE IF NOT EXISTS "user_activities" (
				"id" varchar PRIMARY KEY NOT NULL,
				"userId" varchar NOT NULL,
				"activityType" varchar NOT NULL,
				"description" text,
				"metadata" text,
				"createdAt" datetime DEFAULT (datetime('now')) NOT NULL,
				FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
			)
		`);

		// Add participantId column to users table
		await queryRunner.query(`
			ALTER TABLE "users" ADD COLUMN "participantId" varchar
		`);

		// Add userId column to participants table
		await queryRunner.query(`
			ALTER TABLE "participants" ADD COLUMN "userId" varchar
		`);

		// Create index for faster user lookups by participant
		await queryRunner.query(`
			CREATE INDEX IF NOT EXISTS "IDX_users_participantId"
			ON "users" ("participantId")
		`);

		// Create index for faster participant lookups by user
		await queryRunner.query(`
			CREATE INDEX IF NOT EXISTS "IDX_participants_userId"
			ON "participants" ("userId")
		`);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		// Drop indexes
		await queryRunner.query(`DROP INDEX IF EXISTS "IDX_participants_userId"`);
		await queryRunner.query(`DROP INDEX IF EXISTS "IDX_users_participantId"`);
		await queryRunner.query(`DROP INDEX IF EXISTS "UQ_follows_follower_following"`);
		await queryRunner.query(`DROP INDEX IF EXISTS "UQ_friends_user_friend"`);

		// Remove columns
		await queryRunner.query(`ALTER TABLE "participants" DROP COLUMN "userId"`);
		await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "participantId"`);

		// Drop tables
		await queryRunner.query(`DROP TABLE IF EXISTS "user_activities"`);
		await queryRunner.query(`DROP TABLE IF EXISTS "follows"`);
		await queryRunner.query(`DROP TABLE IF EXISTS "friends"`);
		await queryRunner.query(`DROP TABLE IF EXISTS "user_profiles"`);
	}
}
