import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateCommunityTables20260108132921 implements MigrationInterface {
	name = 'CreateCommunityTables';
	timestamp = '20260108132921';

	public async up(queryRunner: QueryRunner): Promise<void> {
		// 1. Create community table
		await queryRunner.query(`
			CREATE TABLE IF NOT EXISTS "community" (
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

		// 2. Create community_member table
		await queryRunner.query(`
			CREATE TABLE IF NOT EXISTS "community_member" (
				"id" VARCHAR(36) PRIMARY KEY NOT NULL,
				"communityId" VARCHAR(36) NOT NULL,
				"participantId" VARCHAR(36) NOT NULL,
				"state" VARCHAR(255) NOT NULL DEFAULT 'active_member' CHECK ("state" IN ('far_from_location', 'no_answer', 'another_group', 'active_member')),
				"joinedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
				"updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
				FOREIGN KEY ("communityId") REFERENCES "community" ("id") ON DELETE CASCADE,
				FOREIGN KEY ("participantId") REFERENCES "participants" ("id") ON DELETE CASCADE,
				UNIQUE("communityId", "participantId")
			)
		`);

		// 3. Create community_meeting table with recurrence support
		await queryRunner.query(`
			CREATE TABLE IF NOT EXISTS "community_meeting" (
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
				FOREIGN KEY ("communityId") REFERENCES "community" ("id") ON DELETE CASCADE
			)
		`);

		// 4. Create community_admin table
		await queryRunner.query(`
			CREATE TABLE IF NOT EXISTS "community_admin" (
				"id" VARCHAR(36) PRIMARY KEY NOT NULL,
				"communityId" VARCHAR(36) NOT NULL,
				"userId" VARCHAR(36) NOT NULL,
				"role" VARCHAR(255) NOT NULL DEFAULT 'admin' CHECK ("role" IN ('owner', 'admin')),
				"invitedBy" VARCHAR(36),
				"invitedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
				"acceptedAt" DATETIME,
				"status" VARCHAR(255) NOT NULL DEFAULT 'pending' CHECK ("status" IN ('pending', 'active', 'revoked')),
				"invitationToken" VARCHAR(255),
				"invitationExpiresAt" DATETIME,
				FOREIGN KEY ("communityId") REFERENCES "community" ("id") ON DELETE CASCADE,
				FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE,
				FOREIGN KEY ("invitedBy") REFERENCES "users" ("id") ON DELETE SET NULL,
				UNIQUE("communityId", "userId")
			)
		`);

		// 5. Create community_attendance table
		await queryRunner.query(`
			CREATE TABLE IF NOT EXISTS "community_attendance" (
				"id" VARCHAR(36) PRIMARY KEY NOT NULL,
				"meetingId" VARCHAR(36) NOT NULL,
				"memberId" VARCHAR(36) NOT NULL,
				"attended" BOOLEAN NOT NULL DEFAULT 0,
				"notes" TEXT,
				"recordedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
				FOREIGN KEY ("meetingId") REFERENCES "community_meeting" ("id") ON DELETE CASCADE,
				FOREIGN KEY ("memberId") REFERENCES "community_member" ("id") ON DELETE CASCADE
			)
		`);

		// 6. Create indexes
		await queryRunner.query(
			`CREATE INDEX "idx_community_member_community" ON "community_member" ("communityId")`,
		);
		await queryRunner.query(
			`CREATE INDEX "idx_community_member_participant" ON "community_member" ("participantId")`,
		);
		await queryRunner.query(
			`CREATE INDEX "idx_community_meeting_community" ON "community_meeting" ("communityId")`,
		);
		await queryRunner.query(
			`CREATE INDEX "idx_community_meeting_parent" ON "community_meeting" ("parentMeetingId")`,
		);
		await queryRunner.query(
			`CREATE INDEX "idx_community_meeting_recurrence" ON "community_meeting" ("communityId", "recurrenceFrequency")`,
		);
		await queryRunner.query(
			`CREATE INDEX "idx_community_meeting_instance" ON "community_meeting" ("parentMeetingId", "instanceDate")`,
		);
		await queryRunner.query(
			`CREATE INDEX "idx_community_admin_community" ON "community_admin" ("communityId")`,
		);
		await queryRunner.query(
			`CREATE INDEX "idx_community_admin_user" ON "community_admin" ("userId")`,
		);
		await queryRunner.query(
			`CREATE INDEX "idx_community_attendance_meeting" ON "community_attendance" ("meetingId")`,
		);
		await queryRunner.query(
			`CREATE INDEX "idx_community_attendance_member" ON "community_attendance" ("memberId")`,
		);

		// 7. Insert permissions
		await queryRunner.query(`
			INSERT OR IGNORE INTO "permissions" ("resource", "operation", "description") VALUES
			('community', 'create', 'Create new communities'),
			('community', 'read', 'Read/view communities'),
			('community', 'update', 'Update existing communities'),
			('community', 'delete', 'Delete communities'),
			('community', 'list', 'List communities'),
			('community', 'admin', 'Manage community administrators and settings')
		`);

		// Assign community permissions to admin roles (superadmin and region_admin)
		const adminRoles = await queryRunner.query(
			`SELECT id FROM "roles" WHERE name IN ('superadmin', 'region_admin')`,
		);

		if (adminRoles && adminRoles.length > 0) {
			const newPerms = await queryRunner.query(
				`SELECT id FROM "permissions" WHERE resource = 'community'`,
			);

			for (const role of adminRoles) {
				for (const perm of newPerms) {
					await queryRunner.query(
						`INSERT OR IGNORE INTO "role_permissions" ("roleId", "permissionId") VALUES (?, ?)`,
						[role.id, perm.id],
					);
				}
			}
		}
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		// Drop in reverse order
		await queryRunner.query(`DROP TABLE IF EXISTS "community_attendance"`);
		await queryRunner.query(`DROP TABLE IF EXISTS "community_admin"`);
		await queryRunner.query(`DROP TABLE IF EXISTS "community_meeting"`);
		await queryRunner.query(`DROP TABLE IF EXISTS "community_member"`);
		await queryRunner.query(`DROP TABLE IF EXISTS "community"`);

		// Clean up permissions
		await queryRunner.query(`DELETE FROM "permissions" WHERE resource = 'community'`);
	}
}
