import { MigrationInterface, QueryRunner } from 'typeorm';

export class BackfillNullIdOnRetreat20260321140000 implements MigrationInterface {
	name = 'BackfillNullIdOnRetreat20260321140000';
	timestamp = '20260321140000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		console.log('Backfilling null idOnRetreat values in retreat_participants...');

		// Find all retreats that have rows with null idOnRetreat
		const retreats = await queryRunner.query(
			`SELECT DISTINCT "retreatId" FROM "retreat_participants" WHERE "idOnRetreat" IS NULL`,
		);

		for (const { retreatId } of retreats) {
			// Get the current max for this retreat
			const maxResult = await queryRunner.query(
				`SELECT COALESCE(MAX("idOnRetreat"), 0) as maxId FROM "retreat_participants" WHERE "retreatId" = ?`,
				[retreatId],
			);
			let nextId = (maxResult[0]?.maxId || 0) + 1;

			// Get null rows ordered by createdAt so assignment is deterministic
			const nullRows = await queryRunner.query(
				`SELECT "id" FROM "retreat_participants" WHERE "retreatId" = ? AND "idOnRetreat" IS NULL ORDER BY "createdAt" ASC`,
				[retreatId],
			);

			for (const row of nullRows) {
				await queryRunner.query(
					`UPDATE "retreat_participants" SET "idOnRetreat" = ? WHERE "id" = ?`,
					[nextId, row.id],
				);
				nextId++;
			}

			console.log(`  Retreat ${retreatId}: backfilled ${nullRows.length} rows (starting at ${(maxResult[0]?.maxId || 0) + 1})`);
		}

		const totalFixed = retreats.length > 0
			? (await queryRunner.query(`SELECT COUNT(*) as count FROM "retreat_participants" WHERE "idOnRetreat" IS NOT NULL`))
			: [];
		console.log('Backfill complete.');
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		// Cannot reliably reverse — the original nulls are indistinguishable from intentional values
		console.log('BackfillNullIdOnRetreat: down is a no-op (cannot distinguish backfilled from original values)');
	}
}
