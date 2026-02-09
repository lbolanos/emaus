import { MigrationInterface, QueryRunner } from 'typeorm';

export class MakeDurationMinutesNullable20260209193000 implements MigrationInterface {
	name = 'MakeDurationMinutesNullable20260209193000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		// SQLite doesn't support ALTER COLUMN directly, need to recreate table
		await queryRunner.query(`
			CREATE TABLE "community_meeting_new" (
				"id" VARCHAR(36) PRIMARY KEY NOT NULL,
				"communityId" VARCHAR(36) NOT NULL,
				"title" VARCHAR(200) NOT NULL,
				"description" TEXT,
				"startDate" DATETIME NOT NULL,
				"endDate" DATETIME,
				"durationMinutes" INTEGER,
				"isAnnouncement" BOOLEAN NOT NULL DEFAULT 0,
				"recurrenceFrequency" VARCHAR,
				"recurrenceInterval" INTEGER,
				"recurrenceDayOfWeek" VARCHAR,
				"recurrenceDayOfMonth" INTEGER,
				"parentMeetingId" VARCHAR,
				"isRecurrenceTemplate" BOOLEAN DEFAULT 0,
				"instanceDate" DATE,
				"exceptionType" VARCHAR,
				"createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
				"flyer_template" TEXT,
				FOREIGN KEY ("communityId") REFERENCES "community" ("id") ON DELETE CASCADE
			)
		`);

		// Copy existing data
		await queryRunner.query(`
			INSERT INTO "community_meeting_new"
			SELECT * FROM "community_meeting"
		`);

		// Drop old table and rename new one
		await queryRunner.query(`DROP TABLE "community_meeting"`);
		await queryRunner.query(`ALTER TABLE "community_meeting_new" RENAME TO "community_meeting"`);

		// Recreate indexes
		await queryRunner.query(`CREATE INDEX "idx_community_meeting_community" ON "community_meeting" ("communityId")`);
		await queryRunner.query(`CREATE INDEX "idx_community_meeting_parent" ON "community_meeting" ("parentMeetingId")`);
		await queryRunner.query(`CREATE INDEX "idx_community_meeting_recurrence" ON "community_meeting" ("communityId", "recurrenceFrequency")`);
		await queryRunner.query(`CREATE INDEX "idx_community_meeting_instance" ON "community_meeting" ("parentMeetingId", "instanceDate")`);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		// Revert - make durationMinutes NOT NULL again
		await queryRunner.query(`
			CREATE TABLE "community_meeting_new" (
				"id" VARCHAR(36) PRIMARY KEY NOT NULL,
				"communityId" VARCHAR(36) NOT NULL,
				"title" VARCHAR(200) NOT NULL,
				"description" TEXT,
				"startDate" DATETIME NOT NULL,
				"endDate" DATETIME,
				"durationMinutes" INTEGER NOT NULL,
				"isAnnouncement" BOOLEAN NOT NULL DEFAULT 0,
				"recurrenceFrequency" VARCHAR,
				"recurrenceInterval" INTEGER,
				"recurrenceDayOfWeek" VARCHAR,
				"recurrenceDayOfMonth" INTEGER,
				"parentMeetingId" VARCHAR,
				"isRecurrenceTemplate" BOOLEAN DEFAULT 0,
				"instanceDate" DATE,
				"exceptionType" VARCHAR,
				"createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
				"flyer_template" TEXT,
				FOREIGN KEY ("communityId") REFERENCES "community" ("id") ON DELETE CASCADE
			)
		`);

		// Copy data, setting durationMinutes to a default value for NULLs
		await queryRunner.query(`
			INSERT INTO "community_meeting_new"
			SELECT
				"id", "communityId", "title", "description", "startDate", "endDate",
				COALESCE("durationMinutes", 60) as "durationMinutes",
				"isAnnouncement", "recurrenceFrequency", "recurrenceInterval", "recurrenceDayOfWeek",
				"recurrenceDayOfMonth", "parentMeetingId", "isRecurrenceTemplate", "instanceDate",
				"exceptionType", "createdAt", "flyer_template"
			FROM "community_meeting"
		`);

		await queryRunner.query(`DROP TABLE "community_meeting"`);
		await queryRunner.query(`ALTER TABLE "community_meeting_new" RENAME TO "community_meeting"`);

		await queryRunner.query(`CREATE INDEX "idx_community_meeting_community" ON "community_meeting" ("communityId")`);
		await queryRunner.query(`CREATE INDEX "idx_community_meeting_parent" ON "community_meeting" ("parentMeetingId")`);
		await queryRunner.query(`CREATE INDEX "idx_community_meeting_recurrence" ON "community_meeting" ("communityId", "recurrenceFrequency")`);
		await queryRunner.query(`CREATE INDEX "idx_community_meeting_instance" ON "community_meeting" ("parentMeetingId", "instanceDate")`);
	}
}
