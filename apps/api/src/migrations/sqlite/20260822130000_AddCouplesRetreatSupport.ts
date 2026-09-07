import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Soporte para retiros de parejas (retreat_type = 'couples').
 *
 * - participants.gender: 'M'|'F', solo lo llena el registro de parejas (esposo/esposa).
 * - retreat_participants.spouseParticipantId: vínculo simétrico al Participant.id del otro
 *   cónyuge en el mismo retiro. Columna plana sin FK física (patrón de las columnas
 *   post-launch de esta tabla); la integridad la mantiene el service layer.
 * - retreat.couplesShareRoom / couplesShareTable: configuración por retiro; solo se
 *   consultan cuando retreat_type = 'couples'.
 * - UQ_participants_email_retreat gana COALESCE(gender,'') como tercer discriminador:
 *   los cónyuges (M/F) pueden compartir email dentro del retiro, el resto de duplicados
 *   sigue bloqueado igual que hoy (gender NULL → '').
 *
 * Todo aditivo: ALTER TABLE ADD COLUMN + swap de índices. Sin recreate-table.
 */
export class AddCouplesRetreatSupport20260822130000 implements MigrationInterface {
	name = 'AddCouplesRetreatSupport20260822130000';
	timestamp = '20260822130000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`ALTER TABLE "participants" ADD COLUMN "gender" varchar NULL`);

		await queryRunner.query(
			`ALTER TABLE "retreat_participants" ADD COLUMN "spouseParticipantId" varchar NULL`,
		);
		// Un mismo cónyuge no puede estar vinculado desde dos filas del mismo retiro.
		await queryRunner.query(
			`CREATE UNIQUE INDEX "idx_retreat_participants_spouse"
			 ON "retreat_participants" ("retreatId", "spouseParticipantId")
			 WHERE "spouseParticipantId" IS NOT NULL`,
		);

		await queryRunner.query(
			`ALTER TABLE "retreat" ADD COLUMN "couplesShareRoom" boolean NOT NULL DEFAULT 1`,
		);
		await queryRunner.query(
			`ALTER TABLE "retreat" ADD COLUMN "couplesShareTable" boolean NOT NULL DEFAULT 1`,
		);

		await queryRunner.query(`DROP INDEX IF EXISTS "UQ_participants_email_retreat"`);
		await queryRunner.query(
			`CREATE UNIQUE INDEX "UQ_participants_email_retreat"
			 ON "participants" (LOWER("email"), "retreatId", COALESCE("gender", ''))
			 WHERE "email" IS NOT NULL AND "email" != ''`,
		);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		// Restaurar el índice original antes de dropear la columna que participa en él.
		await queryRunner.query(`DROP INDEX IF EXISTS "UQ_participants_email_retreat"`);
		await queryRunner.query(
			`CREATE UNIQUE INDEX "UQ_participants_email_retreat"
			 ON "participants" (LOWER("email"), "retreatId")
			 WHERE "email" IS NOT NULL AND "email" != ''`,
		);

		await queryRunner.query(`ALTER TABLE "retreat" DROP COLUMN "couplesShareTable"`);
		await queryRunner.query(`ALTER TABLE "retreat" DROP COLUMN "couplesShareRoom"`);

		await queryRunner.query(`DROP INDEX IF EXISTS "idx_retreat_participants_spouse"`);
		await queryRunner.query(
			`ALTER TABLE "retreat_participants" DROP COLUMN "spouseParticipantId"`,
		);

		await queryRunner.query(`ALTER TABLE "participants" DROP COLUMN "gender"`);
	}
}
