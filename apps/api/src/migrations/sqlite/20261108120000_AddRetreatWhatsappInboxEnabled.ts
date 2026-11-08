import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * PER-RETREAT activation of the WhatsApp inbox (specs/whatsapp-inbox v1.1,
 * D13).
 *
 * The bridge costs server RAM (~40 MB per linked account): the superadmin
 * decides which retreat turns it on, with its own switch. Without activation
 * nobody can link and no child is respawned.
 *
 * Simple template: guarded ALTER TABLE ADD COLUMN (dev auto-run may re-run it
 * if a boot applied it halfway). `retreat` has incoming FKs but ADD COLUMN
 * does not touch them — no recreate.
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
