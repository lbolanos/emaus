import { MigrationInterface, QueryRunner } from 'typeorm';

export class UpdateBedTypesForBunkBeds20251221193945 implements MigrationInterface {
	name = 'UpdateBedTypesForBunkBeds';
	timestamp = '20251221193945';

	public async up(queryRunner: QueryRunner): Promise<void> {
		// Step 1: Update bed table constraints
		await queryRunner.query(`
			ALTER TABLE "bed"
			DROP CONSTRAINT IF EXISTS "CHK_bed_type"
		`);

		await queryRunner.query(`
			ALTER TABLE "bed"
			ADD CONSTRAINT "CHK_bed_type"
			CHECK ("type" IN ('normal', 'litera_abajo', 'litera_arriba', 'colchon'))
		`);

		// Step 2: Update retreat_bed table constraints
		await queryRunner.query(`
			ALTER TABLE "retreat_bed"
			DROP CONSTRAINT IF EXISTS "CHK_retreat_bed_type"
		`);

		await queryRunner.query(`
			ALTER TABLE "retreat_bed"
			ADD CONSTRAINT "CHK_retreat_bed_type"
			CHECK ("type" IN ('normal', 'litera_abajo', 'litera_arriba', 'colchon'))
		`);

		// Step 3: Convert existing 'litera' beds to 'litera_abajo' (bottom bunk)
		await queryRunner.query(`
			UPDATE "bed"
			SET "type" = 'litera_abajo'
			WHERE "type" = 'litera'
		`);

		await queryRunner.query(`
			UPDATE "retreat_bed"
			SET "type" = 'litera_abajo'
			WHERE "type" = 'litera'
		`);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		// Step 1: Revert all 'litera_abajo' and 'litera_arriba' back to 'litera'
		await queryRunner.query(`
			UPDATE "bed"
			SET "type" = 'litera'
			WHERE "type" IN ('litera_abajo', 'litera_arriba')
		`);

		await queryRunner.query(`
			UPDATE "retreat_bed"
			SET "type" = 'litera'
			WHERE "type" IN ('litera_abajo', 'litera_arriba')
		`);

		// Step 2: Restore original constraints
		await queryRunner.query(`
			ALTER TABLE "bed"
			DROP CONSTRAINT IF EXISTS "CHK_bed_type"
		`);

		await queryRunner.query(`
			ALTER TABLE "bed"
			ADD CONSTRAINT "CHK_bed_type"
			CHECK ("type" IN ('normal', 'litera', 'colchon'))
		`);

		await queryRunner.query(`
			ALTER TABLE "retreat_bed"
			DROP CONSTRAINT IF EXISTS "CHK_retreat_bed_type"
		`);

		await queryRunner.query(`
			ALTER TABLE "retreat_bed"
			ADD CONSTRAINT "CHK_retreat_bed_type"
			CHECK ("type" IN ('normal', 'litera', 'colchon'))
		`);
	}
}