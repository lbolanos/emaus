import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Cartas de familias por email (specs/letters-email):
 *
 * 1. Buzón por participante en `retreat_participants`: `mailboxCode` (código único,
 *    nullable), `mailboxEnabled` (default false — se activa por retiro vía endpoint) y
 *    `mailboxIssuedAt`. Dirección canónica: carta.{CODE}@emaus.cc.
 * 2. Tablas `letters` (cartas recibidas) y `letter_attachments` (adjuntos en S3 privado
 *    bajo `letters/`). El estado de revisión es `status: pending|approved|hidden`;
 *    "impresa" son columnas aparte (`printedAt`/`printedBatchId`), no un estado.
 * 3. Permisos del resource `letter` (read/update/print/manage) con grants explícitos a
 *    `superadmin`, `admin`, `logistics` y `communications`. `superadmin` NO hereda
 *    permisos creados después de la base (ver AddParticipantHealthPermission).
 *
 * Solo-add: ADD COLUMN con guarda, CREATE TABLE IF NOT EXISTS, INSERT OR IGNORE —
 * re-ejecutable por diseño (el API dev auto-aplica migraciones al arrancar). El `down()`
 * contiene DROP TABLE, así que declara `transaction = false` (exigido por el guard
 * sqliteSafePattern y coherente con el patrón de las migraciones de permisos).
 */
export class CreateLetterMailboxes20261105100000 implements MigrationInterface {
	name = 'CreateLetterMailboxes';
	timestamp = '20261105100000';
	transaction = false as const;

	private static readonly LETTER_OPERATIONS = ['read', 'update', 'print', 'manage'];
	private static readonly LETTER_ROLES = ['superadmin', 'admin', 'logistics', 'communications'];

