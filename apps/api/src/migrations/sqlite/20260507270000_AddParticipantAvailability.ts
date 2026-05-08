import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Disponibilidad horaria de angelitos (servidores type='partial_server') para
 * filtrar la auto-asignación y la búsqueda manual de candidatos en Santísimo.
 * Cada angelito puede declarar N bloques (startTime, endTime) por retiro.
 */
export class AddParticipantAvailability20260507270000 implements MigrationInterface {
	name = 'AddParticipantAvailability20260507270000';
	timestamp = '20260507270000';

	// La migración de up() solo CREATE TABLE (sin DROP) y down() hace DROP de la
	// tabla nueva. Aunque participant_availability no tiene FK entrantes, el
	// guard de tests exige `transaction = false` para cualquier migración con
	// DROP TABLE en SQLite — ver .ruler/skills/sqlite-migrations/SKILL.md.
	transaction = false;

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`
			CREATE TABLE "participant_availability" (
				"id" VARCHAR(36) PRIMARY KEY NOT NULL,
				"participantId" VARCHAR(36) NOT NULL,
				"retreatId" VARCHAR(36) NOT NULL,
				"startTime" DATETIME NOT NULL,
				"endTime" DATETIME NOT NULL,
				"createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
				"updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
				FOREIGN KEY ("participantId") REFERENCES "participants" ("id") ON DELETE CASCADE,
				FOREIGN KEY ("retreatId") REFERENCES "retreat" ("id") ON DELETE CASCADE
			)
		`);

		await queryRunner.query(
			`CREATE INDEX "IDX_participant_availability_lookup" ON "participant_availability" ("participantId", "retreatId")`,
		);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`DROP INDEX IF EXISTS "IDX_participant_availability_lookup"`);
		await queryRunner.query(`DROP TABLE IF EXISTS "participant_availability"`);
	}
}
