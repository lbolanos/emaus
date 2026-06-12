import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Motor de secuencias de mensajes (drip CRM). Tres tablas nuevas sin FKs
 * entrantes desde tablas existentes → CREATE TABLE simple, en orden de
 * dependencia: message_sequences → sequence_steps → scheduled_messages.
 */
export class CreateMessageSequences20260612110000 implements MigrationInterface {
	name = 'CreateMessageSequences20260612110000';
	timestamp = '20260612110000';
	// El down() hace DROP TABLE; el guard sqliteSafePattern exige este flag.
	// (Tablas nuevas sin FKs entrantes; el runner custom además ignora el flag.)
	transaction = false as const;

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`
			CREATE TABLE IF NOT EXISTS "message_sequences" (
				"id" varchar PRIMARY KEY NOT NULL,
				"name" varchar(150) NOT NULL,
				"description" text,
				"retreatId" varchar NOT NULL,
				"trigger" varchar(30) NOT NULL,
				"audience" varchar(20) NOT NULL DEFAULT 'all',
				"segmentId" varchar,
				"isActive" boolean NOT NULL DEFAULT (1),
				"createdBy" varchar,
				"createdAt" datetime NOT NULL DEFAULT (datetime('now')),
				"updatedAt" datetime NOT NULL DEFAULT (datetime('now')),
				CONSTRAINT "FK_message_sequences_retreat" FOREIGN KEY ("retreatId") REFERENCES "retreat" ("id") ON DELETE CASCADE,
				CONSTRAINT "FK_message_sequences_user" FOREIGN KEY ("createdBy") REFERENCES "users" ("id") ON DELETE SET NULL
			)
		`);
		await queryRunner.query(
			`CREATE INDEX IF NOT EXISTS "IDX_message_sequences_retreat" ON "message_sequences" ("retreatId")`,
		);

		await queryRunner.query(`
			CREATE TABLE IF NOT EXISTS "sequence_steps" (
				"id" varchar PRIMARY KEY NOT NULL,
				"sequenceId" varchar NOT NULL,
				"stepOrder" integer NOT NULL DEFAULT (0),
				"offsetDays" integer NOT NULL DEFAULT (0),
				"sendHour" integer NOT NULL DEFAULT (9),
				"templateType" varchar(60) NOT NULL,
				"channel" varchar(20) NOT NULL,
				"createdAt" datetime NOT NULL DEFAULT (datetime('now')),
				"updatedAt" datetime NOT NULL DEFAULT (datetime('now')),
				CONSTRAINT "FK_sequence_steps_sequence" FOREIGN KEY ("sequenceId") REFERENCES "message_sequences" ("id") ON DELETE CASCADE
			)
		`);
		await queryRunner.query(
			`CREATE INDEX IF NOT EXISTS "IDX_sequence_steps_sequence" ON "sequence_steps" ("sequenceId")`,
		);

		await queryRunner.query(`
			CREATE TABLE IF NOT EXISTS "scheduled_messages" (
				"id" varchar PRIMARY KEY NOT NULL,
				"sequenceId" varchar NOT NULL,
				"stepId" varchar NOT NULL,
				"participantId" varchar NOT NULL,
				"retreatId" varchar NOT NULL,
				"channel" varchar(20) NOT NULL,
				"templateType" varchar(60) NOT NULL,
				"scheduledFor" datetime NOT NULL,
				"status" varchar(20) NOT NULL DEFAULT 'pending',
				"sentAt" datetime,
				"error" text,
				"createdAt" datetime NOT NULL DEFAULT (datetime('now')),
				"updatedAt" datetime NOT NULL DEFAULT (datetime('now')),
				CONSTRAINT "FK_scheduled_messages_sequence" FOREIGN KEY ("sequenceId") REFERENCES "message_sequences" ("id") ON DELETE CASCADE,
				CONSTRAINT "FK_scheduled_messages_step" FOREIGN KEY ("stepId") REFERENCES "sequence_steps" ("id") ON DELETE CASCADE,
				CONSTRAINT "FK_scheduled_messages_participant" FOREIGN KEY ("participantId") REFERENCES "participant" ("id") ON DELETE CASCADE,
				CONSTRAINT "FK_scheduled_messages_retreat" FOREIGN KEY ("retreatId") REFERENCES "retreat" ("id") ON DELETE CASCADE,
				CONSTRAINT "UQ_scheduled_step_participant" UNIQUE ("stepId", "participantId")
			)
		`);
		await queryRunner.query(
			`CREATE INDEX IF NOT EXISTS "IDX_scheduled_messages_due" ON "scheduled_messages" ("scheduledFor")`,
		);
		await queryRunner.query(
			`CREATE INDEX IF NOT EXISTS "IDX_scheduled_messages_status" ON "scheduled_messages" ("status")`,
		);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`DROP INDEX IF EXISTS "IDX_scheduled_messages_status"`);
		await queryRunner.query(`DROP INDEX IF EXISTS "IDX_scheduled_messages_due"`);
		await queryRunner.query(`DROP TABLE IF EXISTS "scheduled_messages"`);
		await queryRunner.query(`DROP INDEX IF EXISTS "IDX_sequence_steps_sequence"`);
		await queryRunner.query(`DROP TABLE IF EXISTS "sequence_steps"`);
		await queryRunner.query(`DROP INDEX IF EXISTS "IDX_message_sequences_retreat"`);
		await queryRunner.query(`DROP TABLE IF EXISTS "message_sequences"`);
	}
}
