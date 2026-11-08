import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Comprobantes de pago enviados por las familias (link de capacidad por
 * participante): tabla `payment_receipt_claims` — la bandeja de comprobantes
 * que el coordinador convierte en pago.
 *
 * La foto vive en S3 privado bajo `payment-receipts/claims/{claimId}.webp`
 * (mismo prefijo privado con Deny público que la foto de comprobante del
 * pago). Al aplicar, el objeto se mueve a `payment-receipts/{paymentId}.webp`
 * y el claim queda `attached` con la traza del pago.
 *
 * Solo-add y reversible: `down()` borra solo esta tabla (sin FKs entrantes).
 */
export class CreatePaymentReceiptClaims20261106150000 implements MigrationInterface {
	name = 'CreatePaymentReceiptClaims';
	timestamp = '20261106150000';
	transaction = false as const;

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`
			CREATE TABLE IF NOT EXISTS "payment_receipt_claims" (
				"id" VARCHAR(36) PRIMARY KEY NOT NULL,
				"retreatId" VARCHAR(36) NOT NULL,
				"participantId" VARCHAR(36) NOT NULL,
				"status" VARCHAR(20) NOT NULL DEFAULT 'pending',
				"amountClaimed" DECIMAL(10,2) NULL,
				"reference" VARCHAR(255) NULL,
				"note" TEXT NULL,
				"senderContact" VARCHAR(320) NULL,
				"photoUrl" TEXT NOT NULL,
				"photoS3Key" VARCHAR NULL,
				"attachedPaymentId" VARCHAR(36) NULL,
				"attachedAt" DATETIME NULL,
				"attachedById" VARCHAR(36) NULL,
				"createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
				FOREIGN KEY ("retreatId") REFERENCES "retreat" ("id") ON DELETE CASCADE,
				FOREIGN KEY ("participantId") REFERENCES "participants" ("id") ON DELETE CASCADE,
				FOREIGN KEY ("attachedPaymentId") REFERENCES "payments" ("id") ON DELETE SET NULL,
				FOREIGN KEY ("attachedById") REFERENCES "users" ("id") ON DELETE SET NULL
			)
		`);
		await queryRunner.query(
			`CREATE INDEX IF NOT EXISTS "IDX_payment_receipt_claims_retreat_status" ON "payment_receipt_claims" ("retreatId", "status")`,
		);
		await queryRunner.query(
			`CREATE INDEX IF NOT EXISTS "IDX_payment_receipt_claims_participant" ON "payment_receipt_claims" ("participantId")`,
		);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`DROP INDEX IF EXISTS "IDX_payment_receipt_claims_participant"`);
		await queryRunner.query(`DROP INDEX IF EXISTS "IDX_payment_receipt_claims_retreat_status"`);
		await queryRunner.query(`DROP TABLE IF EXISTS "payment_receipt_claims"`);
	}
}
