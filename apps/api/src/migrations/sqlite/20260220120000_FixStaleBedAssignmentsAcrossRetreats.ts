import { MigrationInterface, QueryRunner } from 'typeorm';

export class FixStaleBedAssignmentsAcrossRetreats20260220120000 implements MigrationInterface {
	public async up(queryRunner: QueryRunner): Promise<void> {
		console.log('🔧 Fixing stale bed assignments across retreats...');

		// Step 1: Identify stale bed assignments where bed.retreatId != participant.retreatId
		const staleAssignments = await queryRunner.query(`
			SELECT rb.id as bedId, rb.retreatId as bedRetreatId, rb.participantId,
			       rb.roomNumber, rb.bedNumber,
			       p.retreatId as participantRetreatId, p.firstName, p.lastName
			FROM retreat_bed rb
			JOIN participants p ON rb.participantId = p.id
			WHERE rb.retreatId != p.retreatId
		`);

		console.log(`📊 Found ${staleAssignments.length} stale bed assignments (bed retreat != participant retreat)`);
		for (const stale of staleAssignments) {
			console.log(
				`  - ${stale.firstName} ${stale.lastName}: bed in retreat ${stale.bedRetreatId}, participant in retreat ${stale.participantRetreatId} (Room ${stale.roomNumber}, Bed ${stale.bedNumber})`,
			);
		}

		// Clear stale assignments: set participantId to NULL where bed retreat doesn't match participant retreat
		if (staleAssignments.length > 0) {
			await queryRunner.query(`
				UPDATE retreat_bed
				SET participantId = NULL
				WHERE id IN (
					SELECT rb.id
					FROM retreat_bed rb
					JOIN participants p ON rb.participantId = p.id
					WHERE rb.retreatId != p.retreatId
				)
			`);
			console.log(`✅ Cleared ${staleAssignments.length} stale bed assignments`);
		}

		// Step 2: Find remaining duplicate participantId entries (same participant in multiple beds)
		const duplicates = await queryRunner.query(`
			SELECT participantId, COUNT(*) as cnt
			FROM retreat_bed
			WHERE participantId IS NOT NULL
			GROUP BY participantId
			HAVING COUNT(*) > 1
		`);

		console.log(`📊 Found ${duplicates.length} participants with multiple bed assignments`);

		for (const dup of duplicates) {
			// Keep only the bed that matches the participant's current retreat
			const beds = await queryRunner.query(
				`
				SELECT rb.id as bedId, rb.retreatId as bedRetreatId, p.retreatId as participantRetreatId
				FROM retreat_bed rb
				JOIN participants p ON rb.participantId = p.id
				WHERE rb.participantId = ?
				ORDER BY CASE WHEN rb.retreatId = p.retreatId THEN 0 ELSE 1 END ASC
			`,
				[dup.participantId],
			);

			// Keep the first one (matching retreat), clear the rest
			for (let i = 1; i < beds.length; i++) {
				await queryRunner.query(`UPDATE retreat_bed SET participantId = NULL WHERE id = ?`, [
					beds[i].bedId,
				]);
				console.log(
					`  - Cleared duplicate bed ${beds[i].bedId} for participant ${dup.participantId}`,
				);
			}
		}

		// Step 3: Add partial UNIQUE index on participantId (only for non-NULL values)
		// This prevents the same participant from being assigned to multiple beds
		try {
			await queryRunner.query(`
				CREATE UNIQUE INDEX IF NOT EXISTS idx_retreat_bed_participant_unique
				ON retreat_bed (participantId)
				WHERE participantId IS NOT NULL
			`);
			console.log('✅ Added partial UNIQUE index on retreat_bed.participantId');
		} catch (error: any) {
			console.log(
				'⚠️  Could not create unique index:',
				error?.message || error,
			);
		}

		// Step 4: Verify no stale data remains
		const remaining = await queryRunner.query(`
			SELECT COUNT(*) as cnt
			FROM retreat_bed rb
			JOIN participants p ON rb.participantId = p.id
			WHERE rb.retreatId != p.retreatId
		`);

		console.log(`✅ Verification: ${remaining[0].cnt} stale assignments remaining (should be 0)`);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		console.log('⏪ Rolling back stale bed assignment fixes...');

		try {
			await queryRunner.query(`DROP INDEX IF EXISTS idx_retreat_bed_participant_unique`);
			console.log('✅ Removed partial UNIQUE index on retreat_bed.participantId');
		} catch (error: any) {
			console.log('⚠️  Could not remove index:', error?.message || error);
		}

		console.log(
			'⚠️  Note: Data changes (cleared stale assignments) cannot be automatically rolled back.',
		);
	}
}
