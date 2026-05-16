import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds email verification fields to the `users` table.
 *
 * Why: defense-in-depth against the Vuln 2 attack class (privilege escalation
 * via account registration with a known contact email). With `emailVerified`,
 * a downstream flow can require verification before consuming any privileged
 * link such as a community link-request token.
 *
 * Idempotent: skip if columns already exist.
 *
 * Backfill: existing users are left with `emailVerified=0`. They are *not*
 * forced to re-verify on next login — verification only matters for newly
 * created accounts and for flows that explicitly check the flag.
 */
export class AddEmailVerifiedToUser20260516300000 implements MigrationInterface {
	name = 'AddEmailVerifiedToUser';
	timestamp = '20260516300000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		const cols: { name: string }[] = await queryRunner.query(
			`SELECT name FROM pragma_table_info('users')`,
		);
		const names = new Set(cols.map((c) => c.name));

		if (!names.has('emailVerified')) {
			await queryRunner.query(
				`ALTER TABLE users ADD COLUMN emailVerified BOOLEAN NOT NULL DEFAULT 0`,
			);
		}
		if (!names.has('emailVerificationToken')) {
			await queryRunner.query(
				`ALTER TABLE users ADD COLUMN emailVerificationToken VARCHAR(255)`,
			);
		}
		if (!names.has('emailVerificationExpiresAt')) {
			await queryRunner.query(
				`ALTER TABLE users ADD COLUMN emailVerificationExpiresAt DATETIME`,
			);
		}
		// Unique index on token to support fast lookup by /verify-email
		await queryRunner.query(
			`CREATE UNIQUE INDEX IF NOT EXISTS IDX_users_emailVerificationToken
			 ON users (emailVerificationToken) WHERE emailVerificationToken IS NOT NULL`,
		);

		console.log('✅ Added emailVerified columns to users');
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		// SQLite < 3.35 cannot DROP COLUMN trivially. The columns are nullable
		// (and the bool defaults to 0), so a no-op down is safe.
		await queryRunner.query(`DROP INDEX IF EXISTS IDX_users_emailVerificationToken`);
		console.log(
			'⚠️  AddEmailVerifiedToUser down() is a no-op (columns are kept). Manual recreate-table required if you really need them gone.',
		);
	}
}
