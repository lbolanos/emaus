import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Separa la inscripción pública de la visibilidad: `isPublic` pone el retiro en
 * la landing, `registrationOpen` habilita el POST de inscripción. Permite
 * anunciar un retiro con sus fechas ("Anunciado") sin aceptar inscripciones
 * hasta publicarlo.
 *
 * DEFAULT 1 a propósito: las filas existentes (retiros públicos ya montados)
 * mantienen el comportamiento de siempre — visibles y aceptando inscripción.
 * Los retiros NUEVOS nacen cerrados por el default del entity (false); el
 * default de la columna solo aplica a inserts SQL crudos (migrations/seed),
 * porque TypeORM siempre envía el valor del entity explícitamente.
 */
export class AddRegistrationOpenToRetreat20261021130000 implements MigrationInterface {
	name = 'AddRegistrationOpenToRetreat20261021130000';
	timestamp = '20261021130000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		// Idempotente a propósito: el API de dev auto-aplica migraciones pendientes
		// en cada restart de nodemon, así que un reintento no debe morir con
		// "duplicate column name".
		const columns: { name: string }[] = await queryRunner.query(`PRAGMA table_info("retreat")`);
		if (!columns.some((c) => c.name === 'registrationOpen')) {
			await queryRunner.query(
				`ALTER TABLE "retreat" ADD COLUMN "registrationOpen" boolean NOT NULL DEFAULT 1`,
			);
		}
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		const columns: { name: string }[] = await queryRunner.query(`PRAGMA table_info("retreat")`);
		if (columns.some((c) => c.name === 'registrationOpen')) {
			await queryRunner.query(`ALTER TABLE "retreat" DROP COLUMN "registrationOpen"`);
		}
	}
}
