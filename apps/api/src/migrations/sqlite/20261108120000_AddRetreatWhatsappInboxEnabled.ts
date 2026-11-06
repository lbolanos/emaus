import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Activación de la bandeja WhatsApp POR RETIRO (specs/whatsapp-inbox v1.1, D13).
 *
 * El puente consume RAM del servidor (~40 MB por cuenta vinculada): el
 * superadmin decide en qué retiro se enciende, con un switch propio. Sin
 * activación, nadie puede vincular y no se respawnea ningún hijo.
 *
 * Plantilla simple: ALTER TABLE ADD COLUMN con guarda de idempotencia (el
 * auto-run de dev puede re-ejecutarla si un arranque la aplicó a medias).
 * `retreat` tiene FKs entrantes pero ADD COLUMN no las toca — sin recreate.
 */
export class AddRetreatWhatsappInboxEnabled20261108120000
	implements MigrationInterface
{
	name = 'AddRetreatWhatsappInboxEnabled20261108120000';
	timestamp = '20261108120000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		const columns: { name: string }[] = await queryRunner.query(
			`PRAGMA table_info("retreat")`,
		);
		if (!columns.some((c) => c.name === 'whatsappInboxEnabled')) {
			await queryRunner.query(
				`ALTER TABLE "retreat" ADD COLUMN "whatsappInboxEnabled" boolean NOT NULL DEFAULT (0)`,
			);
		}
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		// SQLite ≥ 3.35 soporta DROP COLUMN nativamente (better-sqlite3 moderno).
		const columns: { name: string }[] = await queryRunner.query(
			`PRAGMA table_info("retreat")`,
		);
		if (columns.some((c) => c.name === 'whatsappInboxEnabled')) {
			await queryRunner.query(
				`ALTER TABLE "retreat" DROP COLUMN "whatsappInboxEnabled"`,
			);
		}
	}
}
