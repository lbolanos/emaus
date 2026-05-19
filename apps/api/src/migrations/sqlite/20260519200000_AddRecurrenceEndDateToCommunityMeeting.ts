import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Agrega columna recurrenceEndDate (DATE, NULL) a community_meeting. Define el
 * tope hasta el cual el cron de generación de instancias debe seguir creando
 * ocurrencias. NULL = "sin fecha límite" (cron respeta el safety net de 52
 * instancias por template).
 */
export class AddRecurrenceEndDateToCommunityMeeting20260519200000 implements MigrationInterface {
	name = 'AddRecurrenceEndDateToCommunityMeeting20260519200000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			`ALTER TABLE "community_meeting" ADD COLUMN "recurrenceEndDate" date`,
		);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			`ALTER TABLE "community_meeting" DROP COLUMN "recurrenceEndDate"`,
		);
	}
}
