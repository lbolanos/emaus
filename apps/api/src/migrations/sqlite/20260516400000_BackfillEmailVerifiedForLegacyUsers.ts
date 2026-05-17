import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Backfill `emailVerified=true` for legacy users.
 *
 * Why: the previous migration (20260516300000_AddEmailVerifiedToUser) defaulted
 * the new column to 0, which means ALL pre-existing users now see the
 * EmailVerificationBanner — including:
 *   - Google users (their email was already verified by Google)
 *   - Users who have been operating in the app for months/years
 *
 * Strategy: mark every user as verified UNLESS they currently hold an active
 * verification token. Holding a token means the user is mid-flow (just
 * registered) and the regular flow will set emailVerified on the next
 * /verify-email call.
 *
 * Idempotent: re-running has no effect because only users with
 * `emailVerified=0` are touched and the criterion narrows over time.
 *
 * Reversible via `down()` (sets back to 0 for everyone — destructive, only
 * used in tests).
 */
export class BackfillEmailVerifiedForLegacyUsers20260516400000 implements MigrationInterface {
	name = 'BackfillEmailVerifiedForLegacyUsers';
	timestamp = '20260516400000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		const beforeRow = await queryRunner.query(
			`SELECT COUNT(*) as c FROM users WHERE emailVerified = 0 AND emailVerificationToken IS NULL`,
		);
		const candidates = beforeRow[0]?.c ?? 0;

		const res = await queryRunner.query(
			`UPDATE users
			 SET emailVerified = 1
			 WHERE emailVerified = 0
			   AND emailVerificationToken IS NULL`,
		);
		// SQLite doesn't return affected rows reliably via TypeORM here; print the
		// pre-update count which is the upper bound.
		console.log(
			`📧 Backfilled emailVerified=1 for ${candidates} legacy users (Google + locales sin token pendiente).`,
		);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`UPDATE users SET emailVerified = 0`);
		console.log('⚠️  Reset emailVerified=0 for ALL users (destructive — tests only).');
	}
}
