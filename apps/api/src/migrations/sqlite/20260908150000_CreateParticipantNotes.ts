import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Hilo de seguimiento por persona: notas escritas por el coordinador y eventos
 * del sistema (cambio de etapa, hito de palancas).
 *
 * `ParticipantFollowUp.note` es un único campo que se sobrescribe, así que no
 * conserva quién escribió qué ni cuándo. Esta tabla es append-only y es además
 * el único registro de *cuándo* se confirmó la asistencia
 * (`retreat_participants.attendanceConfirmation` no tiene columna de fecha).
 *
 * Ojo con los nombres de tabla del repo: `participants` y `users` en plural,
 * `retreat` y `community` en singular. Los tests usan `synchronize` y no
 * detectan una FK colgada.
 */
export class CreateParticipantNotes20260908150000 implements MigrationInterface {
	name = 'CreateParticipantNotes20260908150000';
	// El down() hace DROP TABLE — el guard sqliteSafePattern lo exige.
	transaction = false as const;

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`
			CREATE TABLE IF NOT EXISTS "participant_notes" (
				"id" varchar PRIMARY KEY NOT NULL,
				"participantId" varchar NOT NULL,
				"scope" varchar(20) NOT NULL,
				"retreatId" varchar,
				"communityId" varchar,
				"kind" varchar(20) NOT NULL DEFAULT ('note'),
				"body" text,
				"metadata" text,
				"createdBy" varchar,
				"createdAt" datetime NOT NULL DEFAULT (datetime('now')),
				"updatedAt" datetime NOT NULL DEFAULT (datetime('now')),
				CONSTRAINT "FK_participant_notes_participant" FOREIGN KEY ("participantId")
					REFERENCES "participants" ("id") ON DELETE CASCADE,
				CONSTRAINT "FK_participant_notes_retreat" FOREIGN KEY ("retreatId")
					REFERENCES "retreat" ("id") ON DELETE CASCADE,
				CONSTRAINT "FK_participant_notes_community" FOREIGN KEY ("communityId")
					REFERENCES "community" ("id") ON DELETE CASCADE,
				CONSTRAINT "FK_participant_notes_user" FOREIGN KEY ("createdBy")
					REFERENCES "users" ("id") ON DELETE SET NULL
			)
		`);
		await queryRunner.query(`
			CREATE INDEX IF NOT EXISTS "IDX_participant_notes_thread"
				ON "participant_notes" ("participantId", "retreatId", "createdAt")
		`);
		// El hito de cartas es único por persona y retiro. La comprobación en el
		// servicio (leer y filtrar) no basta: dos guardados simultáneos —doble
		// clic en Guardar, dos pestañas— leen ambos "todavía no hay hito" antes de
		// que ninguno inserte, y el hilo acaba con dos "Alcanzó N cartas".
		// El índice parcial lo cierra en la base, que es donde se puede cerrar.
		await queryRunner.query(`
			CREATE UNIQUE INDEX IF NOT EXISTS "UQ_participant_notes_palanca_milestone"
				ON "participant_notes" ("participantId", "retreatId")
				WHERE json_extract("metadata", '$.milestone') = 'palancas'
		`);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			`DROP INDEX IF EXISTS "UQ_participant_notes_palanca_milestone"`,
		);
		await queryRunner.query(`DROP INDEX IF EXISTS "IDX_participant_notes_thread"`);
		await queryRunner.query(`DROP TABLE IF EXISTS "participant_notes"`);
	}
}
