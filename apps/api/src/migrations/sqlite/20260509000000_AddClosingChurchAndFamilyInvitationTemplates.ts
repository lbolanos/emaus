import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Agrega soporte para la dirección de la iglesia donde se realiza la
 * misa de clausura por retiro, y dos plantillas globales para invitar a
 * los familiares (WhatsApp + Email).
 *
 * Cambios:
 *   1. `retreat` — 4 columnas nuevas (todas nullable):
 *        closingChurchName VARCHAR(255)
 *        closingChurchAddress TEXT
 *        closingChurchLatitude REAL
 *        closingChurchLongitude REAL
 *   2. `global_message_templates.type` CHECK — 2 nuevos valores:
 *        FAMILY_CLOSING_INVITATION_WHATSAPP
 *        FAMILY_CLOSING_INVITATION_EMAIL
 *   3. Seed idempotente de las dos plantillas (skip si ya existen por nombre).
 *
 * SQLite no permite ALTER del CHECK constraint, hay que recrear la tabla
 * `global_message_templates`. Seguimos el patrón seguro del proyecto:
 * `transaction = false` + `PRAGMA foreign_keys = OFF` (ver
 * `.ruler/skills/sqlite-migrations/SKILL.md`). Las 4 columnas de `retreat`
 * se agregan con `ALTER TABLE ADD COLUMN` simple — eso es seguro en
 * SQLite y no requiere recreate-table.
 */
