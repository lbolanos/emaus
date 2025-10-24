import { MigrationInterface, QueryRunner } from 'typeorm';

export class MigrateLegacyPaymentAmounts1738596000000 implements MigrationInterface {
    name = 'MigrateLegacyPaymentAmounts1738596000000';
    timestamp = '1738596000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        console.log('🔄 Migrating legacy payment amounts to Payment records...');

        // First, ensure we have a system user for recordedBy field
        await queryRunner.query(`
            INSERT OR IGNORE INTO "users" (
                "id", "email", "password", "firstName", "lastName", "role", "isActive", "createdAt", "updatedAt"
            ) VALUES (
                lower(hex(randomblob(16))),
                'system@emaus.local',
                'system_user_legacy_migration',
                'System',
                'User',
                'superadmin',
                true,
                datetime('now'),
                datetime('now')
            )
        `);

        // Get the system user ID
        const systemUserResult = await queryRunner.query(
            `SELECT id FROM "users" WHERE "email" = 'system@emaus.local' LIMIT 1`
        );

        if (systemUserResult.length === 0) {
            console.log('❌ System user not found');
            return;
        }

        const systemUserId = systemUserResult[0].id;

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
                const paymentId = 'pay_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
                await queryRunner.query(`
                    INSERT INTO "payments" (
                        id, "participantId", "retreatId", amount, "paymentDate",
                        "paymentMethod", "referenceNumber", notes, "recordedBy",
                        "createdAt", "updatedAt"
                    ) VALUES (
                        ?, ?, ?, ?, ?, 'other', 'MIGRATED',
                        'Migrated from legacy participant.paymentAmount field', ?,
                        datetime('now'), datetime('now')
                    )
                `, [paymentId,
                    participant.id,
                    participant.retreatId,
                    participant.paymentAmount,
                    participant.paymentDate,
                    systemUserId
                ]);

                console.log(`✅ Created payment record for participant ${participant.id}: $${participant.paymentAmount}`);
            } else {
                console.log(`⏭️  Skipping participant ${participant.id} - already has ${existingPayments[0].count} payment records`);
            }
        }

        console.log('✅ Migration completed successfully');
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        console.log('↩️ Rolling back migrated payment records...');

        // Remove the migrated payment records
        await queryRunner.query(`
            DELETE FROM "payments"
            WHERE notes = 'Migrated from legacy participant.paymentAmount field'
            AND "referenceNumber" = 'MIGRATED'
        `);

        console.log('✅ Rollback completed - removed migrated payment records');
    }
}