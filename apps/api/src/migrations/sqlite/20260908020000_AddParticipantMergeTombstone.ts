import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Tombstone for merged participants.
 *
 * The same person can exist twice: once registered for a retreat and once added
 * to a community roster. Measured on the real database, 4 of the 11 servers of
 * one retreat were duplicates of roster members, which is why the attendance
 * badge only reached 2 of them.
 *
 * Merging repoints every reference to the survivor. The absorbed row is NOT
 * deleted — it keeps a pointer to whoever absorbed it, so the operation stays
 * auditable and reversible by hand. Listings exclude rows that carry it.
 *
 * Plain ADD COLUMN, no physical FK: SQLite cannot add one through ALTER, and
 * `participants` has seventeen incoming foreign keys, so a recreate is exactly
 * the operation that destroyed data in this repo (skill `sqlite-migrations`).
 */
export class AddParticipantMergeTombstone20260908020000 implements MigrationInterface {
	name = 'AddParticipantMergeTombstone20260908020000';
	timestamp = '20260908020000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			`ALTER TABLE "participants" ADD COLUMN "mergedIntoParticipantId" varchar`,
		);
		await queryRunner.query(
			`CREATE INDEX IF NOT EXISTS "idx_participants_merged_into" ON "participants" ("mergedIntoParticipantId")`,
		);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`DROP INDEX IF EXISTS "idx_participants_merged_into"`);
		await queryRunner.query(
			`ALTER TABLE "participants" DROP COLUMN "mergedIntoParticipantId"`,
		);
	}
}
