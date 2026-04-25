import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBagMadeToRetreatParticipants20260422130000 implements MigrationInterface {
	name = 'AddBagMadeToRetreatParticipants20260422130000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			`ALTER TABLE "retreat_participants" ADD COLUMN "bagMade" boolean NOT NULL DEFAULT 0`,
		);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			`ALTER TABLE "retreat_participants" DROP COLUMN "bagMade"`,
		);
	}
}
