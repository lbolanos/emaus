import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPendingVerificationToMemberState20260112200000 {
	name = 'AddPendingVerificationToMemberState20260112200000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		// Get the current table structure
		const tableInfo = await queryRunner.query(`PRAGMA table_info("community_member")`);

		// Create a new table with the updated CHECK constraint
		await queryRunner.query(`
			CREATE TABLE "community_member_new" (
				"id" VARCHAR(36) PRIMARY KEY NOT NULL,
				"communityId" VARCHAR(36) NOT NULL,
				"participantId" VARCHAR(36) NOT NULL,
				"state" VARCHAR(255) NOT NULL DEFAULT 'active_member' CHECK ("state" IN ('far_from_location', 'no_answer', 'another_group', 'active_member', 'pending_verification')),
				"joinedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
				"updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
				"notes" TEXT,
				FOREIGN KEY ("communityId") REFERENCES "community" ("id") ON DELETE CASCADE,
				FOREIGN KEY ("participantId") REFERENCES "participants" ("id") ON DELETE CASCADE,
				UNIQUE("communityId", "participantId")
			)
		`);

		// Copy existing data to the new table
		await queryRunner.query(`
			INSERT INTO "community_member_new" ("id", "communityId", "participantId", "state", "joinedAt", "updatedAt", "notes")
			SELECT "id", "communityId", "participantId", "state", "joinedAt", "updatedAt", "notes"
			FROM "community_member"
		`);

		// Drop the old table
		await queryRunner.query(`DROP TABLE "community_member"`);

		// Rename the new table
		await queryRunner.query(`ALTER TABLE "community_member_new" RENAME TO "community_member"`);

		// Recreate indexes
		await queryRunner.query(`CREATE INDEX "idx_community_member_community" ON "community_member" ("communityId")`);
		await queryRunner.query(`CREATE INDEX "idx_community_member_participant" ON "community_member" ("participantId")`);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		// Create a new table with the old CHECK constraint (without pending_verification)
		await queryRunner.query(`
			CREATE TABLE "community_member_new" (
				"id" VARCHAR(36) PRIMARY KEY NOT NULL,
				"communityId" VARCHAR(36) NOT NULL,
				"participantId" VARCHAR(36) NOT NULL,
				"state" VARCHAR(255) NOT NULL DEFAULT 'active_member' CHECK ("state" IN ('far_from_location', 'no_answer', 'another_group', 'active_member')),
				"joinedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
				"updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
				"notes" TEXT,
				FOREIGN KEY ("communityId") REFERENCES "community" ("id") ON DELETE CASCADE,
				FOREIGN KEY ("participantId") REFERENCES "participants" ("id") ON DELETE CASCADE,
				UNIQUE("communityId", "participantId")
			)
		`);

		// Copy existing data to the new table (filter out pending_verification records)
		await queryRunner.query(`
			INSERT INTO "community_member_new" ("id", "communityId", "participantId", "state", "joinedAt", "updatedAt", "notes")
			SELECT "id", "communityId", "participantId", "state", "joinedAt", "updatedAt", "notes"
			FROM "community_member"
			WHERE "state" != 'pending_verification'
		`);

		// Drop the old table
		await queryRunner.query(`DROP TABLE "community_member"`);

		// Rename the new table
		await queryRunner.query(`ALTER TABLE "community_member_new" RENAME TO "community_member"`);

		// Recreate indexes
		await queryRunner.query(`CREATE INDEX "idx_community_member_community" ON "community_member" ("communityId")`);
		await queryRunner.query(`CREATE INDEX "idx_community_member_participant" ON "community_member" ("participantId")`);
	}
}
