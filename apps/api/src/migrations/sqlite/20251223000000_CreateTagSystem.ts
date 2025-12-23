import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateTagSystem20251223000000 implements MigrationInterface {
	name = 'CreateTagSystem20251223000000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		console.log(' Creating tags table...');
		await queryRunner.query(`
            CREATE TABLE "tags" (
                "id" varchar PRIMARY KEY NOT NULL,
                "name" varchar(100) NOT NULL UNIQUE,
                "color" varchar(50),
                "description" text,
                "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
                "updatedAt" datetime NOT NULL DEFAULT (datetime('now'))
            )
        `);
		console.log('  Created tags table');

		console.log(' Creating participant_tags join table...');
		await queryRunner.query(`
            CREATE TABLE "participant_tags" (
                "id" varchar PRIMARY KEY NOT NULL,
                "participantId" varchar NOT NULL,
                "tagId" varchar NOT NULL,
                "assignedAt" datetime NOT NULL DEFAULT (datetime('now')),
                FOREIGN KEY ("participantId") REFERENCES "participants"("id") ON DELETE CASCADE,
                FOREIGN KEY ("tagId") REFERENCES "tags"("id") ON DELETE CASCADE
            )
        `);
		console.log('  Created participant_tags table');

		console.log(' Creating index on participant_tags for performance...');
		await queryRunner.query(`
            CREATE INDEX "idx_participant_tags_participantId" ON "participant_tags"("participantId")
        `);
		await queryRunner.query(`
            CREATE INDEX "idx_participant_tags_tagId" ON "participant_tags"("tagId")
        `);
		console.log('  Created indexes');
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`DROP INDEX "idx_participant_tags_tagId"`);
		await queryRunner.query(`DROP INDEX "idx_participant_tags_participantId"`);
		await queryRunner.query(`DROP TABLE "participant_tags"`);
		await queryRunner.query(`DROP TABLE "tags"`);
	}
}
