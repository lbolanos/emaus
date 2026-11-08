import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * WhatsApp inbox v1.3 (specs/whatsapp-inbox D18–D21): per-message metadata.
 *
 * - mediaMime / mediaFileName: documents and voice notes (wacli MimeType and
 *   Filename) so the UI can label them and decide what can be previewed.
 * - payment*: the payment created from this message (duplicate-payment guard:
 *   the bubble shows "registered by X").
 * - letter*: the letter created from this message ("add as letter" — the
 *   message enters the walker's printable letters).
 *
 * Simple template: guarded ALTER TABLE ADD COLUMN (dev auto-run may re-run a
 * half-applied migration). No FK columns are added physically: the inbox
 * purges by linkId explicitly, and payments/letters outlive the inbox.
 */
const COLUMNS: Array<[name: string, ddl: string]> = [
	['mediaMime', 'varchar(100)'],
	['mediaFileName', 'varchar(255)'],
	['paymentId', 'varchar(36)'],
	['paymentRegisteredById', 'varchar(36)'],
	['paymentRegisteredAt', 'datetime'],
	['letterId', 'varchar(36)'],
	['letterAddedById', 'varchar(36)'],
	['letterAddedAt', 'datetime'],
];

export class AddWhatsappInboxMessageActions20261108140000 implements MigrationInterface {
	name = 'AddWhatsappInboxMessageActions20261108140000';
	timestamp = '20261108140000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		const existing: { name: string }[] = await queryRunner.query(
			`PRAGMA table_info("whatsapp_inbox_message")`,
		);
		const names = new Set(existing.map((c) => c.name));
		for (const [name, ddl] of COLUMNS) {
			if (!names.has(name)) {
				await queryRunner.query(
					`ALTER TABLE "whatsapp_inbox_message" ADD COLUMN "${name}" ${ddl} NULL`,
				);
			}
		}
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		const existing: { name: string }[] = await queryRunner.query(
			`PRAGMA table_info("whatsapp_inbox_message")`,
		);
		const names = new Set(existing.map((c) => c.name));
		for (const [name] of [...COLUMNS].reverse()) {
			if (names.has(name)) {
				await queryRunner.query(`ALTER TABLE "whatsapp_inbox_message" DROP COLUMN "${name}"`);
			}
		}
	}
}
