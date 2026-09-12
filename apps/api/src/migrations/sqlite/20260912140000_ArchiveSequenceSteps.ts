import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Soft archive for sequence steps (M5-B4).
 *
 * Removing a step from the editor used to hard-delete the `sequence_steps`
 * row, and the `scheduled_messages.stepId` FK is ON DELETE CASCADE — so the
 * coordinator lost the SENT history of that step just by reorganizing the
 * sequence. From now on a removed step is archived (`isArchived = 1`): it
 * stops enrolling and disappears from the editor, its PENDING messages are
 * cancelled (not deleted), and `sent`/`queued` rows survive as audit.
 *
 * Purely additive single ADD COLUMN: no table recreate, no FK touch, no
 * imports from `@repo/types` (prod migrations stay package-free).
 *
 * `transaction = false` + the idempotency guard follow the established
 * pattern (see ServerShirtPricingAndConfirmation): if `up()` ever fails
 * further down, the committed ADD COLUMN must not brick the next boot with
 * "duplicate column name".
 */
export class ArchiveSequenceSteps20260912140000 implements MigrationInterface {
	name = 'ArchiveSequenceSteps20260912140000';
	timestamp = '20260912140000';

	transaction = false as const;

	public async up(queryRunner: QueryRunner): Promise<void> {
		const columns: { name: string }[] = await queryRunner.query(
			`PRAGMA table_info("sequence_steps")`,
		);
		if (!columns.some((c) => c.name === 'isArchived')) {
			await queryRunner.query(
				`ALTER TABLE "sequence_steps" ADD COLUMN "isArchived" boolean NOT NULL DEFAULT 0`,
			);
		}
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		// Reversible: SQLite >= 3.35 supports DROP COLUMN and this table has no
		// indexes over `isArchived`. Existing archived rows simply come back to
		// life, which is the pre-migration semantics.
		const columns: { name: string }[] = await queryRunner.query(
			`PRAGMA table_info("sequence_steps")`,
		);
		if (columns.some((c) => c.name === 'isArchived')) {
			await queryRunner.query(`ALTER TABLE "sequence_steps" DROP COLUMN "isArchived"`);
		}
	}
}
