import { MigrationInterface, QueryRunner } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';

/**
 * Two additions that only make sense once a retreat can belong to a community.
 *
 * 1. `retreat_preparation.communityMeetingId` — bridges the two halves of the
 *    server team's preparation. The calendar owns the weeks and their documents
 *    but takes no attendance; `community_meeting` takes attendance but knew
 *    nothing about the retreat. Remembering which meeting materialises a session
 *    is what makes re-running the sync idempotent instead of duplicating the
 *    whole series.
 *
 * 2. The server convocation, as a **WhatsApp sequence**, not a mass email.
 *    Servers come out of the community roster, so the call has to reach people
 *    who have not registered yet. It rides the existing drip engine with the new
 *    `community_roster` audience: the cron enrols the roster and each message
 *    lands in the assisted WhatsApp queue, which the coordinator dispatches one
 *    tap at a time from their own phone. Nothing is ever sent unattended — the
 *    channel decision documented in `docs/features/crm-messaging.md`.
 *
 *    Seeds the `SERVER_CONVOCATION` template (global + per retreat, so the step
 *    finds it) and the importable global sequence. The imported copy arrives
 *    INACTIVE, like the rest of the pack.
 *
 * The column is a plain ADD COLUMN with no physical FK: SQLite cannot add one
 * through ALTER, and recreating a table that has incoming foreign keys is the
 * operation that already destroyed data in this repo (skill `sqlite-migrations`).
 * A dangling id — the meeting deleted from the community module — reads as "not
 * synced" and the next sync recreates it.
 */
export class PreparationSyncAndConvocation20260907200000 implements MigrationInterface {
	name = 'PreparationSyncAndConvocation20260907200000';
	timestamp = '20260907200000';

	// El runner propio del proyecto IGNORA esta propiedad (la transacción la decide
	// el flag CLI `--transaction`, por defecto OFF); se declara porque el guard
	// `sqliteSafePattern.simple.test.ts` la exige en cuanto hay un DROP TABLE, y
	// porque documenta el requisito: con una transacción envolvente SQLite ignora
	// el `PRAGMA foreign_keys = OFF` en silencio.
	transaction = false as const;

	/** IDs estables para que la siembra sea idempotente y el down() sepa qué borrar. */
	private readonly SEQ_ID = 'c0a70000-0000-4000-a000-000000000001';
	private readonly STEP_ID = 'c0a70000-0000-4000-a000-000000000002';

