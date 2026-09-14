import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Agrega el tipo de plantilla PALANCA_DEFINITION — la explicación de qué es
 * una palanca, como paso intermedio de la secuencia de palancas (contacto →
 * definición → recordatorios). Sin este tipo, un retiro solo puede tener DOS
 * plantillas de palanca alcanzables desde una secuencia (el paso guarda el
 * TIPO, no el id de la plantilla): el equipo de palancas de Buen Despacho
 * creó "Palanca definicion" con tipo PALANCA_REQUEST duplicado y el editor
 * de secuencias no podía seleccionarla (incidente 2026-09-13).
 *
 * Qué hace:
 *   1. Recrea `global_message_templates` con el CHECK ampliado (la tabla no
 *      tiene FKs entrantes, pero seguimos el patrón seguro por convención).
 *   2. Seed idempotente de la plantilla global "Definición de Palanca"
 *      (texto del equipo de palancas de Buen Despacho). Los retiros nuevos
 *      la heredan vía copyAllActiveTemplatesToRetreat.
 *   3. Backfill: en retiros NO terminados, la plantilla PALANCA_REQUEST
 *      duplicada más reciente pasa a PALANCA_DEFINITION. Así "Palanca
 *      definicion" de Buen Despacho queda usable al desplegar, sin edición
 *      manual. Los retiros ya terminados no se tocan (sus plantillas son
 *      inertes).
 *
 * Sin import de @repo/types (regla de migrations que corren en prod):
 * solo typeorm + literales.
 */
export class AddPalancaDefinitionTemplate20260913190000 implements MigrationInterface {
	name = 'AddPalancaDefinitionTemplate20260913190000';
	timestamp = '20260913190000';

	// CRÍTICO: fuera de transacción para que PRAGMA foreign_keys = OFF
	// no sea ignorado por SQLite (ver .ruler/skills/sqlite-migrations).
	transaction = false as const;

	private static readonly NEW_CHECK = `(
		'WALKER_WELCOME', 'SERVER_WELCOME', 'EMERGENCY_CONTACT_VALIDATION',
		'PALANCA_REQUEST', 'PALANCA_REMINDER', 'PALANCA_DEFINITION', 'GENERAL',
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
		'SERVER_CONVOCATION', 'SERVER_SHIRT_CONFIRMATION', 'SERVER_SHIRT_CONFIRMATION_REMINDER'
	)`;

	private static readonly OLD_CHECK = `(
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
		'SERVER_CONVOCATION', 'SERVER_SHIRT_CONFIRMATION', 'SERVER_SHIRT_CONFIRMATION_REMINDER'
	)`;

