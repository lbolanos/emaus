import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCommunityMessageTemplates20260111195228 implements MigrationInterface {
	name = 'AddCommunityMessageTemplates';
	timestamp = '20260111195228';

	public async up(queryRunner: QueryRunner): Promise<void> {
		// Disable foreign key constraints temporarily
		await queryRunner.query(`PRAGMA foreign_keys = OFF`);

		// ============================================
		// Update message_templates table
		// ============================================

		// Check if scope column already exists
		const messageTemplatesTableInfo = await queryRunner.query(
			`PRAGMA table_info("message_templates")`,
		);
		const hasScopeColumn = messageTemplatesTableInfo.some((col: any) => col.name === 'scope');

		if (!hasScopeColumn) {
			// SQLite doesn't support making columns nullable directly, need to recreate table
			// 1. Get current table schema
			const currentSchema = await queryRunner.query(
				`SELECT sql FROM sqlite_master WHERE type='table' AND name='message_templates'`,
			);

			// 2. Create new table with scope column and nullable retreatId + communityId
			await queryRunner.query(`
				CREATE TABLE "message_templates_new" (
					"id" VARCHAR PRIMARY KEY NOT NULL,
					"name" VARCHAR(255) NOT NULL,
					"type" VARCHAR NOT NULL,
					"scope" VARCHAR NOT NULL DEFAULT 'retreat',
					"message" TEXT NOT NULL,
					"retreatId" VARCHAR(36) NULL,
					"communityId" VARCHAR(36) NULL,
					"createdAt" DATETIME NOT NULL DEFAULT (datetime('now')),
					"updatedAt" DATETIME NOT NULL DEFAULT (datetime('now')),
					FOREIGN KEY ("retreatId") REFERENCES "retreat" ("id") ON DELETE CASCADE,
					FOREIGN KEY ("communityId") REFERENCES "community" ("id") ON DELETE CASCADE
				)
			`);

			// 3. Copy data from old table to new table (scope defaults to 'retreat')
			await queryRunner.query(`
				INSERT INTO "message_templates_new" ("id", "name", "type", "scope", "message", "retreatId", "communityId", "createdAt", "updatedAt")
				SELECT "id", "name", "type", 'retreat', "message", "retreatId", NULL, "createdAt", "updatedAt"
				FROM "message_templates"
			`);

			// 4. Drop old table
			await queryRunner.query(`DROP TABLE "message_templates"`);

			// 5. Rename new table to original name
			await queryRunner.query(`ALTER TABLE "message_templates_new" RENAME TO "message_templates"`);

			// 6. Recreate indexes
			await queryRunner.query(
				`CREATE INDEX "IDX_message_templates_retreatId" ON "message_templates" ("retreatId")`,
			);
			await queryRunner.query(
				`CREATE INDEX "IDX_message_templates_communityId" ON "message_templates" ("communityId")`,
			);

			console.log('Added scope and communityId columns to message_templates table');
		} else {
			console.log('scope column already exists in message_templates, skipping...');
		}

		// ============================================
		// Update participant_communications table
		// ============================================

		// Check if scope column already exists
		const participantCommunicationsTableInfo = await queryRunner.query(
			`PRAGMA table_info("participant_communications")`,
		);
		const hasCommScopeColumn = participantCommunicationsTableInfo.some(
			(col: any) => col.name === 'scope',
		);

		if (!hasCommScopeColumn) {
			// SQLite doesn't support making columns nullable directly, need to recreate table
			// 1. Create new table with scope column and nullable retreatId + communityId
			await queryRunner.query(`
				CREATE TABLE "participant_communications_new" (
					"id" VARCHAR PRIMARY KEY NOT NULL,
					"participantId" VARCHAR NOT NULL,
					"scope" VARCHAR NOT NULL,
					"retreatId" VARCHAR(36) NULL,
					"communityId" VARCHAR(36) NULL,
					"messageType" VARCHAR(20) NOT NULL,
					"recipientContact" VARCHAR(255) NOT NULL,
					"messageContent" TEXT NOT NULL,
					"templateId" VARCHAR(36) NULL,
					"templateName" VARCHAR(255) NULL,
					"subject" VARCHAR(500) NULL,
					"sentAt" DATETIME NOT NULL,
					"sentBy" VARCHAR(36) NULL,
					FOREIGN KEY ("participantId") REFERENCES "participants" ("id") ON DELETE CASCADE,
					FOREIGN KEY ("retreatId") REFERENCES "retreat" ("id") ON DELETE CASCADE,
					FOREIGN KEY ("communityId") REFERENCES "community" ("id") ON DELETE CASCADE,
					FOREIGN KEY ("templateId") REFERENCES "message_templates" ("id") ON DELETE SET NULL,
					FOREIGN KEY ("sentBy") REFERENCES "users" ("id") ON DELETE SET NULL
				)
			`);

			// 2. Copy data from old table to new table (scope defaults to 'retreat')
			await queryRunner.query(`
				INSERT INTO "participant_communications_new" ("id", "participantId", "scope", "retreatId", "communityId", "messageType", "recipientContact", "messageContent", "templateId", "templateName", "subject", "sentAt", "sentBy")
				SELECT "id", "participantId", 'retreat', "retreatId", NULL, "messageType", "recipientContact", "messageContent", "templateId", "templateName", "subject", "sentAt", "sentBy"
				FROM "participant_communications"
			`);

			// 3. Drop old table
			await queryRunner.query(`DROP TABLE "participant_communications"`);

			// 4. Rename new table to original name
			await queryRunner.query(
				`ALTER TABLE "participant_communications_new" RENAME TO "participant_communications"`,
			);

			// 5. Recreate indexes
			await queryRunner.query(
				`CREATE INDEX "IDX_participant_communications_participantId" ON "participant_communications" ("participantId")`,
			);
			await queryRunner.query(
				`CREATE INDEX "IDX_participant_communications_retreatId" ON "participant_communications" ("retreatId")`,
			);
			await queryRunner.query(
				`CREATE INDEX "IDX_participant_communications_communityId" ON "participant_communications" ("communityId")`,
			);

			console.log('Added scope and communityId columns to participant_communications table');
		} else {
			console.log('scope column already exists in participant_communications, skipping...');
		}

		// Re-enable foreign key constraints
		await queryRunner.query(`PRAGMA foreign_keys = ON`);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		// Rollback: remove scope and communityId columns, make retreatId NOT NULL again
		await queryRunner.query(`PRAGMA foreign_keys = OFF`);

		// ============================================
		// Rollback message_templates table
		// ============================================

		// Check if scope column exists
		const messageTemplatesTableInfo = await queryRunner.query(
			`PRAGMA table_info("message_templates")`,
		);
		const hasScopeColumn = messageTemplatesTableInfo.some((col: any) => col.name === 'scope');

		if (hasScopeColumn) {
			// 1. Create new table without scope and communityId, retreatId NOT NULL
			await queryRunner.query(`
				CREATE TABLE "message_templates_new" (
					"id" VARCHAR PRIMARY KEY NOT NULL,
					"name" VARCHAR(255) NOT NULL,
					"type" VARCHAR NOT NULL,
					"message" TEXT NOT NULL,
					"retreatId" VARCHAR(36) NOT NULL,
					"createdAt" DATETIME NOT NULL DEFAULT (datetime('now')),
					"updatedAt" DATETIME NOT NULL DEFAULT (datetime('now')),
					FOREIGN KEY ("retreatId") REFERENCES "retreat" ("id") ON DELETE CASCADE
				)
			`);

			// 2. Copy only retreat templates from old table to new table
			await queryRunner.query(`
				INSERT INTO "message_templates_new" ("id", "name", "type", "message", "retreatId", "createdAt", "updatedAt")
				SELECT "id", "name", "type", "message", "retreatId", "createdAt", "updatedAt"
				FROM "message_templates"
				WHERE "scope" = 'retreat'
			`);

			// 3. Drop old table
			await queryRunner.query(`DROP TABLE "message_templates"`);

			// 4. Rename new table to original name
			await queryRunner.query(`ALTER TABLE "message_templates_new" RENAME TO "message_templates"`);

			// 5. Recreate index
			await queryRunner.query(
				`CREATE INDEX "IDX_message_templates_retreatId" ON "message_templates" ("retreatId")`,
			);

			console.log('Rolled back message_templates table');
		}

		// ============================================
		// Rollback participant_communications table
		// ============================================

		// Check if scope column exists
		const participantCommunicationsTableInfo = await queryRunner.query(
			`PRAGMA table_info("participant_communications")`,
		);
		const hasCommScopeColumn = participantCommunicationsTableInfo.some(
			(col: any) => col.name === 'scope',
		);

		if (hasCommScopeColumn) {
			// 1. Create new table without scope and communityId, retreatId NOT NULL
			await queryRunner.query(`
				CREATE TABLE "participant_communications_new" (
					"id" VARCHAR PRIMARY KEY NOT NULL,
					"participantId" VARCHAR NOT NULL,
					"retreatId" VARCHAR(36) NOT NULL,
					"messageType" VARCHAR(20) NOT NULL,
					"recipientContact" VARCHAR(255) NOT NULL,
					"messageContent" TEXT NOT NULL,
					"templateId" VARCHAR(36) NULL,
					"templateName" VARCHAR(255) NULL,
					"subject" VARCHAR(500) NULL,
					"sentAt" DATETIME NOT NULL,
					"sentBy" VARCHAR(36) NULL,
					FOREIGN KEY ("participantId") REFERENCES "participants" ("id") ON DELETE CASCADE,
					FOREIGN KEY ("retreatId") REFERENCES "retreat" ("id") ON DELETE CASCADE,
					FOREIGN KEY ("templateId") REFERENCES "message_templates" ("id") ON DELETE SET NULL,
					FOREIGN KEY ("sentBy") REFERENCES "users" ("id") ON DELETE SET NULL
				)
			`);

			// 2. Copy only retreat communications from old table to new table
			await queryRunner.query(`
				INSERT INTO "participant_communications_new" ("id", "participantId", "retreatId", "messageType", "recipientContact", "messageContent", "templateId", "templateName", "subject", "sentAt", "sentBy")
				SELECT "id", "participantId", "retreatId", "messageType", "recipientContact", "messageContent", "templateId", "templateName", "subject", "sentAt", "sentBy"
				FROM "participant_communications"
				WHERE "scope" = 'retreat'
			`);

			// 3. Drop old table
			await queryRunner.query(`DROP TABLE "participant_communications"`);

			// 4. Rename new table to original name
			await queryRunner.query(
				`ALTER TABLE "participant_communications_new" RENAME TO "participant_communications"`,
			);

			// 5. Recreate indexes
			await queryRunner.query(
				`CREATE INDEX "IDX_participant_communications_participantId" ON "participant_communications" ("participantId")`,
			);
			await queryRunner.query(
				`CREATE INDEX "IDX_participant_communications_retreatId" ON "participant_communications" ("retreatId")`,
			);

			console.log('Rolled back participant_communications table');
		}

		// Re-enable foreign key constraints
		await queryRunner.query(`PRAGMA foreign_keys = ON`);
	}
}
