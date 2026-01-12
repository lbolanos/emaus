import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateNewsletterTable20260112114113 {
	name = 'CreateNewsletterTable20260112114113';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`
			CREATE TABLE "newsletter_subscribers" (
				"id" varchar PRIMARY KEY,
				"email" varchar NOT NULL UNIQUE,
				"firstName" varchar,
				"lastName" varchar,
				"isActive" boolean NOT NULL DEFAULT 1,
				"subscribedAt" datetime NOT NULL DEFAULT (datetime('now'))
			)
		`);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`DROP TABLE "newsletter_subscribers"`);
	}
}
