import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds `retreat_participants.paysAtHouse` (boolean, default false): the
 * participant committed to pay when they arrive at the retreat house on
 * Friday. It does NOT exempt them from the charge (unlike isScholarship) —
 * it only changes the derived paymentStatus from unpaid/partial to
 * 'pays_at_house' while they still owe.
 *
 * Plain ADD COLUMN (no recreate-table, no incoming FKs touched) → runs
 * inside the normal transaction; no `transaction = false` needed.
 * Idempotency guard so a re-run after a partial failure (or the dev
 * auto-runner restarting mid-write) doesn't die with "duplicate column
 * name" and leave the migration stuck as pending.
 */
export class AddPaysAtHouseToRetreatParticipants20261015120000
	implements MigrationInterface
{
	name = 'AddPaysAtHouseToRetreatParticipants20261015120000';
	timestamp = '20261015120000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		const columns: { name: string }[] = await queryRunner.query(
			`PRAGMA table_info("retreat_participants")`,
		);
		if (!columns.some((c) => c.name === 'paysAtHouse')) {
			await queryRunner.query(
				`ALTER TABLE "retreat_participants" ADD COLUMN "paysAtHouse" boolean NOT NULL DEFAULT 0`,
			);
		}
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		// SQLite >= 3.35 supports native DROP COLUMN (no recreate needed).
		await queryRunner.query(
			`ALTER TABLE "retreat_participants" DROP COLUMN "paysAtHouse"`,
		);
	}
}
