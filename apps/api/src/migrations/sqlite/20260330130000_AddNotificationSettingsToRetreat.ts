import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddNotificationSettingsToRetreat20260330130000 implements MigrationInterface {
	name = 'AddNotificationSettingsToRetreat20260330130000';
	timestamp = '20260330130000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			`ALTER TABLE "retreat" ADD COLUMN "notifyParticipant" boolean DEFAULT 1`,
		);
		await queryRunner.query(
			`ALTER TABLE "retreat" ADD COLUMN "notifyInviter" boolean DEFAULT 1`,
		);
		await queryRunner.query(
			`ALTER TABLE "retreat" ADD COLUMN "notifyPalanqueros" text DEFAULT NULL`,
		);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		// SQLite doesn't support DROP COLUMN in older versions, but TypeORM handles it
		await queryRunner.query(`ALTER TABLE "retreat" DROP COLUMN "notifyPalanqueros"`);
		await queryRunner.query(`ALTER TABLE "retreat" DROP COLUMN "notifyInviter"`);
		await queryRunner.query(`ALTER TABLE "retreat" DROP COLUMN "notifyParticipant"`);
	}
}
