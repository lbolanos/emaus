import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRetreatTypeAndVersion20251214152000 implements MigrationInterface {
	public async up(queryRunner: QueryRunner): Promise<void> {
		console.log('📝 Adding type and version columns to retreats table...');

		try {
			// Add retreat_type column
			await queryRunner.query(`
                ALTER TABLE retreat
                ADD COLUMN retreat_type VARCHAR NULL
            `);
			console.log('  ✅ Added retreat_type column');

			// Add retreat_number_version column
			await queryRunner.query(`
                ALTER TABLE retreat
                ADD COLUMN retreat_number_version VARCHAR NULL
            `);
			console.log('  ✅ Added retreat_number_version column');

			console.log('🎉 Successfully added type and version columns to retreats table');
		} catch (error: any) {
			console.error('❌ Error adding type and version columns:', error?.message || error);
			throw error;
		}
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		console.log('⏪ Rolling back type and version columns from retreats table...');

		try {
			// Remove retreat_number_version column
			await queryRunner.query(`
                ALTER TABLE retreat
                DROP COLUMN retreat_number_version
            `);
			console.log('  ✅ Removed retreat_number_version column');

			// Remove retreat_type column
			await queryRunner.query(`
                ALTER TABLE retreat
                DROP COLUMN retreat_type
            `);
			console.log('  ✅ Removed retreat_type column');

			console.log('✅ Successfully rolled back type and version columns from retreats table');
		} catch (error: any) {
			console.error('❌ Error rolling back type and version columns:', error?.message || error);
			throw error;
		}
	}
}
