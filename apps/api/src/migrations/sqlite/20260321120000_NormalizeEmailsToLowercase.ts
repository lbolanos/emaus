import { MigrationInterface, QueryRunner } from 'typeorm';

export class NormalizeEmailsToLowercase20260321120000 implements MigrationInterface {
	public async up(queryRunner: QueryRunner): Promise<void> {
		// Normalize emails to lowercase in users table
		await queryRunner.query(
			`UPDATE users SET email = LOWER(TRIM(email)) WHERE email != LOWER(TRIM(email))`,
		);

		// Normalize emails in participants table
		await queryRunner.query(
			`UPDATE participants SET email = LOWER(TRIM(email)) WHERE email IS NOT NULL AND email != LOWER(TRIM(email))`,
		);

		// Normalize emails in newsletter_subscribers table
		const hasNewsletter = await queryRunner.query(
			`SELECT name FROM sqlite_master WHERE type='table' AND name='newsletter_subscribers'`,
		);
		if (hasNewsletter.length > 0) {
			await queryRunner.query(
				`UPDATE newsletter_subscribers SET email = LOWER(TRIM(email)) WHERE email != LOWER(TRIM(email))`,
			);
		}
	}

	public async down(_queryRunner: QueryRunner): Promise<void> {
		throw new Error('Cannot reverse email normalization — original casing is lost');
	}
}
