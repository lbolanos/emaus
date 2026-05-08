import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Añade timezone (IANA) configurable a casa y retiro.
 *
 *   - house.timezone   NOT NULL DEFAULT 'America/Mexico_City'
 *     Fuente de verdad de la zona física donde está la casa.
 *   - retreat.timezone NULL
 *     Override opcional para retiros itinerantes; si es NULL se hereda de la casa.
 *
 * Resolución efectiva (en código, no en SQL):
 *   retreat.timezone ?? retreat.house.timezone ?? 'America/Mexico_City'
 *
 * El campo lo consume `computeItemDateRange()` en retreatScheduleService al
 * materializar el Minuto a Minuto y al auto-generar slots del Santísimo.
 *
 * Solo ADD COLUMN → sin recreate-table, sin transaction=false.
 */
export class AddTimezoneToHouseAndRetreat20260507280000 implements MigrationInterface {
	name = 'AddTimezoneToHouseAndRetreat20260507280000';
	timestamp = '20260507280000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			`ALTER TABLE "house" ADD COLUMN "timezone" VARCHAR(64) NOT NULL DEFAULT 'America/Mexico_City'`,
		);
		await queryRunner.query(`ALTER TABLE "retreat" ADD COLUMN "timezone" VARCHAR(64)`);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		// SQLite ≥ 3.35 soporta DROP COLUMN nativamente.
		await queryRunner.query(`ALTER TABLE "retreat" DROP COLUMN "timezone"`);
		await queryRunner.query(`ALTER TABLE "house" DROP COLUMN "timezone"`);
	}
}
