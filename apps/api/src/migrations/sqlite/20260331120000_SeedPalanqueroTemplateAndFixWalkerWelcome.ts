import { MigrationInterface, QueryRunner } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';

const PALANQUERO_TEMPLATE_MESSAGE = `<p>¡Hola!</p>
<p>Se ha registrado un nuevo caminante en el retiro <strong>{retreat.parish}</strong>.</p>
<p><strong>Datos del caminante:</strong></p>
<ul>
<li>Nombre: {participant.firstName} {participant.lastName}</li>
<li>Email: {participant.email}</li>
<li>Teléfono: {participant.cellPhone}</li>
<li>Invitado por: {participant.invitedBy}</li>
</ul>`;

export class SeedPalanqueroTemplateAndFixWalkerWelcome20260331120000
	implements MigrationInterface
{
	name = 'SeedPalanqueroTemplateAndFixWalkerWelcome20260331120000';
	timestamp = '20260331120000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		// 0. Recreate global_message_templates with updated CHECK constraint (SQLite can't ALTER CHECK)
		await queryRunner.query(`CREATE TABLE "global_message_templates_new" (
			"id" VARCHAR(36) PRIMARY KEY NOT NULL,
			"name" VARCHAR(255) NOT NULL,
			"type" VARCHAR(255) NOT NULL CHECK ("type" IN (
				'WALKER_WELCOME', 'SERVER_WELCOME', 'EMERGENCY_CONTACT_VALIDATION',
				'PALANCA_REQUEST', 'PALANCA_REMINDER', 'GENERAL',
				'PRE_RETREAT_REMINDER', 'PAYMENT_REMINDER', 'POST_RETREAT_MESSAGE',
				'CANCELLATION_CONFIRMATION', 'USER_INVITATION', 'PASSWORD_RESET',
				'RETREAT_SHARED_NOTIFICATION', 'BIRTHDAY_MESSAGE', 'PALANQUERO_NEW_WALKER',
				'SYS_PASSWORD_RESET', 'SYS_USER_INVITATION', 'SYS_REGISTRATION_CONFIRMATION',
				'SYS_EMAIL_VERIFICATION', 'SYS_ACCOUNT_LOCKED', 'SYS_ACCOUNT_UNLOCKED',
				'SYS_ROLE_REQUESTED', 'SYS_ROLE_APPROVED', 'SYS_ROLE_REJECTED'
			)),
			"message" TEXT NOT NULL,
			"isActive" BOOLEAN NOT NULL DEFAULT (1),
			"createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			"updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
		)`);
		await queryRunner.query(
			`INSERT INTO "global_message_templates_new" SELECT * FROM "global_message_templates"`,
		);
		await queryRunner.query(`DROP TABLE "global_message_templates"`);
		await queryRunner.query(
			`ALTER TABLE "global_message_templates_new" RENAME TO "global_message_templates"`,
		);

		// 1. Create global PALANQUERO_NEW_WALKER template
		const globalId = uuidv4();
		await queryRunner.query(
			`INSERT INTO "global_message_templates" ("id", "name", "type", "message", "isActive", "createdAt", "updatedAt")
			 VALUES (?, 'Notificación Palanquero - Nuevo Caminante', 'PALANQUERO_NEW_WALKER', ?, 1, datetime('now'), datetime('now'))`,
			[globalId, PALANQUERO_TEMPLATE_MESSAGE],
		);

		// 2. Create PALANQUERO_NEW_WALKER template for all existing retreats
		const retreats = await queryRunner.query(`SELECT id FROM "retreat"`);
		for (const retreat of retreats) {
			const exists = await queryRunner.query(
				`SELECT 1 FROM "message_templates" WHERE "retreatId" = ? AND "type" = 'PALANQUERO_NEW_WALKER' LIMIT 1`,
				[retreat.id],
			);
			if (exists.length === 0) {
				await queryRunner.query(
					`INSERT INTO "message_templates" ("id", "name", "type", "retreatId", "message", "scope")
					 VALUES (?, 'Notificación Palanquero - Nuevo Caminante', 'PALANQUERO_NEW_WALKER', ?, ?, 'retreat')`,
					[uuidv4(), retreat.id, PALANQUERO_TEMPLATE_MESSAGE],
				);
			}
		}

		// 3. Fix WALKER_WELCOME: remove " (caminantes) / {retreat.serverArrivalTimeFriday} (servidores)"
		await queryRunner.query(
			`UPDATE "global_message_templates"
			 SET "message" = REPLACE("message",
				'{retreat.walkerArrivalTime} (caminantes) / {retreat.serverArrivalTimeFriday} (servidores)',
				'{retreat.walkerArrivalTime}')
			 WHERE "type" = 'WALKER_WELCOME'`,
		);

		await queryRunner.query(
			`UPDATE "message_templates"
			 SET "message" = REPLACE("message",
				'{retreat.walkerArrivalTime} (caminantes) / {retreat.serverArrivalTimeFriday} (servidores)',
				'{retreat.walkerArrivalTime}')
			 WHERE "type" = 'WALKER_WELCOME'`,
		);

		// 4. Fix SERVER_WELCOME: remove "{retreat.walkerArrivalTime} (caminantes) / " prefix, keep only serverArrivalTimeFriday
		await queryRunner.query(
			`UPDATE "global_message_templates"
			 SET "message" = REPLACE("message",
				'{retreat.walkerArrivalTime} (caminantes) / {retreat.serverArrivalTimeFriday} (servidores)',
				'{retreat.serverArrivalTimeFriday}')
			 WHERE "type" = 'SERVER_WELCOME'`,
		);

		await queryRunner.query(
			`UPDATE "message_templates"
			 SET "message" = REPLACE("message",
				'{retreat.walkerArrivalTime} (caminantes) / {retreat.serverArrivalTimeFriday} (servidores)',
				'{retreat.serverArrivalTimeFriday}')
			 WHERE "type" = 'SERVER_WELCOME'`,
		);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		// Remove PALANQUERO_NEW_WALKER templates
		await queryRunner.query(
			`DELETE FROM "message_templates" WHERE "type" = 'PALANQUERO_NEW_WALKER'`,
		);
		await queryRunner.query(
			`DELETE FROM "global_message_templates" WHERE "type" = 'PALANQUERO_NEW_WALKER'`,
		);

		// Restore WALKER_WELCOME text
		await queryRunner.query(
			`UPDATE "global_message_templates"
			 SET "message" = REPLACE("message",
				'{retreat.walkerArrivalTime}',
				'{retreat.walkerArrivalTime} (caminantes) / {retreat.serverArrivalTimeFriday} (servidores)')
			 WHERE "type" = 'WALKER_WELCOME'`,
		);

		await queryRunner.query(
			`UPDATE "message_templates"
			 SET "message" = REPLACE("message",
				'{retreat.walkerArrivalTime}',
				'{retreat.walkerArrivalTime} (caminantes) / {retreat.serverArrivalTimeFriday} (servidores)')
			 WHERE "type" = 'WALKER_WELCOME'`,
		);

		// Restore SERVER_WELCOME
		await queryRunner.query(
			`UPDATE "global_message_templates"
			 SET "message" = REPLACE("message",
				'{retreat.serverArrivalTimeFriday}',
				'{retreat.walkerArrivalTime} (caminantes) / {retreat.serverArrivalTimeFriday} (servidores)')
			 WHERE "type" = 'SERVER_WELCOME'`,
		);

		await queryRunner.query(
			`UPDATE "message_templates"
			 SET "message" = REPLACE("message",
				'{retreat.serverArrivalTimeFriday}',
				'{retreat.walkerArrivalTime} (caminantes) / {retreat.serverArrivalTimeFriday} (servidores)')
			 WHERE "type" = 'SERVER_WELCOME'`,
		);
	}
}
