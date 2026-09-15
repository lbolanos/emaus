import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Columna de soporte para la purga automática de datos de salud (Fase 3 del
 * plan de protección de datos de salud): sella cuándo `healthDataRetentionService`
 * anuló medicación/dieta/discapacidad/contactos de emergencia de un
 * participante, 30 días después del fin del retiro correspondiente.
 *
 * NULL = nunca purgado (o el retiro aún no cumple los 30 días). El servicio
 * usa esta columna para no reprocesar filas ya purgadas.
 *
 * Solo ADD COLUMN — no requiere el patrón recreate-table.
 */
export class AddHealthDataPurgedAt20260914140000 implements MigrationInterface {
	name = 'AddHealthDataPurgedAt20260914140000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		const cols: Array<{ name: string }> = await queryRunner.query(
			`PRAGMA table_info("participants")`,
		);
		const colNames = new Set(cols.map((c) => c.name));

		if (!colNames.has('healthDataPurgedAt')) {
			await queryRunner.query(
				`ALTER TABLE "participants" ADD COLUMN "healthDataPurgedAt" datetime NULL`,
			);
		}
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`ALTER TABLE "participants" DROP COLUMN "healthDataPurgedAt"`);
	}
}
