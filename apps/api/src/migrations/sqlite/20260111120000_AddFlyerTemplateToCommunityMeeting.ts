import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddFlyerTemplateToCommunityMeeting20260111120000 implements MigrationInterface {
	name = 'AddFlyerTemplateToCommunityMeeting20260111120000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`ALTER TABLE "community_meeting" ADD COLUMN "flyer_template" text`);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`ALTER TABLE "community_meeting" DROP COLUMN "flyer_template"`);
	}
}
