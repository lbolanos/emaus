import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Optional photo of each payment's receipt (transfer screenshot, paper slip).
 *
 *  - `receiptUrl`   — S3 object URL (private prefix `payment-receipts/`) or a
 *                     base64 data-URI when storage is local (dev).
 *  - `receiptS3Key` — object key, required to delete it. NULL in base64 mode.
 *
 * Same column pair as `community_member` (face photo). Spec:
 * specs/payment-receipt-photo/spec.md.
 *
 * Plain ADD COLUMN on a leaf table (`payments` receives no incoming FKs):
 * no recreate-table, no DROP, no PRAGMA. Idempotent.
 */
export class AddPaymentReceiptPhoto20261105120000 implements MigrationInterface {
	name = 'AddPaymentReceiptPhoto20261105120000';
	timestamp = '20261105120000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		const columns = await queryRunner.query(`PRAGMA table_info("payments")`);
		const has = (name: string) => columns.some((c: { name: string }) => c.name === name);

		if (!has('receiptUrl')) {
			await queryRunner.query(`ALTER TABLE "payments" ADD COLUMN "receiptUrl" TEXT`);
		}
		if (!has('receiptS3Key')) {
			await queryRunner.query(
				`ALTER TABLE "payments" ADD COLUMN "receiptS3Key" VARCHAR(255)`,
			);
		}
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		// SQLite >= 3.35 supports native DROP COLUMN; no recreate needed.
		// S3 objects are left alone: reverting the schema is not a request to
		// delete already-stored receipts.
		await queryRunner.query(`ALTER TABLE "payments" DROP COLUMN "receiptS3Key"`);
		await queryRunner.query(`ALTER TABLE "payments" DROP COLUMN "receiptUrl"`);
	}
}
