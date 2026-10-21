import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates `idempotency_keys` (specs/offline-mode, FR-16/FR-19): one row per
 * `Idempotency-Key` sent with a write the web app can queue without signal, so a
 * resend after a lost answer is replayed instead of executed twice.
 *
 * New table, no foreign keys in or out. `transaction = false` only because the
 * safety guard (`sqliteSafePattern.simple.test.ts`) requires it whenever a
 * migration contains DROP TABLE — here it is the down(). Without the wrapping
 * transaction up() must be re-runnable, hence IF NOT EXISTS everywhere.
 *
 * Plain SQL, no workspace imports (rule for migrations that run in prod).
 */
export class CreateIdempotencyKeys20261020120000 implements MigrationInterface {
	name = 'CreateIdempotencyKeys20261020120000';
	timestamp = '20261020120000';
	transaction = false as const;

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`
			CREATE TABLE IF NOT EXISTS "idempotency_keys" (
				"key" varchar(64) PRIMARY KEY NOT NULL,
				"userId" varchar(36) NOT NULL,
				"method" varchar(10) NOT NULL,
				"path" varchar(255) NOT NULL,
				"statusCode" integer NOT NULL,
				"responseBody" text,
				"createdAt" datetime NOT NULL DEFAULT (datetime('now')),
				"completedAt" datetime
			)
		`);
		await queryRunner.query(
			`CREATE INDEX IF NOT EXISTS "idx_idempotency_keys_created" ON "idempotency_keys" ("createdAt")`,
		);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`DROP INDEX IF EXISTS "idx_idempotency_keys_created"`);
		await queryRunner.query(`DROP TABLE IF EXISTS "idempotency_keys"`);
	}
}
