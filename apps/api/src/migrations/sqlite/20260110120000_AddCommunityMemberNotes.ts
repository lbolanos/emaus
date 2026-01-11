import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCommunityMemberNotes20260110120000 implements MigrationInterface {
	name = 'AddCommunityMemberNotes';
	timestamp = '20260110120000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		// Check if column already exists (safe for partial migrations)
		const tableInfo = await queryRunner.query(`PRAGMA table_info("community_member")`);
		const hasColumn = tableInfo.some((col: any) => col.name === 'notes');

		if (hasColumn) {
			console.log('notes column already exists in community_member, skipping...');
			return;
		}

		await queryRunner.query(`ALTER TABLE "community_member" ADD COLUMN "notes" text`);
		console.log('Added notes column to community_member table');
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		// SQLite doesn't support DROP COLUMN directly, would need to recreate table
		// For rollback, we would need to create a new table without the column
		// This is a limitation of SQLite
		console.warn('Rollback not fully supported for SQLite ALTER TABLE operations');
	}
}
