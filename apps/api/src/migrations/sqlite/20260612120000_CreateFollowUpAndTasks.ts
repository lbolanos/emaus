import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Pipeline de seguimiento de participantes (participant_followups) + tareas del
 * coordinador (crm_tasks). Dos tablas nuevas sin FKs entrantes → CREATE TABLE
 * simple.
 */
export class CreateFollowUpAndTasks20260612120000 implements MigrationInterface {
	name = 'CreateFollowUpAndTasks20260612120000';
	timestamp = '20260612120000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`
			CREATE TABLE IF NOT EXISTS "participant_followups" (
				"id" varchar PRIMARY KEY NOT NULL,
				"retreatId" varchar NOT NULL,
				"participantId" varchar NOT NULL,
				"status" varchar(20) NOT NULL DEFAULT 'pending',
				"note" text,
				"updatedBy" varchar,
				"createdAt" datetime NOT NULL DEFAULT (datetime('now')),
				"updatedAt" datetime NOT NULL DEFAULT (datetime('now')),
				CONSTRAINT "FK_followups_retreat" FOREIGN KEY ("retreatId") REFERENCES "retreat" ("id") ON DELETE CASCADE,
				CONSTRAINT "FK_followups_participant" FOREIGN KEY ("participantId") REFERENCES "participant" ("id") ON DELETE CASCADE,
				CONSTRAINT "FK_followups_user" FOREIGN KEY ("updatedBy") REFERENCES "users" ("id") ON DELETE SET NULL,
				CONSTRAINT "UQ_followup_participant_retreat" UNIQUE ("participantId", "retreatId")
			)
		`);
		await queryRunner.query(
			`CREATE INDEX IF NOT EXISTS "IDX_followups_retreat" ON "participant_followups" ("retreatId")`,
		);

		await queryRunner.query(`
			CREATE TABLE IF NOT EXISTS "crm_tasks" (
				"id" varchar PRIMARY KEY NOT NULL,
				"retreatId" varchar NOT NULL,
				"participantId" varchar,
				"title" varchar(200) NOT NULL,
				"description" text,
				"dueDate" datetime,
				"status" varchar(20) NOT NULL DEFAULT 'open',
				"assignedTo" varchar,
				"createdBy" varchar,
				"completedAt" datetime,
				"createdAt" datetime NOT NULL DEFAULT (datetime('now')),
				"updatedAt" datetime NOT NULL DEFAULT (datetime('now')),
				CONSTRAINT "FK_crm_tasks_retreat" FOREIGN KEY ("retreatId") REFERENCES "retreat" ("id") ON DELETE CASCADE,
				CONSTRAINT "FK_crm_tasks_participant" FOREIGN KEY ("participantId") REFERENCES "participant" ("id") ON DELETE SET NULL,
				CONSTRAINT "FK_crm_tasks_assignee" FOREIGN KEY ("assignedTo") REFERENCES "users" ("id") ON DELETE SET NULL
			)
		`);
		await queryRunner.query(
			`CREATE INDEX IF NOT EXISTS "IDX_crm_tasks_retreat" ON "crm_tasks" ("retreatId")`,
		);
		await queryRunner.query(
			`CREATE INDEX IF NOT EXISTS "IDX_crm_tasks_due" ON "crm_tasks" ("dueDate")`,
		);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`DROP INDEX IF EXISTS "IDX_crm_tasks_due"`);
		await queryRunner.query(`DROP INDEX IF EXISTS "IDX_crm_tasks_retreat"`);
		await queryRunner.query(`DROP TABLE IF EXISTS "crm_tasks"`);
		await queryRunner.query(`DROP INDEX IF EXISTS "IDX_followups_retreat"`);
		await queryRunner.query(`DROP TABLE IF EXISTS "participant_followups"`);
	}
}
