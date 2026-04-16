import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddFloorLabelToBeds20260415120000 implements MigrationInterface {
	name = 'AddFloorLabelToBeds20260415120000';
	timestamp = '20260415120000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`ALTER TABLE "bed" ADD COLUMN "floorLabel" varchar NULL`);
		await queryRunner.query(`ALTER TABLE "retreat_bed" ADD COLUMN "floorLabel" varchar NULL`);
		console.log('Added floorLabel column to bed and retreat_bed tables');
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		// SQLite doesn't support DROP COLUMN directly, but TypeORM handles it
		// For safety, we create temp tables without the column
		await queryRunner.query(`
			CREATE TABLE "bed_temp" AS SELECT "id", "roomNumber", "bedNumber", "floor", "type", "defaultUsage", "houseId" FROM "bed"
		`);
		await queryRunner.query(`DROP TABLE "bed"`);
		await queryRunner.query(`ALTER TABLE "bed_temp" RENAME TO "bed"`);

		await queryRunner.query(`
			CREATE TABLE "retreat_bed_temp" AS SELECT "id", "roomNumber", "bedNumber", "floor", "type", "defaultUsage", "isActive", "retreatId", "participantId" FROM "retreat_bed"
		`);
		await queryRunner.query(`DROP TABLE "retreat_bed"`);
		await queryRunner.query(`ALTER TABLE "retreat_bed_temp" RENAME TO "retreat_bed"`);

		console.log('Removed floorLabel column from bed and retreat_bed tables');
	}
}