	public async up(queryRunner: QueryRunner): Promise<void> {
		// 1) Buzón en retreat_participants (guarda: la migration es re-ejecutable).
		const rpColumns: { name: string }[] = await queryRunner.query(
			`PRAGMA table_info("retreat_participants")`,
		);
		if (!rpColumns.some((c) => c.name === 'mailboxCode')) {
			await queryRunner.query(
				`ALTER TABLE "retreat_participants" ADD COLUMN "mailboxCode" varchar(12) NULL`,
			);
		}
		if (!rpColumns.some((c) => c.name === 'mailboxEnabled')) {
			await queryRunner.query(
				`ALTER TABLE "retreat_participants" ADD COLUMN "mailboxEnabled" boolean NOT NULL DEFAULT 0`,
			);
		}
		if (!rpColumns.some((c) => c.name === 'mailboxIssuedAt')) {
			await queryRunner.query(
				`ALTER TABLE "retreat_participants" ADD COLUMN "mailboxIssuedAt" datetime NULL`,
			);
		}
		await queryRunner.query(`
			CREATE UNIQUE INDEX IF NOT EXISTS "UQ_retreat_participants_mailbox_code"
			ON "retreat_participants" ("mailboxCode")
			WHERE "mailboxCode" IS NOT NULL
		`);

		// 2) Cartas recibidas. retreatId va denormalizado para listar la bandeja sin join.
		await queryRunner.query(`
			CREATE TABLE IF NOT EXISTS "letters" (
				"id" VARCHAR(36) PRIMARY KEY NOT NULL,
				"retreatId" VARCHAR(36) NOT NULL,
				"retreatParticipantId" VARCHAR(36) NOT NULL,
				"fromEmail" TEXT NOT NULL,
				"fromName" TEXT NULL,
				"subject" TEXT NULL,
				"bodyText" TEXT NOT NULL,
				"status" VARCHAR(20) NOT NULL DEFAULT 'pending',
				"messageId" TEXT NULL,
				"receivedAt" DATETIME NOT NULL,
				"warnings" JSON NULL,
				"reviewedAt" DATETIME NULL,
				"reviewedById" VARCHAR(36) NULL,
				"printedAt" DATETIME NULL,
				"printedBatchId" VARCHAR(36) NULL,
				"createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
				"updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
				FOREIGN KEY ("retreatId") REFERENCES "retreat" ("id") ON DELETE CASCADE,
				FOREIGN KEY ("retreatParticipantId") REFERENCES "retreat_participants" ("id") ON DELETE CASCADE,
				FOREIGN KEY ("reviewedById") REFERENCES "users" ("id") ON DELETE SET NULL
			)
		`);
		await queryRunner.query(
			`CREATE INDEX IF NOT EXISTS "IDX_letters_retreat_status" ON "letters" ("retreatId", "status")`,
		);
		await queryRunner.query(
			`CREATE INDEX IF NOT EXISTS "IDX_letters_retreatParticipant" ON "letters" ("retreatParticipantId")`,
		);
		// Dedupe de emails re-enviados por el Worker de Cloudflare (mismo Message-ID).
		await queryRunner.query(`
			CREATE UNIQUE INDEX IF NOT EXISTS "UQ_letters_message_id"
			ON "letters" ("messageId")
			WHERE "messageId" IS NOT NULL
		`);

		// 3) Adjuntos (imágenes/PDF) en S3 privado bajo letters/.
		await queryRunner.query(`
			CREATE TABLE IF NOT EXISTS "letter_attachments" (
				"id" VARCHAR(36) PRIMARY KEY NOT NULL,
				"letterId" VARCHAR(36) NOT NULL,
				"fileName" TEXT NOT NULL,
				"mimeType" VARCHAR(100) NOT NULL,
				"sizeBytes" INTEGER NOT NULL,
				"isBrowserSafeImage" boolean NOT NULL DEFAULT 0,
				"storageKey" TEXT NOT NULL,
				"storageUrl" TEXT NOT NULL,
				"sortOrder" INTEGER NOT NULL DEFAULT 0,
				"createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
				FOREIGN KEY ("letterId") REFERENCES "letters" ("id") ON DELETE CASCADE
			)
		`);
		await queryRunner.query(
			`CREATE INDEX IF NOT EXISTS "IDX_letter_attachments_letter" ON "letter_attachments" ("letterId")`,
		);

		// 4) Permisos del resource letter (patrón AddParticipantHealthPermission).
		await queryRunner.query(`
			INSERT OR IGNORE INTO "permissions" ("resource", "operation", "description") VALUES
			('letter', 'read', 'View family letters inbox and mailbox addresses for retreats'),
			('letter', 'update', 'Review family letters: approve or hide them'),
			('letter', 'print', 'Print approved letter batches and mark them as printed'),
			('letter', 'manage', 'Activate/disable family letter mailboxes per retreat and participant')
		`);

		const perms = await queryRunner.query(
			`SELECT id, operation FROM "permissions" WHERE "resource" = 'letter'`,
		);
		const permByOp = new Map<string, string>(
			(perms as { id: string; operation: string }[]).map((p) => [p.operation, p.id]),
		);
		const roles = await queryRunner.query(
			`SELECT id, name FROM "roles" WHERE name IN ('superadmin', 'admin', 'logistics', 'communications')`,
		);
		for (const role of roles as { id: string; name: string }[]) {
			for (const operation of CreateLetterMailboxes20261105100000.LETTER_OPERATIONS) {
				const permId = permByOp.get(operation);
				if (!permId) continue;
				const exists = await queryRunner.query(
					`SELECT COUNT(*) AS c FROM "role_permissions" WHERE "roleId" = ? AND "permissionId" = ?`,
					[role.id, permId],
				);
				if ((exists[0] as { c: number }).c === 0) {
					await queryRunner.query(
						`INSERT INTO "role_permissions" ("roleId", "permissionId") VALUES (?, ?)`,
						[role.id, permId],
					);
				}
			}
		}
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		// Permisos primero (patrón AddParticipantHealthPermission, en reversa).
		await queryRunner.query(
			`DELETE FROM "role_permissions" WHERE "permissionId" IN (SELECT id FROM "permissions" WHERE "resource" = 'letter')`,
		);
		await queryRunner.query(`DELETE FROM "permissions" WHERE "resource" = 'letter'`);

		// Tablas propias (sin FKs entrantes): DROP directo.
		await queryRunner.query(`DROP TABLE IF EXISTS "letter_attachments"`);
		await queryRunner.query(`DROP TABLE IF EXISTS "letters"`);
		await queryRunner.query(`DROP INDEX IF EXISTS "UQ_retreat_participants_mailbox_code"`);

		// SQLite >= 3.35 soporta DROP COLUMN nativo. Con guarda para poder re-ejecutar.
		const rpColumns: { name: string }[] = await queryRunner.query(
			`PRAGMA table_info("retreat_participants")`,
		);
		for (const column of ['mailboxIssuedAt', 'mailboxEnabled', 'mailboxCode']) {
			if (rpColumns.some((c) => c.name === column)) {
				await queryRunner.query(`ALTER TABLE "retreat_participants" DROP COLUMN "${column}"`);
			}
		}
	}
}