	private static readonly TEMPLATE_NAME = 'Convocatoria de servidores';
	private static readonly TEMPLATE_MESSAGE = `Hola {participant.firstName}, ¿te late servir en el próximo retiro?

Es {retreat.parish}, del {retreat.startDate} al {retreat.endDate}.

Si quieres estar, regístrate aquí: {retreat.serverRegistrationLink}

Cualquier duda me dices. ¡Sería un gusto tenerte en el equipo!`;

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			`ALTER TABLE "retreat_preparation" ADD COLUMN "communityMeetingId" varchar`,
		);
		await queryRunner.query(
			`CREATE INDEX IF NOT EXISTS "idx_retreat_preparation_community_meeting" ON "retreat_preparation" ("communityMeetingId")`,
		);

		const C = PreparationSyncAndConvocation20260907200000;

		// El `CHECK` de `global_message_templates.type` es una lista fija que no
		// incluye 'SERVER_CONVOCATION', así que sin extenderla el INSERT de abajo
		// falla con SQLITE_CONSTRAINT_CHECK. Y hace falta la fila GLOBAL, no sólo
		// las por-retiro: `retreatService.createRetreat` llama a
		// `copyAllActiveTemplatesToRetreat`, así que un retiro creado DESPUÉS de
		// esta migración se quedaría sin la plantilla y el paso de la secuencia se
		// omitiría con "sin plantilla" — el mismo fallo silencioso que ya tuvo la
		// invitación de clausura.
		//
		// SQLite no permite modificar un CHECK por ALTER, así que toca recreate.
		// Es seguro aquí: la tabla NO tiene FKs entrantes (verificado contra
		// sqlite_master), que es el escenario que borró datos en el incidente de
		// 2026-05-07. Se conserva el CHECK en vez de quitarlo: sigue siendo una
		// red útil, sólo estaba corta.
		await this.recreateGlobalTemplateTypeCheck(queryRunner, true);

		// Plantilla global (aparece en el selector de plantillas globales).
		const existingGlobal = await queryRunner.query(
			`SELECT id FROM "global_message_templates" WHERE "type" = 'SERVER_CONVOCATION'`,
		);
		if (existingGlobal.length === 0) {
			await queryRunner.query(
				`INSERT INTO "global_message_templates" ("id", "name", "type", "message", "isActive", "createdAt", "updatedAt")
				 VALUES (?, ?, 'SERVER_CONVOCATION', ?, 1, datetime('now'), datetime('now'))`,
				[uuidv4(), C.TEMPLATE_NAME, C.TEMPLATE_MESSAGE],
			);
		}

		// Y por retiro: el paso de la secuencia resuelve `templateType` contra las
		// plantillas DEL RETIRO al procesar. Sin esta copia el mensaje se omitiría
		// con "sin plantilla", que es el fallo silencioso que ya pasó con la
		// invitación de clausura.
		const retreats: { id: string }[] = await queryRunner.query(`SELECT id FROM "retreat"`);
		for (const retreat of retreats) {
			const existing = await queryRunner.query(
				`SELECT id FROM "message_templates" WHERE "retreatId" = ? AND "type" = 'SERVER_CONVOCATION'`,
				[retreat.id],
			);
			if (existing.length > 0) continue;
			await queryRunner.query(
				`INSERT INTO "message_templates" ("id", "name", "type", "scope", "message", "retreatId", "createdAt", "updatedAt")
				 VALUES (?, ?, 'SERVER_CONVOCATION', 'retreat', ?, ?, datetime('now'), datetime('now'))`,
				[uuidv4(), C.TEMPLATE_NAME, C.TEMPLATE_MESSAGE, retreat.id],
			);
		}

		// Secuencia global importable. `days_before_retreat` con 45 días de margen:
		// convocar es lo primero que se hace, mucho antes que las palancas.
		await queryRunner.query(
			`INSERT OR IGNORE INTO "global_message_sequences"
				("id", "name", "description", "trigger", "audience", "isActive")
			 VALUES (?, ?, ?, 'days_before_retreat', 'community_roster', 1)`,
			[
				this.SEQ_ID,
				'Convocatoria de servidores (WhatsApp)',
				'Invita al padrón de la comunidad vinculada al retiro a servir, 45 días antes. Cada mensaje se despacha a mano desde la bandeja de WhatsApp.',
			],
		);
		await queryRunner.query(
			`INSERT OR IGNORE INTO "global_sequence_steps"
				("id", "sequenceId", "stepOrder", "offsetDays", "sendHour", "templateType", "channel", "recipientTarget", "recipientResponsibility", "condition")
			 VALUES (?, ?, 0, 45, 10, 'SERVER_CONVOCATION', 'whatsapp', 'participant', NULL, NULL)`,
			[this.STEP_ID, this.SEQ_ID],
		);
	}

	/**
	 * Recrea `global_message_templates` para que su `CHECK` de `type` incluya (o
	 * no) 'SERVER_CONVOCATION'. Patrón recreate-table del skill
	 * `sqlite-migrations`: PRAGMA OFF fuera de transacción, columnas explícitas
	 * (nunca `SELECT *`), y verificación de integridad al final.
	 */
	private async recreateGlobalTemplateTypeCheck(
		queryRunner: QueryRunner,
		withConvocation: boolean,
	): Promise<void> {
		const types = [
			'WALKER_WELCOME', 'SERVER_WELCOME', 'EMERGENCY_CONTACT_VALIDATION',
			'PALANCA_REQUEST', 'PALANCA_REMINDER', 'GENERAL',
			'PRE_RETREAT_REMINDER', 'PAYMENT_REMINDER', 'POST_RETREAT_MESSAGE',
			'CANCELLATION_CONFIRMATION', 'USER_INVITATION', 'PASSWORD_RESET',
			'RETREAT_SHARED_NOTIFICATION', 'BIRTHDAY_MESSAGE', 'PALANQUERO_NEW_WALKER',
			'PRIVACY_DATA_DELETE',
			'WALKER_FOLLOWUP_WEEK_1', 'WALKER_FOLLOWUP_MONTH_1', 'WALKER_FOLLOWUP_MONTH_3',
			'WALKER_FOLLOWUP_MONTH_6', 'WALKER_FOLLOWUP_YEAR_1', 'WALKER_REUNION_INVITATION',
			'TABLE_LEADER_BRIEFING', 'WALKER_CONFIRMATION',
			'FAMILY_CLOSING_INVITATION_WHATSAPP', 'FAMILY_CLOSING_INVITATION_EMAIL',
			'SYS_PASSWORD_RESET', 'SYS_USER_INVITATION', 'SYS_REGISTRATION_CONFIRMATION',
			'SYS_EMAIL_VERIFICATION', 'SYS_ACCOUNT_LOCKED', 'SYS_ACCOUNT_UNLOCKED',
			'SYS_ROLE_REQUESTED', 'SYS_ROLE_APPROVED', 'SYS_ROLE_REJECTED',
		];
		if (withConvocation) types.push('SERVER_CONVOCATION');
		const allowed = types.map((t) => `'${t}'`).join(', ');

		await queryRunner.query(`PRAGMA foreign_keys = OFF`);
		await queryRunner.query(`DROP TABLE IF EXISTS "global_message_templates_new"`);
		await queryRunner.query(`
			CREATE TABLE "global_message_templates_new" (
				"id" VARCHAR(36) PRIMARY KEY NOT NULL,
				"name" VARCHAR(255) NOT NULL,
				"type" VARCHAR(255) NOT NULL CHECK ("type" IN (${allowed})),
				"message" TEXT NOT NULL,
				"isActive" BOOLEAN NOT NULL DEFAULT (1),
				"createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
				"updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
			)
		`);
		await queryRunner.query(`
			INSERT INTO "global_message_templates_new"
				("id", "name", "type", "message", "isActive", "createdAt", "updatedAt")
			SELECT "id", "name", "type", "message", "isActive", "createdAt", "updatedAt"
			FROM "global_message_templates"
		`);
		await queryRunner.query(`DROP TABLE "global_message_templates"`);
		await queryRunner.query(
			`ALTER TABLE "global_message_templates_new" RENAME TO "global_message_templates"`,
		);
		await queryRunner.query(`PRAGMA foreign_keys = ON`);
		const orphans = await queryRunner.query(`PRAGMA foreign_key_check`);
		if (orphans && orphans.length > 0) {
			throw new Error(`FK integrity broken after recreate: ${JSON.stringify(orphans)}`);
		}
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		const C = PreparationSyncAndConvocation20260907200000;
		await queryRunner.query(`DELETE FROM "global_sequence_steps" WHERE "id" = ?`, [this.STEP_ID]);
		await queryRunner.query(`DELETE FROM "global_message_sequences" WHERE "id" = ?`, [
			this.SEQ_ID,
		]);
		// Sólo las plantillas con el texto sembrado: si el coordinador la editó, es
		// suya y no se borra.
		await queryRunner.query(
			`DELETE FROM "message_templates" WHERE "type" = 'SERVER_CONVOCATION' AND "message" = ?`,
			[C.TEMPLATE_MESSAGE],
		);
		// Cualquier fila con el tipo nuevo tiene que irse ANTES de restaurar el
		// CHECK estrecho, o el INSERT del recreate la rechazaría.
		await queryRunner.query(
			`DELETE FROM "global_message_templates" WHERE "type" = 'SERVER_CONVOCATION'`,
		);
		await this.recreateGlobalTemplateTypeCheck(queryRunner, false);
		await queryRunner.query(`DROP INDEX IF EXISTS "idx_retreat_preparation_community_meeting"`);
		await queryRunner.query(
			`ALTER TABLE "retreat_preparation" DROP COLUMN "communityMeetingId"`,
		);
	}
}
