import { MigrationInterface, QueryRunner } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';

/**
 * Plantilla del briefing de tareas del servidor (scope {assignments.*}):
 * responsabilidades + equipos de servicio, en texto plano WhatsApp para el
 * envío asistido uno por uno desde la vista de Responsabilidades.
 *
 * Pasos (patrón de 20261014120000_AddSantisimoGuardiaInviteTemplate):
 *   1. Recrear `global_message_templates` con el CHECK de `type` ampliado
 *      (la tabla no acepta ALTER sobre el CHECK; sin esto el INSERT falla
 *      con SQLITE_CONSTRAINT_CHECK).
 *   2. Seed global idempotente (skip si ya existe por type).
 *   3. Copia a cada retiro existente que aún no la tenga (los retiros nuevos
 *      la reciben vía copyAllActiveTemplatesToRetreat).
 *
 * No crea secuencia: el envío es manual y con revisión, a criterio del
 * coordinador.
 *
 * NO importa `@repo/types` (regla del repo: migraciones de prod no encadenan
 * a paquetes del workspace con `main` `.ts`). Usa literales SQL + uuid.
 */
export class AddServerAssignmentsBriefingTemplate20261015130000 implements MigrationInterface {
	name = 'AddServerAssignmentsBriefingTemplate20261015130000';
	timestamp = '20261015130000';

	// CRÍTICO: fuera de transacción para que PRAGMA foreign_keys=OFF no sea
	// ignorado por SQLite durante el recreate (ver skill sqlite-migrations).
	transaction = false as const;

	private static readonly TEMPLATE_TYPE = 'SERVER_ASSIGNMENTS_BRIEFING';
	private static readonly TEMPLATE_NAME = 'Tareas del Servidor — responsabilidades y equipos';

	// WhatsApp = texto plano desde 20260914 (FormatWhatsappMessageTemplates).
	// Borrador: el texto que sale a servidores se revisa con la organización
	// antes de dar por cerrada la feature.
	private static readonly TEMPLATE_MESSAGE = `Hola {participant.firstName}, estas son tus tareas para el retiro de Emaús de {retreat.parish} 📋

*Tus responsabilidades ({assignments.responsibilitiesCount}):*
{assignments.responsibilitiesRoster}

*Tus equipos de servicio ({assignments.teamsCount}):*
{assignments.teamsRoster}

Cualquier duda, responde a este mensaje. ¡Gracias por tu servicio! 🙏`;

	// CHECK vigente (el de 20261014120000 tras añadir SANTISIMO_GUARDIA_INVITE)
	// + el tipo nuevo.
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
		'SERVER_CONVOCATION', 'SERVER_SHIRT_CONFIRMATION', 'SERVER_SHIRT_CONFIRMATION_REMINDER',
		'SANTISIMO_GUARDIA_INVITE', 'SERVER_ASSIGNMENTS_BRIEFING'
	)`;

	private static readonly OLD_CHECK = `(
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
		'SERVER_CONVOCATION', 'SERVER_SHIRT_CONFIRMATION', 'SERVER_SHIRT_CONFIRMATION_REMINDER',
		'SANTISIMO_GUARDIA_INVITE'
	)`;

	public async up(queryRunner: QueryRunner): Promise<void> {
		const C = AddServerAssignmentsBriefingTemplate20261015130000;

		await queryRunner.query(`PRAGMA foreign_keys = OFF`);

		// Re-ejecutable si un intento anterior murió entre CREATE y RENAME.
		await queryRunner.query(`DROP TABLE IF EXISTS "global_message_templates_new"`);

		// 1) Recrear la tabla con el CHECK ampliado. Sin FKs entrantes (igual
		// que 20260907/20260913/20261014): el recreate es seguro.
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
				`[AddServerAssignmentsBriefingTemplate] FK violations after recreate: ${JSON.stringify(fkCheck)}`,
			);
		}

		// 2) Plantilla global (el selector de plantillas globales y los retiros
		// nuevos vía copyAllActiveTemplatesToRetreat la necesitan).
		const existingGlobal = await queryRunner.query(
			`SELECT id FROM "global_message_templates" WHERE "type" = ?`,
			[C.TEMPLATE_TYPE],
		);
		if (existingGlobal.length === 0) {
			await queryRunner.query(
				`INSERT INTO "global_message_templates" ("id", "name", "type", "message", "isActive", "createdAt", "updatedAt")
				 VALUES (?, ?, ?, ?, 1, datetime('now'), datetime('now'))`,
				[uuidv4(), C.TEMPLATE_NAME, C.TEMPLATE_TYPE, C.TEMPLATE_MESSAGE],
			);
		}

		// 3) Copia a cada retiro existente que aún no la tenga: el dialog de
		// envío lista plantillas del retiro.
		const retreats: { id: string }[] = await queryRunner.query(`SELECT id FROM "retreat"`);
		for (const retreat of retreats) {
			const existing = await queryRunner.query(
				`SELECT id FROM "message_templates" WHERE "retreatId" = ? AND "type" = ?`,
				[retreat.id, C.TEMPLATE_TYPE],
			);
			if (existing.length > 0) continue;
			await queryRunner.query(
				`INSERT INTO "message_templates" ("id", "name", "type", "scope", "message", "retreatId", "createdAt", "updatedAt")
				 VALUES (?, ?, ?, 'retreat', ?, ?, datetime('now'), datetime('now'))`,
				[uuidv4(), C.TEMPLATE_NAME, C.TEMPLATE_TYPE, C.TEMPLATE_MESSAGE, retreat.id],
			);
		}
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		const C = AddServerAssignmentsBriefingTemplate20261015130000;

		await queryRunner.query(`PRAGMA foreign_keys = OFF`);

		// Borrar las plantillas sembradas (retiro + global) por type.
		await queryRunner.query(`DELETE FROM "message_templates" WHERE "type" = ?`, [
			C.TEMPLATE_TYPE,
		]);
		await queryRunner.query(`DELETE FROM "global_message_templates" WHERE "type" = ?`, [
			C.TEMPLATE_TYPE,
		]);

		// Recrear con el CHECK previo.
		await queryRunner.query(`DROP TABLE IF EXISTS "global_message_templates_old"`);
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