	/** Texto del equipo de palancas de Buen Despacho (2026-09-13), verbatim. */
	private static readonly SEED_MESSAGE = `<p style="text-align: left;">El regalo SORPRESA!! son unas cartas de amor, admiración y apoyo para él.&nbsp;</p><p style="text-align: left;">Nosotros le llamamos ¨Palancas.¨&nbsp;</p><p style="text-align: left;">Te pedimos si puedes pedir estas cartas a su familia y amigos, pídele a las personas importantes para él. Obviamente las de su familia son las más importantes. Pero entre más le consigas mejor!!!&nbsp;</p><p style="text-align: left;">Pueden ser cartas, fotos, dibujos!!!&nbsp;</p><p style="text-align: left;"><em>Estas cartas tienen que estar listas a más tardar el {retreat.startDate}</em></p><p style="text-align: left;">**Para hacer llegar las cartas tenemos este correo:</p><p style="text-align: left;"><a target="_blank" rel="noopener noreferrer nofollow" href="mailto:emaus.palancas.mex@gmail.com">emaus.palancas.mex@gmail.com</a>&nbsp;</p><p style="text-align: left;">Es importante poner en el título del correo el nombre y apellido de {participant.firstName} para que podamos identificarlas y entregarlas correctamente.</p><p style="text-align: left;">Muchas gracias por tu apoyo, estoy a tus órdenes para cualquier duda que pueda surgir.</p><p style="text-align: left;">&nbsp;{participant.palanqueroName}</p>`;

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`PRAGMA foreign_keys = OFF`);

		// Re-ejecutable si un intento anterior murió entre CREATE y RENAME.
		await queryRunner.query(`DROP TABLE IF EXISTS "global_message_templates_new"`);

		// 1) Recrear la tabla con el CHECK ampliado.
		await queryRunner.query(`
			CREATE TABLE "global_message_templates_new" (
				"id" VARCHAR(36) PRIMARY KEY NOT NULL,
				"name" VARCHAR(255) NOT NULL,
				"type" VARCHAR(255) NOT NULL CHECK ("type" IN ${AddPalancaDefinitionTemplate20260913190000.NEW_CHECK}),
				"message" TEXT NOT NULL,
				"isActive" BOOLEAN NOT NULL DEFAULT (1),
				"createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
				"updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
			)
		`);

		await queryRunner.query(`
			INSERT INTO "global_message_templates_new"
				(id, name, type, message, isActive, createdAt, updatedAt)
			SELECT id, name, type, message, isActive, createdAt, updatedAt
			FROM "global_message_templates"
		`);

		await queryRunner.query(`DROP TABLE "global_message_templates"`);
		await queryRunner.query(`ALTER TABLE "global_message_templates_new" RENAME TO "global_message_templates"`);

		await queryRunner.query(`PRAGMA foreign_keys = ON`);
		const fkCheck = await queryRunner.query(`PRAGMA foreign_key_check`);
		if (fkCheck && fkCheck.length > 0) {
			throw new Error(
				`[AddPalancaDefinitionTemplate] FK violations after recreate: ${JSON.stringify(fkCheck)}`,
			);
		}

		// 2) Seed idempotente — skip si ya existe una plantilla con ese name.
		await queryRunner.query(
			`
			INSERT INTO global_message_templates (id, name, type, message, isActive, createdAt, updatedAt)
			SELECT
				printf('%s-%s-%s-%s-%s',
					substr(lower(hex(randomblob(16))), 1, 8),
					substr(lower(hex(randomblob(16))), 1, 4),
					substr(lower(hex(randomblob(16))), 1, 4),
					substr(lower(hex(randomblob(16))), 1, 4),
					substr(lower(hex(randomblob(16))), 1, 12)
				),
				?, ?, ?, 1, datetime('now'), datetime('now')
			WHERE NOT EXISTS (
				SELECT 1 FROM global_message_templates WHERE name = ?
			)
			`,
			[
				'Definición de Palanca',
				'PALANCA_DEFINITION',
				AddPalancaDefinitionTemplate20260913190000.SEED_MESSAGE,
				'Definición de Palanca',
			],
		);

		// 3) Backfill de duplicados en retiros no terminados: la PALANCA_REQUEST
		//    más reciente pasa a PALANCA_DEFINITION (la más antigua es la
		//    "oficial" que las secuencias ya referencian). Idempotente: las
		//    filas volteadas dejan de matchear type='PALANCA_REQUEST'.
		await queryRunner.query(`
			UPDATE message_templates
			SET type = 'PALANCA_DEFINITION', updatedAt = datetime('now')
			WHERE id IN (
				SELECT m.id
				FROM message_templates m
				JOIN retreat r ON r.id = m.retreatId
				WHERE m.type = 'PALANCA_REQUEST'
					AND m.scope = 'retreat'
					AND r.endDate >= date('now')
					AND m.createdAt > (
						SELECT MIN(m2.createdAt)
						FROM message_templates m2
						WHERE m2.retreatId = m.retreatId AND m2.type = 'PALANCA_REQUEST'
					)
			)
		`);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`PRAGMA foreign_keys = OFF`);

		// Revertir el backfill y el seed (por type, no por id).
		await queryRunner.query(
			`UPDATE message_templates SET type = 'PALANCA_REQUEST', updatedAt = datetime('now') WHERE type = 'PALANCA_DEFINITION'`,
		);
		await queryRunner.query(
			`DELETE FROM global_message_templates WHERE type = 'PALANCA_DEFINITION'`,
		);

		// Recrear la tabla con el CHECK viejo.
		await queryRunner.query(`DROP TABLE IF EXISTS "global_message_templates_old"`);
		await queryRunner.query(`
			CREATE TABLE "global_message_templates_old" (
				"id" VARCHAR(36) PRIMARY KEY NOT NULL,
				"name" VARCHAR(255) NOT NULL,
				"type" VARCHAR(255) NOT NULL CHECK ("type" IN ${AddPalancaDefinitionTemplate20260913190000.OLD_CHECK}),
				"message" TEXT NOT NULL,
				"isActive" BOOLEAN NOT NULL DEFAULT (1),
				"createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
				"updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
			)
		`);
		await queryRunner.query(`
			INSERT INTO "global_message_templates_old"
				(id, name, type, message, isActive, createdAt, updatedAt)
			SELECT id, name, type, message, isActive, createdAt, updatedAt
			FROM "global_message_templates"
		`);
		await queryRunner.query(`DROP TABLE "global_message_templates"`);
		await queryRunner.query(`ALTER TABLE "global_message_templates_old" RENAME TO "global_message_templates"`);

		await queryRunner.query(`PRAGMA foreign_keys = ON`);
	}
}
