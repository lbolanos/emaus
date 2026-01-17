import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAvatarUrlToUserProfile20260116170000 implements MigrationInterface {
	name = 'AddAvatarUrlToUserProfile20260116170000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		// Add avatarUrl column to user_profiles table
		await queryRunner.query(`
			ALTER TABLE "user_profiles" ADD COLUMN "avatarUrl" varchar
		`);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		// Remove avatarUrl column from user_profiles table
		await queryRunner.query(`
			ALTER TABLE "user_profiles" DROP COLUMN "avatarUrl"
		`);
	}
}
