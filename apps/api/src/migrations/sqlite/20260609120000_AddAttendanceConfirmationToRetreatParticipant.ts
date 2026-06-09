import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Agrega `attendanceConfirmation` a `retreat_participants`: el estado de
 * confirmación de asistencia del caminante (pending / confirmed / declined),
 * que el líder/coordinador marca tras llamarlo antes del retiro. Distinto de
 * `checkedIn` (registro de llegada en recepción).
 *
 * `ADD COLUMN` es seguro: la tabla NO tiene CHECK sobre esta columna y el DEFAULT
 * 'pending' rellena las filas existentes (no requiere recreate-table).
 */
export class AddAttendanceConfirmationToRetreatParticipant20260609120000
	implements MigrationInterface
{
	name = 'AddAttendanceConfirmationToRetreatParticipant20260609120000';
	timestamp = '20260609120000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			`ALTER TABLE "retreat_participants" ADD COLUMN "attendanceConfirmation" varchar NOT NULL DEFAULT 'pending'`,
		);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		// SQLite 3.35+ soporta DROP COLUMN; la columna no tiene índices ni FKs.
		await queryRunner.query(
			`ALTER TABLE "retreat_participants" DROP COLUMN "attendanceConfirmation"`,
		);
	}
}
