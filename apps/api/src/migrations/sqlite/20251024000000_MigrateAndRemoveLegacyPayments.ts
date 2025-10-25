import { MigrationInterface, QueryRunner } from 'typeorm';

export class MigrateAndRemoveLegacyPayments20251024000000 implements MigrationInterface {
    name = 'MigrateAndRemoveLegacyPayments20251024000000';
    timestamp = '20251024000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        console.log('🔄 Starting migration: Migrate legacy payment amounts and remove legacy fields...');

        // Check if participants table exists and has legacy payment columns
        const tableExists = await queryRunner.query(`
            SELECT name FROM sqlite_master
            WHERE type = 'table' AND name = 'participants'
        `);

        if (tableExists.length === 0) {
            console.log('❌ Participants table not found');
            return;
        }

        // Check if legacy columns exist
        const tableInfo = await queryRunner.query(`PRAGMA table_info(participants)`);
        const hasPaymentAmount = tableInfo.some((column: any) => column.name === 'paymentAmount');
        const hasPaymentDate = tableInfo.some((column: any) => column.name === 'paymentDate');

        if (hasPaymentAmount && hasPaymentDate) {
            // Get participants with legacy payment data
            const participantsWithPayment = await queryRunner.query(`
                SELECT id, retreatId, "paymentAmount", "paymentDate"
                FROM "participants"
                WHERE "paymentAmount" IS NOT NULL
                AND CAST("paymentAmount" AS REAL) > 0
                AND "paymentDate" IS NOT NULL
            `);

            console.log(`Found ${participantsWithPayment.length} participants with legacy payment data`);

            // Create payment records for each participant
            for (const participant of participantsWithPayment) {
                // Check if payment records already exist
                const existingPayments = await queryRunner.query(
                    `SELECT COUNT(*) as count FROM "payments" WHERE "participantId" = ?`,
                    [participant.id]
                );

                // Only create payment if no existing records found
                if (existingPayments[0].count === 0) {
                    const paymentId = 'pay_' + Date.now() + '_' + Math.random().toString(36).substring(2, 11);
                    await queryRunner.query(`
                        INSERT INTO "payments" (
                            id, "participantId", "retreatId", amount, "paymentDate",
                            "paymentMethod", "referenceNumber", notes, "recordedBy",
                            "createdAt", "updatedAt"
                        ) VALUES (
                            ?, ?, ?, ?, ?, 'other', 'MIGRATED',
                            'Migrated from legacy participant.paymentAmount field', NULL,
                            datetime('now'), datetime('now')
                        )
                    `, [paymentId,
                        participant.id,
                        participant.retreatId,
                        participant.paymentAmount,
                        participant.paymentDate
                    ]);

                    console.log(`✅ Created payment record for participant ${participant.id}: $${participant.paymentAmount}`);
                } else {
                    console.log(`⏭️  Skipping participant ${participant.id} - already has ${existingPayments[0].count} payment records`);
                }
            }

            // Now remove the legacy payment fields
            console.log('🗑️ Removing legacy paymentAmount and paymentDate fields from participants table...');

            // Remove paymentAmount column
            console.log('🗑️ Dropping paymentAmount column...');
            await queryRunner.query(`ALTER TABLE participants DROP COLUMN paymentAmount`);

            // Remove paymentDate column
            console.log('🗑️ Dropping paymentDate column...');
            await queryRunner.query(`ALTER TABLE participants DROP COLUMN paymentDate`);

            console.log('✅ Legacy payment fields removed successfully');
        } else {
            console.log('ℹ️ Legacy payment fields not found - skipping migration');
        }

        console.log('✅ Migration completed successfully');
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        console.log('↩️ Rolling back: Re-adding legacy payment fields and removing migrated payment records...');

        // Remove the migrated payment records first
        await queryRunner.query(`
            DELETE FROM "payments"
            WHERE notes = 'Migrated from legacy participant.paymentAmount field'
            AND "referenceNumber" = 'MIGRATED'
        `);

        // Re-add paymentAmount column
        await queryRunner.query(`
            ALTER TABLE participants
            ADD COLUMN paymentAmount DECIMAL(10, 2)
        `);

        // Re-add paymentDate column
        await queryRunner.query(`
            ALTER TABLE participants
            ADD COLUMN paymentDate DATE
        `);

        console.log('✅ Rollback completed - legacy payment fields restored and migrated records removed');
    }
}