import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Agrega dos tipos de plantilla para el flujo de armado de mesas:
 *
 *   - TABLE_LEADER_BRIEFING: el briefing que el coordinador envía a cada
 *     líder/colíder, con el roster de caminantes (teléfonos propios + ambos
 *     contactos de emergencia) y el guion a usar con cada caminante.
 *   - WALKER_CONFIRMATION: el mensaje de confirmación de asistencia que se
 *     envía a cada caminante, con los datos del retiro ya resueltos
 *     ({retreat.parish}, {retreat.walkerArrivalTime}, {retreat.thingsToBringNotes}).
 *
 * Solo `global_message_templates` tiene CHECK sobre `type`, así que recreamos
 * únicamente esa tabla. `message_templates` ya NO tiene CHECK (es VARCHAR
 * libre tras la migración que le agregó `scope`/`communityId`), por lo que solo
 * insertamos en ella.
 *
 * Pasos:
 *   1. Recrear `global_message_templates` con el CHECK ampliado.
 *   2. Seed global idempotente (skip si ya existe por `name`).
 *   3. Copiar cada plantilla a cada retiro existente que aún no la tenga
 *      (los retiros nuevos la reciben vía copyAllActiveTemplatesToRetreat).
 *
 * NO importa `@repo/types` (regla del repo: migraciones de prod no encadenan a
 * paquetes del workspace con `main` `.ts`). Usa literales SQL.
 */
export class AddTableLeaderBriefingTemplate20260608120000 implements MigrationInterface {
	name = 'AddTableLeaderBriefingTemplate20260608120000';
	timestamp = '20260608120000';

	// CRÍTICO: salir de la transacción implícita para que PRAGMA foreign_keys=OFF
	// surta efecto durante el recreate-table (ver sqlite-migrations skill).
	transaction = false as const;

	private static readonly TEMPLATES: Array<{ name: string; type: string; message: string }> = [
		{
			name: 'Briefing de Mesa para Líderes',
			type: 'TABLE_LEADER_BRIEFING',
			message: `<p>Hola {participant.firstName}, esta es la información de tu mesa <strong>{table.name}</strong>.</p>
<p><strong>Caminantes ({table.walkersCount}):</strong></p>
<p>{table.walkersRoster}</p>
<hr>
<p><strong>Mensaje a enviar a cada caminante:</strong></p>
<p>Hola, ¿hablo con [nombre del caminante]? Te escribo de parte del Retiro de Emaús de {retreat.parish}. Te contacto para confirmar tu asistencia y darte la bienvenida. ¿Contamos contigo este fin de semana?</p>
<p>Solo recuerda llevar: {retreat.thingsToBringNotes}</p>
<p>Es importante que llegues directamente a la casa de retiro, a más tardar a las {retreat.walkerArrivalTime}. Toma en cuenta que no hay transporte organizado, y de preferencia que alguien te lleve porque no hay estacionamiento. ¿Sabes cómo llegar o te paso la dirección?</p>
<p>Cualquier duda que tengas, aquí estoy para apoyarte. Nos vemos el fin de semana. ¡Que Dios te bendiga!</p>`,
		},
		{
			name: 'Confirmación de Asistencia (Caminante)',
			type: 'WALKER_CONFIRMATION',
			message: `<p>Hola, ¿hablo con {participant.firstName}? Te escribo de parte del Retiro de Emaús de {retreat.parish}.</p>
<p>Te contacto para confirmar tu asistencia y darte la bienvenida. ¿Contamos contigo este fin de semana?</p>
<p>Solo recuerda llevar: {retreat.thingsToBringNotes}</p>
<p>Es importante que llegues directamente a la casa de retiro, a más tardar a las {retreat.walkerArrivalTime}. Toma en cuenta que no hay transporte organizado, y de preferencia que alguien te lleve porque no hay estacionamiento. ¿Sabes cómo llegar o te paso la dirección?</p>
<p>Cualquier duda que tengas, aquí estoy para apoyarte. Nos vemos el fin de semana. ¡Que Dios te bendiga!</p>`,
		},
	];

