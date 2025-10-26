import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddArrivalTimesToRetreat20251025180257 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        console.log('🕐 Adding arrival time columns to retreats table...');

        try {
            // Add walkerArrivalTime column
            await queryRunner.query(`
                ALTER TABLE retreat
                ADD COLUMN walkerArrivalTime TIME NULL
            `);
            console.log('  ✅ Added walkerArrivalTime column');

            // Add serverArrivalTimeFriday column
            await queryRunner.query(`
                ALTER TABLE retreat
                ADD COLUMN serverArrivalTimeFriday TIME NULL
            `);
            console.log('  ✅ Added serverArrivalTimeFriday column');

            console.log('🎉 Successfully added arrival time columns to retreats table');
        } catch (error: any) {
            console.error('❌ Error adding arrival time columns:', error?.message || error);
            throw error;
        }
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        console.log('⏪ Rolling back arrival time columns from retreats table...');

        try {
            // Remove serverArrivalTimeFriday column
            await queryRunner.query(`
                ALTER TABLE retreat
                DROP COLUMN serverArrivalTimeFriday
            `);
            console.log('  ✅ Removed serverArrivalTimeFriday column');

            // Remove walkerArrivalTime column
            await queryRunner.query(`
                ALTER TABLE retreat
                DROP COLUMN walkerArrivalTime
            `);
            console.log('  ✅ Removed walkerArrivalTime column');

            console.log('✅ Successfully rolled back arrival time columns from retreats table');
        } catch (error: any) {
            console.error('❌ Error rolling back arrival time columns:', error?.message || error);
            throw error;
        }
    }
}