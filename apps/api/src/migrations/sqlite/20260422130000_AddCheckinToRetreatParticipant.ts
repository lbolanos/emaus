import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCheckinToRetreatParticipant20260422130000 implements MigrationInterface {
	name = 'AddCheckinToRetreatParticipant20260422130000';
	timestamp = '20260422130000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			`ALTER TABLE "retreat_participants" ADD COLUMN "checkedIn" boolean NOT NULL DEFAULT 0`,
		);
		await queryRunner.query(
			`ALTER TABLE "retreat_participants" ADD COLUMN "checkedInAt" datetime NULL`,
		);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		// SQLite doesn't support DROP COLUMN directly, rebuild the table
		await queryRunner.query(`
			CREATE TABLE "retreat_participants_backup" AS
			SELECT "id","userId","participantId","retreatId","roleInRetreat","isPrimaryRetreat","notes","metadata","createdAt","type","isCancelled","tableId","idOnRetreat","familyFriendColor"
			FROM "retreat_participants"
		`);
		await queryRunner.query(`DROP TABLE "retreat_participants"`);
		await queryRunner.query(`ALTER TABLE "retreat_participants_backup" RENAME TO "retreat_participants"`);
	}
}