export class AddClosingChurchAndFamilyInvitationTemplates20260509000000
	implements MigrationInterface
{
	name = 'AddClosingChurchAndFamilyInvitationTemplates20260509000000';
	timestamp = '20260509000000';

	// CRÍTICO: TypeORM no envuelve up()/down() en BEGIN…COMMIT cuando
	// transaction=false. SQLite ignora PRAGMA foreign_keys=OFF dentro de
	// transacción multi-sentencia, por eso hay que salir de la tx implícita.
	transaction = false as const;

	private static readonly NEW_CHECK = `(
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

	private static readonly OLD_CHECK = `(
		'WALKER_WELCOME', 'SERVER_WELCOME', 'EMERGENCY_CONTACT_VALIDATION',
		'PALANCA_REQUEST', 'PALANCA_REMINDER', 'GENERAL',
		'PRE_RETREAT_REMINDER', 'PAYMENT_REMINDER', 'POST_RETREAT_MESSAGE',
		'CANCELLATION_CONFIRMATION', 'USER_INVITATION', 'PASSWORD_RESET',
		'RETREAT_SHARED_NOTIFICATION', 'BIRTHDAY_MESSAGE', 'PALANQUERO_NEW_WALKER',
		'PRIVACY_DATA_DELETE',
		'WALKER_FOLLOWUP_WEEK_1', 'WALKER_FOLLOWUP_MONTH_1', 'WALKER_FOLLOWUP_MONTH_3',
		'WALKER_FOLLOWUP_MONTH_6', 'WALKER_FOLLOWUP_YEAR_1', 'WALKER_REUNION_INVITATION',
		'SYS_PASSWORD_RESET', 'SYS_USER_INVITATION', 'SYS_REGISTRATION_CONFIRMATION',
		'SYS_EMAIL_VERIFICATION', 'SYS_ACCOUNT_LOCKED', 'SYS_ACCOUNT_UNLOCKED',
		'SYS_ROLE_REQUESTED', 'SYS_ROLE_APPROVED', 'SYS_ROLE_REJECTED'
	)`;

	private static readonly TEMPLATES: Array<{
		name: string;
		type: string;
		message: string;
	}> = [
		{
			name: 'Invitación Familia - Misa de Clausura (WhatsApp)',
			type: 'FAMILY_CLOSING_INVITATION_WHATSAPP',
			message: `Hola, queremos invitarte con mucho cariño a la *Misa de Clausura* del retiro de *{retreat.parish}*.

📅 {retreat.endDate}
⛪ {retreat.closingChurchName}
📍 {retreat.closingChurchAddress}

🗺️ Cómo llegar (Maps): {retreat.closingChurchMapsUrl}
🚗 En Waze: {retreat.closingChurchWazeUrl}

¡Te esperamos! 🙏`,
		},
		{
			name: 'Invitación Familia - Misa de Clausura (Email)',
			type: 'FAMILY_CLOSING_INVITATION_EMAIL',
			message: `<h2>Te invitamos a la Misa de Clausura</h2>
<p>Hola,</p>
<p>Con mucho cariño te invitamos a la <strong>Misa de Clausura</strong> del retiro de <strong>{retreat.parish}</strong>.</p>
<ul>
  <li><strong>Fecha:</strong> {retreat.endDate}</li>
  <li><strong>Iglesia:</strong> {retreat.closingChurchName}</li>
  <li><strong>Dirección:</strong> {retreat.closingChurchAddress}</li>
</ul>
<p>
  <a href="{retreat.closingChurchMapsUrl}">Abrir en Maps</a> &nbsp;·&nbsp;
  <a href="{retreat.closingChurchWazeUrl}">Abrir en Waze</a>
</p>
<p>¡Te esperamos!</p>`,
		},
	];

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`PRAGMA foreign_keys = OFF`);

		// 1) Agregar las 4 columnas a retreat (ALTER ADD COLUMN simple es
		// seguro en SQLite cuando la columna es nullable y sin DEFAULT).
		await queryRunner.query(
			`ALTER TABLE "retreat" ADD COLUMN "closingChurchName" VARCHAR(255)`,
		);
		await queryRunner.query(
			`ALTER TABLE "retreat" ADD COLUMN "closingChurchAddress" TEXT`,
		);
		await queryRunner.query(
			`ALTER TABLE "retreat" ADD COLUMN "closingChurchLatitude" REAL`,
		);
		await queryRunner.query(
			`ALTER TABLE "retreat" ADD COLUMN "closingChurchLongitude" REAL`,
		);

		// 2) Recrear global_message_templates con el CHECK ampliado.
		await queryRunner.query(`
			CREATE TABLE "global_message_templates_new" (
				"id" VARCHAR(36) PRIMARY KEY NOT NULL,
				"name" VARCHAR(255) NOT NULL,
				"type" VARCHAR(255) NOT NULL CHECK ("type" IN ${AddClosingChurchAndFamilyInvitationTemplates20260509000000.NEW_CHECK}),
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

		// 3) Reactivar FK + integrity check.
		await queryRunner.query(`PRAGMA foreign_keys = ON`);
		const fkCheck = await queryRunner.query(`PRAGMA foreign_key_check`);
		if (fkCheck && fkCheck.length > 0) {
			throw new Error(
				`[AddClosingChurchAndFamilyInvitationTemplates] FK violations after recreate: ${JSON.stringify(fkCheck)}`,
			);
		}

		// 4) Seed idempotente — skip si ya existe una plantilla con ese name.
		for (const t of AddClosingChurchAndFamilyInvitationTemplates20260509000000.TEMPLATES) {
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
				[t.name, t.type, t.message, t.name],
			);
		}
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`PRAGMA foreign_keys = OFF`);

		// 1) Borrar las 2 plantillas que insertamos (por type).
		const types = AddClosingChurchAndFamilyInvitationTemplates20260509000000.TEMPLATES.map(
			(t) => `'${t.type}'`,
		).join(',');
		await queryRunner.query(`DELETE FROM global_message_templates WHERE type IN (${types})`);

		// 2) Recrear global_message_templates con el CHECK viejo.
		await queryRunner.query(`
			CREATE TABLE "global_message_templates_old" (
				"id" VARCHAR(36) PRIMARY KEY NOT NULL,
				"name" VARCHAR(255) NOT NULL,
				"type" VARCHAR(255) NOT NULL CHECK ("type" IN ${AddClosingChurchAndFamilyInvitationTemplates20260509000000.OLD_CHECK}),
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

		// 3) Para revertir las 4 columnas de retreat: SQLite no soporta DROP
		// COLUMN antes de 3.35; recreamos la tabla sin ellas. Como retreat
		// tiene FKs entrantes (participant, retreatBed, etc.) y FKs salientes
		// (house, user), conservamos el orden: PRAGMA OFF, recrear, copiar,
		// drop, rename, PRAGMA ON.
		await queryRunner.query(`
			CREATE TABLE "retreat_old" (
				"id" varchar PRIMARY KEY NOT NULL,
				"parish" varchar NOT NULL,
				"startDate" date NOT NULL,
				"endDate" date NOT NULL,
				"houseId" varchar NOT NULL,
				"openingNotes" text,
				"closingNotes" text,
				"retreat_type" varchar,
				"retreat_number_version" varchar,
				"thingsToBringNotes" text,
				"contactPhones" text,
				"cost" varchar,
				"paymentInfo" text,
				"paymentMethods" text,
				"max_walkers" integer,
				"max_servers" integer,
				"createdBy" varchar,
				"isPublic" boolean NOT NULL DEFAULT (0),
				"roleInvitationEnabled" boolean NOT NULL DEFAULT (1),
				"walkerArrivalTime" time,
				"serverArrivalTimeFriday" time,
				"flyer_options" text,
				"slug" varchar,
				"memoryPhotoUrl" varchar,
				"musicPlaylistUrl" varchar,
				"notifyParticipant" boolean NOT NULL DEFAULT (1),
				"notifyInviter" boolean NOT NULL DEFAULT (1),
				"notifyPalanqueros" text,
				"santisimoEnabled" boolean NOT NULL DEFAULT (0),
				"timezone" varchar(64),
				CONSTRAINT "FK_retreat_houseId" FOREIGN KEY ("houseId") REFERENCES "house" ("id") ON DELETE RESTRICT,
				CONSTRAINT "FK_retreat_createdBy" FOREIGN KEY ("createdBy") REFERENCES "user" ("id") ON DELETE SET NULL,
				CONSTRAINT "UQ_retreat_slug" UNIQUE ("slug")
			)
		`);
		await queryRunner.query(`
			INSERT INTO "retreat_old" (
				id, parish, startDate, endDate, houseId, openingNotes, closingNotes,
				retreat_type, retreat_number_version, thingsToBringNotes, contactPhones,
				cost, paymentInfo, paymentMethods, max_walkers, max_servers, createdBy,
				isPublic, roleInvitationEnabled, walkerArrivalTime, serverArrivalTimeFriday,
				flyer_options, slug, memoryPhotoUrl, musicPlaylistUrl,
				notifyParticipant, notifyInviter, notifyPalanqueros,
				santisimoEnabled, timezone
			)
			SELECT
				id, parish, startDate, endDate, houseId, openingNotes, closingNotes,
				retreat_type, retreat_number_version, thingsToBringNotes, contactPhones,
				cost, paymentInfo, paymentMethods, max_walkers, max_servers, createdBy,
				isPublic, roleInvitationEnabled, walkerArrivalTime, serverArrivalTimeFriday,
				flyer_options, slug, memoryPhotoUrl, musicPlaylistUrl,
				notifyParticipant, notifyInviter, notifyPalanqueros,
				santisimoEnabled, timezone
			FROM "retreat"
		`);
		await queryRunner.query(`DROP TABLE "retreat"`);
		await queryRunner.query(`ALTER TABLE "retreat_old" RENAME TO "retreat"`);

		await queryRunner.query(`PRAGMA foreign_keys = ON`);
	}
}
