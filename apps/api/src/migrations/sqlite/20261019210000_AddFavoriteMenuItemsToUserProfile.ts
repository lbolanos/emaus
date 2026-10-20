import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds `favoriteMenuItems` (simple-array of sidebar menu route names) to
 * `user_profiles`.
 *
 * Pure additive ALTER TABLE: no recreate-table, no `transaction = false` needed
 * (the static guard only demands it for DROP TABLE / FK changes). Idempotent on
 * purpose: dev's MIGRATIONS_AUTO_RUN re-runs pending migrations on every nodemon
 * restart, and a half-applied migration must survive a retry.
 */
export class AddFavoriteMenuItemsToUserProfile20261019210000 implements MigrationInterface {
	name = 'AddFavoriteMenuItemsToUserProfile20261019210000';
	timestamp = '20261019210000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		const columns: { name: string }[] = await queryRunner.query(`PRAGMA table_info("user_profiles")`);
		if (!columns.some((c) => c.name === 'favoriteMenuItems')) {
			await queryRunner.query(`ALTER TABLE "user_profiles" ADD COLUMN "favoriteMenuItems" text`);
		}
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		const columns: { name: string }[] = await queryRunner.query(`PRAGMA table_info("user_profiles")`);
		if (columns.some((c) => c.name === 'favoriteMenuItems')) {
			await queryRunner.query(`ALTER TABLE "user_profiles" DROP COLUMN "favoriteMenuItems"`);
		}
	}
}
