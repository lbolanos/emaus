import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds `source` to `retreat_memory_song` to distinguish songs added by hand in
 * the Recuerdos form (`'manual'`) from songs imported from the minute-by-minute
 * schedule's `musicTrackUrl` (`'mam'`). Existing rows default to `'manual'`.
 *
 * Solo ADD/DROP COLUMN (no DROP TABLE), así que no requiere `transaction = false`.
 */
export class AddSourceToRetreatMemorySong20260609190000 implements MigrationInterface {
	name = 'AddSourceToRetreatMemorySong20260609190000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			`ALTER TABLE "retreat_memory_song" ADD COLUMN "source" varchar NOT NULL DEFAULT 'manual'`,
		);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`ALTER TABLE "retreat_memory_song" DROP COLUMN "source"`);
	}
}