	private static readonly NEW_CHECK = `(
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
		'SYS_ROLE_REQUESTED', 'SYS_ROLE_APPROVED', 'SYS_ROLE_REJECTED'
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
		'FAMILY_CLOSING_INVITATION_WHATSAPP', 'FAMILY_CLOSING_INVITATION_EMAIL',
		'SYS_PASSWORD_RESET', 'SYS_USER_INVITATION', 'SYS_REGISTRATION_CONFIRMATION',
		'SYS_EMAIL_VERIFICATION', 'SYS_ACCOUNT_LOCKED', 'SYS_ACCOUNT_UNLOCKED',
		'SYS_ROLE_REQUESTED', 'SYS_ROLE_APPROVED', 'SYS_ROLE_REJECTED'
	)`;

	// printf que genera un UUID v4-like por fila (mismo patrón que migraciones previas).
	private static readonly UUID_EXPR = `printf('%s-%s-%s-%s-%s',
		substr(lower(hex(randomblob(16))), 1, 8),
		substr(lower(hex(randomblob(16))), 1, 4),
		substr(lower(hex(randomblob(16))), 1, 4),
		substr(lower(hex(randomblob(16))), 1, 4),
		substr(lower(hex(randomblob(16))), 1, 12)
	)`;

	public async up(queryRunner: QueryRunner): Promise<void> {
		const C = AddTableLeaderBriefingTemplate20260608120000;

		await queryRunner.query(`PRAGMA foreign_keys = OFF`);

		// 1) Recrear global_message_templates con el CHECK ampliado.
		await queryRunner.query(`
			CREATE TABLE "global_message_templates_new" (
				"id" VARCHAR(36) PRIMARY KEY NOT NULL,
				"name" VARCHAR(255) NOT NULL,
				"type" VARCHAR(255) NOT NULL CHECK ("type" IN ${C.NEW_CHECK}),
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
		await queryRunner.query(
			`ALTER TABLE "global_message_templates_new" RENAME TO "global_message_templates"`,
		);

		await queryRunner.query(`PRAGMA foreign_keys = ON`);
		const fkCheck = await queryRunner.query(`PRAGMA foreign_key_check`);
		if (fkCheck && fkCheck.length > 0) {
			throw new Error(
				`[AddTableLeaderBriefingTemplate] FK violations after recreate: ${JSON.stringify(fkCheck)}`,
			);
		}

		for (const tpl of C.TEMPLATES) {
			// 2) Seed global idempotente (skip si ya existe por name).
			await queryRunner.query(
				`
				INSERT INTO global_message_templates (id, name, type, message, isActive, createdAt, updatedAt)
				SELECT ${C.UUID_EXPR}, ?, ?, ?, 1, datetime('now'), datetime('now')
				WHERE NOT EXISTS (SELECT 1 FROM global_message_templates WHERE name = ?)
				`,
				[tpl.name, tpl.type, tpl.message, tpl.name],
			);

			// 3) Copiar a cada retiro existente que aún no la tenga.
			await queryRunner.query(
				`
				INSERT INTO message_templates (id, name, type, scope, message, retreatId, createdAt, updatedAt)
				SELECT ${C.UUID_EXPR}, ?, ?, 'retreat', ?, r.id, datetime('now'), datetime('now')
				FROM retreat r
				WHERE NOT EXISTS (
					SELECT 1 FROM message_templates mt
					WHERE mt.retreatId = r.id AND mt.type = ?
				)
				`,
				[tpl.name, tpl.type, tpl.message, tpl.type],
			);
		}
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		const C = AddTableLeaderBriefingTemplate20260608120000;
		const types = C.TEMPLATES.map((t) => `'${t.type}'`).join(',');

		await queryRunner.query(`PRAGMA foreign_keys = OFF`);

		// Borrar las plantillas insertadas (retiro + global) por type.
		await queryRunner.query(`DELETE FROM message_templates WHERE type IN (${types})`);
		await queryRunner.query(`DELETE FROM global_message_templates WHERE type IN (${types})`);

		// Recrear global_message_templates con el CHECK viejo.
		await queryRunner.query(`
			CREATE TABLE "global_message_templates_old" (
				"id" VARCHAR(36) PRIMARY KEY NOT NULL,
				"name" VARCHAR(255) NOT NULL,
				"type" VARCHAR(255) NOT NULL CHECK ("type" IN ${C.OLD_CHECK}),
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
		await queryRunner.query(
			`ALTER TABLE "global_message_templates_old" RENAME TO "global_message_templates"`,
		);

		await queryRunner.query(`PRAGMA foreign_keys = ON`);
	}
}
