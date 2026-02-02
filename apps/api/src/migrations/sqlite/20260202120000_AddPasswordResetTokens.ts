import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPasswordResetTokens20260202120000 implements MigrationInterface {
	public async up(queryRunner: QueryRunner): Promise<void> {
		// Add password reset token columns to users table
		// Note: SQLite doesn't support UNIQUE on ALTER TABLE, so we add a unique index instead
		await queryRunner.query(`
			ALTER TABLE "users" ADD COLUMN "passwordResetToken" varchar
		`);

		await queryRunner.query(`
			ALTER TABLE "users" ADD COLUMN "passwordResetTokenExpiresAt" datetime
		`);

		await queryRunner.query(`
			ALTER TABLE "users" ADD COLUMN "passwordResetTokenUsedAt" datetime
		`);

		// Create unique index for token lookups (enforces uniqueness)
		await queryRunner.query(`
			CREATE UNIQUE INDEX IF NOT EXISTS "IDX_users_passwordResetToken"
			ON "users" ("passwordResetToken")
		`);

		// Create index for cleanup queries
		await queryRunner.query(`
			CREATE INDEX IF NOT EXISTS "IDX_users_passwordResetTokenExpiresAt"
			ON "users" ("passwordResetTokenExpiresAt")
		`);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		// Drop indexes
		await queryRunner.query(`
			DROP INDEX IF EXISTS "IDX_users_passwordResetTokenExpiresAt"
		`);

		await queryRunner.query(`
			DROP INDEX IF EXISTS "IDX_users_passwordResetToken"
		`);

		// Drop columns
		await queryRunner.query(`
			ALTER TABLE "users" DROP COLUMN "passwordResetTokenUsedAt"
		`);

		await queryRunner.query(`
			ALTER TABLE "users" DROP COLUMN "passwordResetTokenExpiresAt"
		`);

		await queryRunner.query(`
			ALTER TABLE "users" DROP COLUMN "passwordResetToken"
		`);
	}
}
