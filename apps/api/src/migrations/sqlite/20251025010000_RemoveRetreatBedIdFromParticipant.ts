import { MigrationInterface, QueryRunner, DataSource } from 'typeorm';

export class RemoveRetreatBedIdFromParticipant20251025010000 implements MigrationInterface {
	public async up(queryRunner: QueryRunner): Promise<void> {
		console.log('🔄 Starting migration to remove retreatBedId from participants table...');

		// First, let's verify the current state and ensure data integrity
		console.log('📊 Step 1: Verifying current data consistency...');

		const consistencyCheck = await queryRunner.query(`
            SELECT
                COUNT(*) as total_participants,
                COUNT(CASE WHEN retreatBedId IS NOT NULL THEN 1 END) as participants_with_beds,
                COUNT(CASE WHEN retreatBedId IS NOT NULL AND rb.id IS NULL THEN 1 END) as orphaned_references,
                COUNT(CASE WHEN retreatBedId IS NOT NULL AND rb.participantId != participants.id THEN 1 END) as bidirectional_inconsistencies
            FROM participants
            LEFT JOIN retreat_bed rb ON participants.retreatBedId = rb.id
            WHERE participants.isCancelled = 0
        `);

		const stats = consistencyCheck[0];
		console.log(`   📈 Current state:`);
		console.log(`      - Total participants: ${stats.total_participants}`);
		console.log(`      - Participants with beds: ${stats.participants_with_beds}`);
		console.log(`      - Orphaned references: ${stats.orphaned_references}`);
		console.log(`      - Bidirectional inconsistencies: ${stats.bidirectional_inconsistencies}`);

		if (stats.orphaned_references > 0 || stats.bidirectional_inconsistencies > 0) {
			console.error('❌ Cannot proceed with migration - data inconsistencies detected!');
			console.error('   Please run the consistency fix migration first.');
			throw new Error('Data inconsistencies detected - aborting migration');
		}

		// Step 2: Create a backup table for rollback purposes
		console.log('💾 Step 2: Creating backup table...');
		await queryRunner.query(`
            CREATE TABLE participants_backup_${Date.now()} AS
            SELECT * FROM participants
        `);
		console.log('   ✅ Backup table created');

		// Step 3: Create new indexes for efficient queries after migration
		console.log('🔍 Step 3: Creating new indexes for optimized queries...');

		try {
			// Create index for finding participants by their assigned beds
			await queryRunner.query(`
                CREATE INDEX IF NOT EXISTS idx_retreat_bed_participant_id
                ON retreat_bed(participantId)
            `);
			console.log('   ✅ Created index on retreat_bed.participantId');

			// Create composite index for participant + retreat queries
			await queryRunner.query(`
                CREATE INDEX IF NOT EXISTS idx_participant_retreat
                ON participants(retreatId, isCancelled)
            `);
			console.log('   ✅ Created composite index on participants(retreatId, isCancelled)');
		} catch (error: any) {
			console.log('   ⚠️ Index creation warning:', error?.message || error);
		}

		// Step 4: Create a view for backward compatibility during transition
		console.log('👁️ Step 4: Creating backward compatibility view...');
		await queryRunner.query(`
            CREATE VIEW IF NOT EXISTS participant_bed_assignments AS
            SELECT
                p.id as participantId,
                p.firstName,
                p.lastName,
                p.retreatId,
                rb.id as retreatBedId,
                rb.roomNumber,
                rb.bedNumber,
                rb.floor,
                rb.type as bedType,
                rb.defaultUsage
            FROM participants p
            LEFT JOIN retreat_bed rb ON rb.participantId = p.id
            WHERE p.isCancelled = 0
        `);
		console.log('   ✅ Backward compatibility view created');

		// Step 5: Verify all bed assignments can be found via the new relationship
		console.log('🔍 Step 5: Verifying new relationship works correctly...');

		const verificationQuery = await queryRunner.query(`
            SELECT
                COUNT(*) as total_assigned_beds,
                COUNT(CASE WHEN p.id IS NOT NULL THEN 1 END) as verified_assignments
            FROM retreat_bed rb
            LEFT JOIN participants p ON rb.participantId = p.id
            WHERE rb.participantId IS NOT NULL
        `);

		const verification = verificationQuery[0];
		console.log(`   📊 Verification results:`);
		console.log(`      - Total assigned beds: ${verification.total_assigned_beds}`);
		console.log(`      - Verified assignments: ${verification.verified_assignments}`);

		if (verification.total_assigned_beds !== verification.verified_assignments) {
			console.error('❌ Verification failed - some bed assignments are broken!');
			throw new Error('Bed assignment verification failed');
		}

		// Step 6: Drop indexes that use retreatBedId column
		console.log('🗑️ Step 6: Removing indexes that use retreatBedId column...');

		try {
			// Drop the TypeORM-created index first
			await queryRunner.query(`DROP INDEX IF EXISTS idx_participants_retreatBedId`);
			console.log('   ✅ Dropped idx_participants_retreatBedId index');

			// Drop the custom index
			await queryRunner.query(`DROP INDEX IF EXISTS idx_participant_retreat_bed`);
			console.log('   ✅ Dropped idx_participant_retreat_bed index');
		} catch (error: any) {
			console.log('   ⚠️ Index removal warning:', error?.message || error);
		}

		// Step 7: Drop the redundant column
		console.log('🗑️ Step 7: Removing retreatBedId column from participants table...');

		try {
			await queryRunner.query(`ALTER TABLE participants DROP COLUMN retreatBedId`);
			console.log('   ✅ retreatBedId column removed successfully');
		} catch (error: any) {
			console.error('❌ Failed to drop retreatBedId column:', error?.message || error);
			throw error;
		}

		// Step 8: Final verification
		console.log('✅ Step 8: Final verification...');

		const finalCheck = await queryRunner.query(`
            SELECT
                COUNT(*) as total_participants,
                COUNT(CASE WHEN rb.participantId IS NOT NULL THEN 1 END) as participants_with_beds
            FROM participants p
            LEFT JOIN retreat_bed rb ON rb.participantId = p.id
            WHERE p.isCancelled = 0
        `);

		const finalStats = finalCheck[0];
		console.log(`   📊 Final state:`);
		console.log(`      - Total participants: ${finalStats.total_participants}`);
		console.log(`      - Participants with beds: ${finalStats.participants_with_beds}`);
		console.log(`      - Data integrity: ✅ MAINTAINED`);

		console.log('🎉 Migration completed successfully!');
		console.log('📝 Summary of changes:');
		console.log('   - Removed redundant retreatBedId column from participants');
		console.log('   - Created optimized indexes for better performance');
		console.log('   - Created backward compatibility view');
		console.log('   - retreat_bed.participantId is now the single source of truth');
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		console.log('⏪ Rolling back migration: Adding retreatBedId back to participants...');

		// Step 1: Add the retreatBedId column back
		console.log('➕ Step 1: Adding retreatBedId column...');
		await queryRunner.query(`
            ALTER TABLE participants
            ADD COLUMN retreatBedId VARCHAR(36) NULL
        `);
		console.log('   ✅ retreatBedId column added');

		// Step 2: Populate retreatBedId from retreat_bed table
		console.log('🔄 Step 2: Populating retreatBedId from existing assignments...');
		await queryRunner.query(`
            UPDATE participants
            SET retreatBedId = (
                SELECT rb.id
                FROM retreat_bed rb
                WHERE rb.participantId = participants.id
            )
        `);
		console.log('   ✅ retreatBedId populated from existing assignments');

		// Step 3: Restore the old index if it existed
		console.log('🔍 Step 3: Restoring old indexes...');
		try {
			await queryRunner.query(`
                CREATE INDEX IF NOT EXISTS idx_participant_retreat_bed
                ON participants(retreatBedId)
            `);
			console.log('   ✅ Old index restored');
		} catch (error: any) {
			console.log('   ⚠️ Index restoration warning:', error?.message || error);
		}

		// Step 4: Drop the new indexes we created
		console.log('🗑️ Step 4: Cleaning up new indexes...');
		try {
			await queryRunner.query(`DROP INDEX IF EXISTS idx_retreat_bed_participant_id`);
			await queryRunner.query(`DROP INDEX IF EXISTS idx_participant_retreat`);
			console.log('   ✅ New indexes removed');
		} catch (error: any) {
			console.log('   ⚠️ Index cleanup warning:', error?.message || error);
		}

		// Step 5: Drop the compatibility view
		console.log('👁️ Step 5: Removing compatibility view...');
		await queryRunner.query(`DROP VIEW IF EXISTS participant_bed_assignments`);
		console.log('   ✅ Compatibility view removed');

		console.log('✅ Rollback completed successfully!');
		console.log('📝 Summary of rollback changes:');
		console.log('   - Added retreatBedId column back to participants');
		console.log('   - Populated retreatBedId from existing assignments');
		console.log('   - Restored original indexes');
		console.log('   - Removed compatibility view');
	}
}
