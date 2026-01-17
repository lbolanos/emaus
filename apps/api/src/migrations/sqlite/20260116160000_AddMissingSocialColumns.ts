import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMissingSocialColumns20260116160000 implements MigrationInterface {
	public async up(queryRunner: QueryRunner): Promise<void> {
		// Add createdAt and updatedAt columns to user_profiles table
		await queryRunner.query(`
			ALTER TABLE "user_profiles" ADD COLUMN "createdAt" datetime DEFAULT (datetime('now'))
		`);

		await queryRunner.query(`
			ALTER TABLE "user_profiles" ADD COLUMN "updatedAt" datetime DEFAULT (datetime('now'))
		`);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		// Remove columns from user_profiles table
		await queryRunner.query(`ALTER TABLE "user_profiles" DROP COLUMN "updatedAt"`);
		await queryRunner.query(`ALTER TABLE "user_profiles" DROP COLUMN "createdAt"`);
	}
}
