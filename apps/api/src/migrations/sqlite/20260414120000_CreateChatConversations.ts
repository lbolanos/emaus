import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateChatConversations20260414120000 implements MigrationInterface {
	name = 'CreateChatConversations20260414120000';
	timestamp = '20260414120000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`
			CREATE TABLE "chat_conversations" (
				"id" varchar PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
				"userId" varchar NOT NULL,
				"retreatId" varchar,
				"messages" text NOT NULL,
				"title" varchar(255),
				"createdAt" datetime NOT NULL DEFAULT (datetime('now')),
				"updatedAt" datetime NOT NULL DEFAULT (datetime('now'))
			)
		`);

		await queryRunner.query(
			`CREATE INDEX "IDX_chat_conversations_userId" ON "chat_conversations" ("userId")`,
		);

		console.log('Created chat_conversations table');
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`DROP INDEX IF EXISTS "IDX_chat_conversations_userId"`);
		await queryRunner.query(`DROP TABLE IF EXISTS "chat_conversations"`);
		console.log('Dropped chat_conversations table');
	}
}
