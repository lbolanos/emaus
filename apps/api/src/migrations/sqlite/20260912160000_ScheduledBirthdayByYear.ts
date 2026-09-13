import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Birthday sequences fire once per YEAR, not once per lifetime (#1).
 *
 * The old table-level UNIQUE (stepId, participantId) blocked re-enrollment:
 * once a birthday step had ANY row for a participant — sent, skipped, even
 * cancelled — the next year's occurrence was skipped by the `seen` set in
 * enrollSequence (and would have violated the UQ anyway).
 *
 * New key: (stepId, participantId, occurrenceYear).
 *  - occurrenceYear = 0 for every non-birthday trigger ("once in a
 *    lifetime" semantics unchanged) and the scheduled year for birthday
 *    steps → one send per birthday, no duplicate within the same year.
 *  - NOT NULL DEFAULT 0. A nullable column would need an expression index:
 *    SQLite treats NULLs as distinct in UNIQUE constraints, which would
 *    quietly break the once-in-a-lifetime guarantee for non-birthday rows.
 *
 * The UQ is a TABLE CONSTRAINT, so changing it requires the safe
 * recreate-table pattern (see .ruler/skills/sqlite-migrations/SKILL.md):
 * `transaction = false`, PRAGMA foreign_keys = OFF outside any transaction,
 * explicit column list, indexes recreated, foreign_key_check at the end.
 * `scheduled_messages` is a leaf table (no inbound FKs — verified against
 * sqlite_master), so the recreate cannot orphan other tables.
 *
 * Ordering: rename old → _old FIRST and drop it only after the copy
 * succeeded. If up() dies mid-way, every row still lives in _old; the
 * auto-repair branch at the top restores the original name and returns, so
 * the next boot re-runs the migration from a clean pre-migration state.
 *
 * Backfill approximation: the year is derived with
 * strftime('%Y', scheduledFor) (UTC). For a birthday sent at 9:00 in
 * negative-offset American timezones the UTC date equals the local date, so
 * the year matches; only a Dec-31st birthday with a late sendHour
 * (>= ~18 in CDMX) lands on the neighboring UTC year. The engine computes
 * the LOCAL year on every re-enrollment, so the worst case is one
 * historical row tagged year±1 — never a duplicate send, because the
 * `seen` check reads the stored value.
 */
export class ScheduledBirthdayByYear20260912160000 implements MigrationInterface {
	name = 'ScheduledBirthdayByYear20260912160000';
	timestamp = '20260912160000';

	// El runner propio respeta esta propiedad (transaction-policy.ts): sin
	// ella, el DROP TABLE correría dentro de la transacción que TypeORM abre
	// por defecto y el PRAGMA foreign_keys = OFF de abajo se ignora en
	// silencio. Ver .ruler/skills/sqlite-migrations/SKILL.md.
	transaction = false as const;

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`PRAGMA foreign_keys = OFF`);

		// Auto-reparación: una corrida anterior murió a mitad y la tabla
		// original ya no existe — todas las filas viven en _old. Restaurar el
		// nombre y salir; el próximo arranque re-ejecuta desde estado limpio.
		const tables: Array<{ name: string }> = await queryRunner.query(
			`SELECT "name" FROM sqlite_master WHERE type = 'table'
			 AND "name" IN ('scheduled_messages', 'scheduled_messages_old')`,
		);
		const exists = (t: string) => tables.some((row) => row.name === t);

		if (!exists('scheduled_messages')) {
			if (exists('scheduled_messages_old')) {
				await queryRunner.query(
					`ALTER TABLE "scheduled_messages_old" RENAME TO "scheduled_messages"`,
				);
				await this.recreateIndexes(queryRunner);
				await queryRunner.query(`PRAGMA foreign_keys = ON`);
				return;
			}
			// Base sin las migraciones predecesoras (solo posible ejecutando
			// esta clase aislada): crear la tabla nueva tal cual.
			await this.createTable(queryRunner, 'scheduled_messages');
			await this.recreateIndexes(queryRunner);
			await queryRunner.query(`PRAGMA foreign_keys = ON`);
			return;
		}

		// Basura de una corrida muerta antes del DROP: la original sigue
		// intacta, descartarla es seguro.
		await queryRunner.query(`DROP TABLE IF EXISTS "scheduled_messages_new"`);

		await queryRunner.query(
			`ALTER TABLE "scheduled_messages" RENAME TO "scheduled_messages_old"`,
		);

		await this.createTable(queryRunner, 'scheduled_messages');

		await queryRunner.query(`
			INSERT INTO "scheduled_messages" (
				"id", "sequenceId", "stepId", "participantId", "retreatId",
				"channel", "templateType", "recipientTarget", "scheduledFor",
				"status", "sentAt", "error", "attempts",
				"resolvedContent", "resolvedContact", "recipientName",
				"assignedTo", "openedAt", "dispatchedBy",
				"createdAt", "updatedAt", "occurrenceYear"
			)
			SELECT
				sm."id", sm."sequenceId", sm."stepId", sm."participantId", sm."retreatId",
				sm."channel", sm."templateType", sm."recipientTarget", sm."scheduledFor",
				sm."status", sm."sentAt", sm."error", sm."attempts",
				sm."resolvedContent", sm."resolvedContact", sm."recipientName",
				sm."assignedTo", sm."openedAt", sm."dispatchedBy",
				sm."createdAt", sm."updatedAt",
				CASE WHEN ms."trigger" = 'birthday'
					THEN CAST(strftime('%Y', sm."scheduledFor") AS INTEGER)
					ELSE 0
				END
			FROM "scheduled_messages_old" sm
			LEFT JOIN "sequence_steps" st ON st."id" = sm."stepId"
			LEFT JOIN "message_sequences" ms ON ms."id" = st."sequenceId"
		`);

		await queryRunner.query(`DROP TABLE "scheduled_messages_old"`);

		await this.recreateIndexes(queryRunner);

		await queryRunner.query(`PRAGMA foreign_keys = ON`);

		const orphans = await queryRunner.query(`PRAGMA foreign_key_check`);
		if (orphans && orphans.length > 0) {
			throw new Error(`FK integrity broken after migration: ${JSON.stringify(orphans)}`);
		}
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`PRAGMA foreign_keys = OFF`);

		const tables: Array<{ name: string }> = await queryRunner.query(
			`SELECT "name" FROM sqlite_master WHERE type = 'table'
			 AND "name" IN ('scheduled_messages', 'scheduled_messages_old')`,
		);
		const exists = (t: string) => tables.some((row) => row.name === t);

		if (!exists('scheduled_messages')) {
			if (exists('scheduled_messages_old')) {
				await queryRunner.query(
					`ALTER TABLE "scheduled_messages_old" RENAME TO "scheduled_messages"`,
				);
				await this.recreateIndexes(queryRunner);
				await queryRunner.query(`PRAGMA foreign_keys = ON`);
				return;
			}
			await queryRunner.query(`PRAGMA foreign_keys = ON`);
			return;
		}

		await queryRunner.query(
			`ALTER TABLE "scheduled_messages" RENAME TO "scheduled_messages_old"`,
		);

		// Best-effort reverse: restaura la UQ de dos columnas. Si ya existen
		// filas del mismo paso/participante en años distintos (el comportamiento
		// NUEVO que habilita esta migración), el INSERT viola la UQ vieja y
		// falla ruidosamente — para entonces el modelo ya avanzó y revertir
		// significaría perder envíos históricos.
		await queryRunner.query(`
			CREATE TABLE "scheduled_messages" (
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
				"error" TEXT,
				"createdAt" datetime NOT NULL DEFAULT (datetime('now')),
				"updatedAt" datetime NOT NULL DEFAULT (datetime('now')),
				"recipientTarget" varchar(30) NOT NULL DEFAULT 'participant',
				"attempts" INTEGER NOT NULL DEFAULT 0,
				"resolvedContent" TEXT,
				"resolvedContact" varchar(255),
				"recipientName" varchar(150),
				"assignedTo" varchar,
				"openedAt" datetime,
				"dispatchedBy" varchar,
				CONSTRAINT "FK_scheduled_messages_sequence" FOREIGN KEY ("sequenceId") REFERENCES "message_sequences" ("id") ON DELETE CASCADE,
				CONSTRAINT "FK_scheduled_messages_step" FOREIGN KEY ("stepId") REFERENCES "sequence_steps" ("id") ON DELETE CASCADE,
				CONSTRAINT "FK_scheduled_messages_participant" FOREIGN KEY ("participantId") REFERENCES "participants" ("id") ON DELETE CASCADE,
				CONSTRAINT "FK_scheduled_messages_retreat" FOREIGN KEY ("retreatId") REFERENCES "retreat" ("id") ON DELETE CASCADE,
				CONSTRAINT "UQ_scheduled_step_participant" UNIQUE ("stepId", "participantId")
			)
		`);

		await queryRunner.query(`
			INSERT INTO "scheduled_messages" (
				"id", "sequenceId", "stepId", "participantId", "retreatId",
				"channel", "templateType", "recipientTarget", "scheduledFor",
				"status", "sentAt", "error", "attempts",
				"resolvedContent", "resolvedContact", "recipientName",
				"assignedTo", "openedAt", "dispatchedBy",
				"createdAt", "updatedAt"
			)
			SELECT
				sm."id", sm."sequenceId", sm."stepId", sm."participantId", sm."retreatId",
				sm."channel", sm."templateType", sm."recipientTarget", sm."scheduledFor",
				sm."status", sm."sentAt", sm."error", sm."attempts",
				sm."resolvedContent", sm."resolvedContact", sm."recipientName",
				sm."assignedTo", sm."openedAt", sm."dispatchedBy",
				sm."createdAt", sm."updatedAt"
			FROM "scheduled_messages_old" sm
		`);

		await queryRunner.query(`DROP TABLE "scheduled_messages_old"`);

		await this.recreateIndexes(queryRunner);

		await queryRunner.query(`PRAGMA foreign_keys = ON`);

		const orphans = await queryRunner.query(`PRAGMA foreign_key_check`);
		if (orphans && orphans.length > 0) {
			throw new Error(`FK integrity broken after migration: ${JSON.stringify(orphans)}`);
		}
	}

	private async createTable(queryRunner: QueryRunner, name: string): Promise<void> {
		await queryRunner.query(`
			CREATE TABLE "${name}" (
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
				"error" TEXT,
				"createdAt" datetime NOT NULL DEFAULT (datetime('now')),
				"updatedAt" datetime NOT NULL DEFAULT (datetime('now')),
				"recipientTarget" varchar(30) NOT NULL DEFAULT 'participant',
				"attempts" INTEGER NOT NULL DEFAULT 0,
				"resolvedContent" TEXT,
				"resolvedContact" varchar(255),
				"recipientName" varchar(150),
				"assignedTo" varchar,
				"openedAt" datetime,
				"dispatchedBy" varchar,
				"occurrenceYear" integer NOT NULL DEFAULT 0,
				CONSTRAINT "FK_scheduled_messages_sequence" FOREIGN KEY ("sequenceId") REFERENCES "message_sequences" ("id") ON DELETE CASCADE,
				CONSTRAINT "FK_scheduled_messages_step" FOREIGN KEY ("stepId") REFERENCES "sequence_steps" ("id") ON DELETE CASCADE,
				CONSTRAINT "FK_scheduled_messages_participant" FOREIGN KEY ("participantId") REFERENCES "participants" ("id") ON DELETE CASCADE,
				CONSTRAINT "FK_scheduled_messages_retreat" FOREIGN KEY ("retreatId") REFERENCES "retreat" ("id") ON DELETE CASCADE,
				CONSTRAINT "UQ_scheduled_step_participant_year" UNIQUE ("stepId", "participantId", "occurrenceYear")
			)
		`);
	}

	private async recreateIndexes(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			`CREATE INDEX IF NOT EXISTS "IDX_scheduled_messages_due" ON "scheduled_messages" ("scheduledFor")`,
		);
		await queryRunner.query(
			`CREATE INDEX IF NOT EXISTS "IDX_scheduled_messages_status" ON "scheduled_messages" ("status")`,
		);
	}
}
