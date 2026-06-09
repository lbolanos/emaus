import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Enriquece el historial de mensajes (`participant_communications`) con:
 *   - recipientContactKey: dueño del contacto (cellPhone / emergencyContact1CellPhone / inviterEmail…)
 *   - recipientName: nombre del destinatario real (caminante / contacto de emergencia / invitador)
 *   - audience: audiencia de la plantilla (walker / server / family / general)
 *
 * Columnas nullable → `ADD COLUMN` es seguro (sin recreate; la tabla solo tiene CHECK en messageType).
 */
export class AddRecipientMetaToParticipantCommunication20260609130000 implements MigrationInterface {
	name = 'AddRecipientMetaToParticipantCommunication20260609130000';
	timestamp = '20260609130000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			`ALTER TABLE "participant_communications" ADD COLUMN "recipientContactKey" varchar(50) NULL`,
		);
		await queryRunner.query(
			`ALTER TABLE "participant_communications" ADD COLUMN "recipientName" varchar(150) NULL`,
		);
		await queryRunner.query(
			`ALTER TABLE "participant_communications" ADD COLUMN "audience" varchar(20) NULL`,
		);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`ALTER TABLE "participant_communications" DROP COLUMN "audience"`);
		await queryRunner.query(`ALTER TABLE "participant_communications" DROP COLUMN "recipientName"`);
		await queryRunner.query(
			`ALTER TABLE "participant_communications" DROP COLUMN "recipientContactKey"`,
		);
	}
}
