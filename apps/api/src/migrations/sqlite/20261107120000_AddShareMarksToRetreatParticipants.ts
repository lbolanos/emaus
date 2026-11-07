import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Estado de difusión por participante (mejora 9 de specs/letters-email):
 * - `mailboxSharedAt`: cuándo se mandó (WhatsApp) la dirección del buzón de
 *   cartas a la familia.
 * - `receiptLinkSharedAt`: cuándo se mandó el link público de comprobante.
 * Marca optimista del click en WhatsApp — el historial de comunicaciones del
 * sistema no aplica (el envío real lo hace el humano en wa.me).
 *
 * Plantilla simple ADD COLUMN con guardas idempotentes: el auto-run del API
 * puede re-ejecutarla si un intento anterior quedó a medias.
 */
export class AddShareMarksToRetreatParticipants20261107120000 implements MigrationInterface {
	name = 'AddShareMarksToRetreatParticipants20261107120000';
	timestamp = '20261107120000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		const columns: { name: string }[] = await queryRunner.query(
			`PRAGMA table_info("retreat_participants")`,
		);
		const has = (name: string) => columns.some((c) => c.name === name);
		if (!has('mailboxSharedAt')) {
			await queryRunner.query(`ALTER TABLE "retreat_participants" ADD COLUMN "mailboxSharedAt" datetime`);
		}
		if (!has('receiptLinkSharedAt')) {
			await queryRunner.query(
				`ALTER TABLE "retreat_participants" ADD COLUMN "receiptLinkSharedAt" datetime`,
			);
		}
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		// SQLite ≥ 3.35 soporta DROP COLUMN nativamente.
		await queryRunner.query(`ALTER TABLE "retreat_participants" DROP COLUMN "mailboxSharedAt"`);
		await queryRunner.query(`ALTER TABLE "retreat_participants" DROP COLUMN "receiptLinkSharedAt"`);
	}
}
