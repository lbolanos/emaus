import { MigrationInterface, QueryRunner } from 'typeorm';

export class FixParticipantCommunicationsUserFk1699774320000 implements MigrationInterface {
	name = 'FixParticipantCommunicationsUserFk1699774320000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		// Check if the old foreign key constraint exists
		const tableInfo = await queryRunner.query(`
			SELECT sql FROM sqlite_master
			WHERE type='table' AND name='participant_communications'
		`);

		if (tableInfo && tableInfo[0] && tableInfo[0].sql) {
			const sql = tableInfo[0].sql;
			// Check if the old FK constraint exists (references "user")
			if (sql.includes('REFERENCES "user"')) {
				// SQLite doesn't support ALTER TABLE DROP CONSTRAINT directly
				// We need to recreate the table without the problematic FK
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
						FOREIGN KEY ("participantId") REFERENCES "participant" ("id") ON DELETE CASCADE,
						FOREIGN KEY ("retreatId") REFERENCES "retreat" ("id") ON DELETE CASCADE,
						FOREIGN KEY ("communityId") REFERENCES "community" ("id") ON DELETE CASCADE,
						FOREIGN KEY ("templateId") REFERENCES "message_templates" ("id") ON DELETE SET NULL,
						FOREIGN KEY ("sentBy") REFERENCES "users" ("id") ON DELETE SET NULL
					)
				`);

				// Copy data from old table to new table
				await queryRunner.query(`
					INSERT INTO "participant_communications_new"
					SELECT * FROM "participant_communications"
				`);

				// Drop old table
				await queryRunner.query(`DROP TABLE "participant_communications"`);

				// Rename new table to original name
				await queryRunner.query(`ALTER TABLE "participant_communications_new" RENAME TO "participant_communications"`);
			}
		}
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		// Revert by recreating with the old (incorrect) FK
		await queryRunner.query(`
			CREATE TABLE "participant_communications_old" (
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
				FOREIGN KEY ("participantId") REFERENCES "participant" ("id") ON DELETE CASCADE,
				FOREIGN KEY ("retreatId") REFERENCES "retreat" ("id") ON DELETE CASCADE,
				FOREIGN KEY ("communityId") REFERENCES "community" ("id") ON DELETE CASCADE,
				FOREIGN KEY ("templateId") REFERENCES "message_templates" ("id") ON DELETE SET NULL,
				FOREIGN KEY ("sentBy") REFERENCES "user" ("id") ON DELETE SET NULL
			)
		`);

		await queryRunner.query(`
			INSERT INTO "participant_communications_old"
			SELECT * FROM "participant_communications"
		`);

		await queryRunner.query(`DROP TABLE "participant_communications"`);
		await queryRunner.query(`ALTER TABLE "participant_communications_old" RENAME TO "participant_communications"`);
	}
}
