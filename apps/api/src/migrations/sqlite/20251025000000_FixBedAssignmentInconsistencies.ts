import { MigrationInterface, QueryRunner, DataSource } from 'typeorm';

export class FixBedAssignmentInconsistencies20251025000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        console.log('🔧 Starting bed assignment consistency fix...');

        // First, let's identify all inconsistencies
        const inconsistencies = await queryRunner.query(`
            SELECT
                p.id as participant_id,
                p.firstName,
                p.lastName,
                p.retreatBedId as participant_bed_id,
                rb.id as retreat_bed_id,
                rb.roomNumber,
                rb.bedNumber,
                rb.participantId as bed_participant_id,
                CASE
                    WHEN p.retreatBedId IS NOT NULL AND rb.id IS NULL THEN 'participant_points_to_nonexistent_bed'
                    WHEN p.retreatBedId IS NOT NULL AND rb.participantId != p.id THEN 'bidirectional_reference_broken'
                    WHEN p.retreatBedId IS NULL AND rb.participantId = p.id THEN 'bed_points_to_participant_but_no_back_reference'
                    WHEN p.retreatBedId IS NULL AND rb.participantId IS NULL THEN 'no_bed_assignment'
                    ELSE 'consistent'
                END as status
            FROM participants p
            LEFT JOIN retreat_bed rb ON p.retreatBedId = rb.id
            WHERE p.isCancelled = 0
            AND (
                (p.retreatBedId IS NOT NULL AND rb.id IS NULL) OR
                (p.retreatBedId IS NOT NULL AND rb.participantId != p.id) OR
                (p.retreatBedId IS NULL AND rb.participantId = p.id)
            )
        `);

        console.log(`📊 Found ${inconsistencies.length} inconsistencies:`);
        inconsistencies.forEach((inc: any) => {
            console.log(`  - ${inc.firstName} ${inc.lastName}: ${inc.status} (Room ${inc.roomNumber}, Bed ${inc.bedNumber})`);
        });

        // Fix Case 1: Participant points to bed, but bed points to different participant
        // In this case, we trust the bed's participantId as the source of truth
        const brokenReferences = inconsistencies.filter((inc: any) => inc.status === 'bidirectional_reference_broken');
        console.log(`🔧 Fixing ${brokenReferences.length} broken bidirectional references...`);

        for (const inconsistency of brokenReferences) {
            console.log(`  - Fixing ${inconsistency.firstName} ${inconsistency.lastName}: Setting retreatBedId to NULL (bed assigned to ${inconsistency.bed_participant_id})`);

            await queryRunner.query(`
                UPDATE participants
                SET retreatBedId = NULL
                WHERE id = ?
            `, [inconsistency.participant_id]);
        }

        // Fix Case 2: Bed points to participant, but participant has no bed reference
        // Update participant to point back to the bed
        const missingBackReferences = inconsistencies.filter((inc: any) => inc.status === 'bed_points_to_participant_but_no_back_reference');
        console.log(`🔧 Fixing ${missingBackReferences.length} missing back references...`);

        for (const inconsistency of missingBackReferences) {
            console.log(`  - Fixing ${inconsistency.firstName} ${inconsistency.lastName}: Setting retreatBedId to ${inconsistency.retreat_bed_id}`);

            await queryRunner.query(`
                UPDATE participants
                SET retreatBedId = ?
                WHERE id = ?
            `, [inconsistency.retreat_bed_id, inconsistency.participant_id]);
        }

        // Fix Case 3: Participant points to non-existent bed
        // Set retreatBedId to NULL
        const nonExistentBeds = inconsistencies.filter((inc: any) => inc.status === 'participant_points_to_nonexistent_bed');
        console.log(`🔧 Fixing ${nonExistentBeds.length} references to non-existent beds...`);

        for (const inconsistency of nonExistentBeds) {
            console.log(`  - Fixing ${inconsistency.firstName} ${inconsistency.lastName}: Setting retreatBedId to NULL (bed ${inconsistency.participant_bed_id} doesn't exist)`);

            await queryRunner.query(`
                UPDATE participants
                SET retreatBedId = NULL
                WHERE id = ?
            `, [inconsistency.participant_id]);
        }

        // Now let's verify the fix by checking for any remaining inconsistencies
        const remainingInconsistencies = await queryRunner.query(`
            SELECT
                p.id,
                p.firstName,
                p.lastName,
                p.retreatBedId,
                rb.id,
                rb.roomNumber,
                rb.bedNumber,
                rb.participantId,
                CASE
                    WHEN p.retreatBedId IS NOT NULL AND rb.id IS NULL THEN 'participant_points_to_nonexistent_bed'
                    WHEN p.retreatBedId IS NOT NULL AND rb.participantId != p.id THEN 'bidirectional_reference_broken'
                    WHEN p.retreatBedId IS NULL AND rb.participantId = p.id THEN 'bed_points_to_participant_but_no_back_reference'
                    ELSE 'consistent'
                END as status
            FROM participants p
            LEFT JOIN retreat_bed rb ON p.retreatBedId = rb.id
            WHERE p.isCancelled = 0
            AND (
                (p.retreatBedId IS NOT NULL AND rb.id IS NULL) OR
                (p.retreatBedId IS NOT NULL AND rb.participantId != p.id) OR
                (p.retreatBedId IS NULL AND rb.participantId = p.id)
            )
        `);

        console.log(`✅ Verification complete. Remaining inconsistencies: ${remainingInconsistencies.length}`);

        if (remainingInconsistencies.length === 0) {
            console.log('🎉 All bed assignment inconsistencies have been fixed!');
        } else {
            console.log('⚠️  Some inconsistencies remain. Manual review may be needed:');
            remainingInconsistencies.forEach((inc: any) => {
                console.log(`  - ${inc.firstName} ${inc.lastName}: ${inc.status}`);
            });
        }

        // Add database constraints to prevent future inconsistencies
        console.log('🔒 Adding database constraints to prevent future inconsistencies...');

        // Add unique constraint on retreatId, roomNumber, bedNumber to prevent duplicate beds
        try {
            await queryRunner.query(`
                CREATE UNIQUE INDEX IF NOT EXISTS idx_retreat_bed_unique
                ON retreat_bed (retreatId, roomNumber, bedNumber)
            `);
            console.log('  ✅ Added unique constraint on retreat beds');
        } catch (error: any) {
            console.log('  ⚠️  Unique constraint already exists or could not be created:', error?.message || error);
        }

        // Add index for performance
        try {
            await queryRunner.query(`
                CREATE INDEX IF NOT EXISTS idx_participant_retreat_bed
                ON participants (retreatBedId)
            `);
            console.log('  ✅ Added index on participants.retreatBedId');
        } catch (error: any) {
            console.log('  ⚠️  Index already exists or could not be created:', error?.message || error);
        }

        try {
            await queryRunner.query(`
                CREATE INDEX IF NOT EXISTS idx_retreat_bed_participant
                ON retreat_bed (participantId)
            `);
            console.log('  ✅ Added index on retreat_bed.participantId');
        } catch (error: any) {
            console.log('  ⚠️  Index already exists or could not be created:', error?.message || error);
        }
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        console.log('⏪ Rolling back bed assignment consistency fixes...');

        // Remove the indexes we added
        try {
            await queryRunner.query(`DROP INDEX IF EXISTS idx_retreat_bed_unique`);
            console.log('  ✅ Removed unique constraint on retreat beds');
        } catch (error: any) {
            console.log('  ⚠️  Could not remove unique constraint:', error?.message || error);
        }

        try {
            await queryRunner.query(`DROP INDEX IF EXISTS idx_participant_retreat_bed`);
            console.log('  ✅ Removed index on participants.retreatBedId');
        } catch (error: any) {
            console.log('  ⚠️  Could not remove index:', error?.message || error);
        }

        try {
            await queryRunner.query(`DROP INDEX IF EXISTS idx_retreat_bed_participant`);
            console.log('  ✅ Removed index on retreat_bed.participantId');
        } catch (error: any) {
            console.log('  ⚠️  Could not remove index:', error?.message || error);
        }

        console.log('⚠️  Note: Data changes made by this migration cannot be automatically rolled back.');
        console.log('      Manual intervention may be required to restore previous state.');
    }
}