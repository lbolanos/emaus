import { MigrationInterface, QueryRunner } from 'typeorm';

const DEFAULT_SUBJECT = 'Aviso de privacidad y eliminación de datos';
const DEFAULT_MESSAGE = `Hola {participant.firstName},

Como parte de nuestro compromiso con la protección de tus datos personales, te recordamos que puedes eliminar toda tu información de nuestra plataforma en cualquier momento.

Para eliminar tus datos, haz clic en el siguiente enlace:
{participant.dataDeleteUrl}

Este enlace es único y personal. Al confirmar, todos tus datos personales serán eliminados de forma permanente.

Si tienes preguntas sobre el tratamiento de tus datos, consulta nuestro aviso de privacidad.

Saludos,
Retiros Emaús`;

/**
 * Privacy & Data Delete feature:
 *   1. Añade columnas a participants: acceptedPrivacyNoticeAt, dataDeleteToken, dataDeletedAt.
 *   2. Backfill de tokens únicos para participantes existentes.
 *   3. Relaja CHECK constraint en global_message_templates para incluir PRIVACY_DATA_DELETE.
 *   4. Inserta template global PRIVACY_DATA_DELETE.
 *   5. Crea message_templates por retiro con el subject/mensaje default.
 */
export class AddPrivacyDataDelete20260423120000 implements MigrationInterface {
	name = 'AddPrivacyDataDelete20260423120000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		// ── 1. Add columns to participants (idempotent vía PRAGMA) ─────────
		const cols: Array<{ name: string }> = await queryRunner.query(
			`PRAGMA table_info("participants")`,
		);
		const colNames = new Set(cols.map((c) => c.name));

		if (!colNames.has('acceptedPrivacyNoticeAt')) {
			await queryRunner.query(
				`ALTER TABLE "participants" ADD COLUMN "acceptedPrivacyNoticeAt" datetime NULL`,
			);
		}
		if (!colNames.has('dataDeleteToken')) {
			await queryRunner.query(
				`ALTER TABLE "participants" ADD COLUMN "dataDeleteToken" varchar(64) NULL`,
			);
		}
		if (!colNames.has('dataDeletedAt')) {
			await queryRunner.query(
				`ALTER TABLE "participants" ADD COLUMN "dataDeletedAt" datetime NULL`,
			);
		}

		await queryRunner.query(
			`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_participants_dataDeleteToken" ON "participants" ("dataDeleteToken") WHERE "dataDeleteToken" IS NOT NULL`,
		);

		// 2. Backfill: token único por participante (48 chars hex)
		await queryRunner.query(
			`UPDATE "participants" SET "dataDeleteToken" = lower(hex(randomblob(24))) WHERE "dataDeleteToken" IS NULL`,
		);

		// ── 3. Relax CHECK constraint on global_message_templates ──────────
		await queryRunner.query(
			`CREATE TABLE "global_message_templates_new" (
				"id" VARCHAR(36) PRIMARY KEY NOT NULL,
				"name" VARCHAR(255) NOT NULL,
				"type" VARCHAR(255) NOT NULL CHECK ("type" IN (
					'WALKER_WELCOME', 'SERVER_WELCOME', 'EMERGENCY_CONTACT_VALIDATION',
					'PALANCA_REQUEST', 'PALANCA_REMINDER', 'GENERAL',
					'PRE_RETREAT_REMINDER', 'PAYMENT_REMINDER', 'POST_RETREAT_MESSAGE',
					'CANCELLATION_CONFIRMATION', 'USER_INVITATION', 'PASSWORD_RESET',
					'RETREAT_SHARED_NOTIFICATION', 'BIRTHDAY_MESSAGE', 'PALANQUERO_NEW_WALKER',
					'PRIVACY_DATA_DELETE',
					'SYS_PASSWORD_RESET', 'SYS_USER_INVITATION', 'SYS_REGISTRATION_CONFIRMATION',
					'SYS_EMAIL_VERIFICATION', 'SYS_ACCOUNT_LOCKED', 'SYS_ACCOUNT_UNLOCKED',
					'SYS_ROLE_REQUESTED', 'SYS_ROLE_APPROVED', 'SYS_ROLE_REJECTED'
				)),
				"message" TEXT NOT NULL,
				"isActive" BOOLEAN NOT NULL DEFAULT (1),
				"createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
				"updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
			)`,
		);
		await queryRunner.query(
			`INSERT INTO "global_message_templates_new" SELECT * FROM "global_message_templates"`,
		);
		await queryRunner.query(`DROP TABLE "global_message_templates"`);
		await queryRunner.query(
			`ALTER TABLE "global_message_templates_new" RENAME TO "global_message_templates"`,
		);

		// ── 4. Insert global template PRIVACY_DATA_DELETE (idempotent) ─────
		const existingGlobal: Array<{ c: number }> = await queryRunner.query(
			`SELECT COUNT(*) AS c FROM global_message_templates WHERE type = 'PRIVACY_DATA_DELETE'`,
		);
		if (existingGlobal[0].c === 0) {
			await queryRunner.query(
				`INSERT INTO global_message_templates (id, name, type, message, isActive, createdAt, updatedAt)
				 VALUES (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))), 2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6))), ?, 'PRIVACY_DATA_DELETE', ?, 1, datetime('now'), datetime('now'))`,
				[DEFAULT_SUBJECT, DEFAULT_MESSAGE],
			);
		}

		// ── 5. Seed message_templates per retiro (idempotent) ──────────────
		const retreats: Array<{ id: string }> = await queryRunner.query(`SELECT id FROM retreat`);
		for (const r of retreats) {
			const existing: Array<{ id: string }> = await queryRunner.query(
				`SELECT id FROM message_templates WHERE retreatId = ? AND type = 'PRIVACY_DATA_DELETE' LIMIT 1`,
				[r.id],
			);
			if (existing.length > 0) continue;
			await queryRunner.query(
				`INSERT INTO message_templates (id, name, type, scope, message, retreatId, createdAt, updatedAt)
				 VALUES (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))), 2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6))), ?, 'PRIVACY_DATA_DELETE', 'retreat', ?, ?, datetime('now'), datetime('now'))`,
				[DEFAULT_SUBJECT, DEFAULT_MESSAGE, r.id],
			);
		}
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			`DELETE FROM message_templates WHERE type = 'PRIVACY_DATA_DELETE'`,
		);
		await queryRunner.query(
			`DELETE FROM global_message_templates WHERE type = 'PRIVACY_DATA_DELETE'`,
		);
		await queryRunner.query(`DROP INDEX IF EXISTS "IDX_participants_dataDeleteToken"`);
		await queryRunner.query(`ALTER TABLE "participants" DROP COLUMN "dataDeletedAt"`);
		await queryRunner.query(`ALTER TABLE "participants" DROP COLUMN "dataDeleteToken"`);
		await queryRunner.query(`ALTER TABLE "participants" DROP COLUMN "acceptedPrivacyNoticeAt"`);
	}
}
