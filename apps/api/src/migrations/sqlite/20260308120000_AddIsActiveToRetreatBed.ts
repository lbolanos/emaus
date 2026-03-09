import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddIsActiveToRetreatBed20260308120000 implements MigrationInterface {
	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			`ALTER TABLE retreat_bed ADD COLUMN "isActive" boolean NOT NULL DEFAULT 1`,
		);
		// Safety cleanup: unassign participants from any disabled beds
		await queryRunner.query(
			`UPDATE retreat_bed SET "participantId" = NULL WHERE "isActive" = 0 AND "participantId" IS NOT NULL`,
		);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		// SQLite doesn't support DROP COLUMN directly, but TypeORM handles this
		// For rollback, we'd need to recreate the table without the column
		// In practice, this is a safe addition that can be left in place
		console.log('Rollback: isActive column should be manually removed if needed');
	}
}
