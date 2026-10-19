import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds `favoriteRetreatIds` (simple-array of retreat UUIDs) to `user_profiles`.
 *
 * Pure additive ALTER TABLE: no recreate-table, no `transaction = false` needed
 * (the static guard only demands it for DROP TABLE / FK changes). Idempotent on
 * purpose: dev's MIGRATIONS_AUTO_RUN re-runs pending migrations on every nodemon
 * restart, and a half-applied migration must survive a retry.
 */
export class AddFavoriteRetreatIdsToUserProfile20261019200000 implements MigrationInterface {
	name = 'AddFavoriteRetreatIdsToUserProfile20261019200000';
	timestamp = '20261019200000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		const columns: { name: string }[] = await queryRunner.query(`PRAGMA table_info("user_profiles")`);
		if (!columns.some((c) => c.name === 'favoriteRetreatIds')) {
			await queryRunner.query(`ALTER TABLE "user_profiles" ADD COLUMN "favoriteRetreatIds" text`);
		}
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		const columns: { name: string }[] = await queryRunner.query(`PRAGMA table_info("user_profiles")`);
		if (columns.some((c) => c.name === 'favoriteRetreatIds')) {
			await queryRunner.query(`ALTER TABLE "user_profiles" DROP COLUMN "favoriteRetreatIds"`);
		}
	}
}
