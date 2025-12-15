import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddFlyerOptions20251214170500 implements MigrationInterface {
	name = 'AddFlyerOptions20251214170500';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`ALTER TABLE "retreat" ADD "flyer_options" text`);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`ALTER TABLE "retreat" DROP COLUMN "flyer_options"`);
	}
}
