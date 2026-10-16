import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds the per-retreat "special case" flag to `retreat_participants`: the
 * palanquero marks a walker whose situation the coordinator must review
 * before the retreat (separate room, a health condition, something else).
 *
 * - `specialCase` (boolean, default false): the walker awaits attention.
 * - `specialCaseCategory` (varchar, nullable): 'room' | 'health' | 'other'.
 * - `specialCaseNotes` (text, nullable): free-text reason.
 *
 * All three are in SENSITIVE_HEALTH_FIELDS (health regime): only callers with
 * `participant:health` read or write them.
 *
 * Plain ADD COLUMN (no recreate-table, no incoming FKs touched) → runs
 * inside the normal transaction; no `transaction = false` needed.
 * Idempotency guard per column so a re-run after a partial failure (or the
 * dev auto-runner restarting mid-write) doesn't die with "duplicate column
 * name" and leave the migration stuck as pending.
 */
export class AddSpecialCaseToRetreatParticipants20261015180000
	implements MigrationInterface
{
	name = 'AddSpecialCaseToRetreatParticipants20261015180000';
	timestamp = '20261015180000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		const columns: { name: string }[] = await queryRunner.query(
			`PRAGMA table_info("retreat_participants")`,
		);
		const has = (name: string) => columns.some((c) => c.name === name);
		if (!has('specialCase')) {
			await queryRunner.query(
				`ALTER TABLE "retreat_participants" ADD COLUMN "specialCase" boolean NOT NULL DEFAULT 0`,
			);
		}
		if (!has('specialCaseCategory')) {
			await queryRunner.query(
				`ALTER TABLE "retreat_participants" ADD COLUMN "specialCaseCategory" varchar`,
			);
		}
		if (!has('specialCaseNotes')) {
			await queryRunner.query(
				`ALTER TABLE "retreat_participants" ADD COLUMN "specialCaseNotes" text`,
			);
		}
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		// SQLite >= 3.35 supports native DROP COLUMN (no recreate needed).
		await queryRunner.query(
			`ALTER TABLE "retreat_participants" DROP COLUMN "specialCaseNotes"`,
		);
		await queryRunner.query(
			`ALTER TABLE "retreat_participants" DROP COLUMN "specialCaseCategory"`,
		);
		await queryRunner.query(
			`ALTER TABLE "retreat_participants" DROP COLUMN "specialCase"`,
		);
	}
}
