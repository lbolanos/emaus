import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Marks the table prayer dynamics of EVERY schedule template set with their
 * document and the table audience (specs/assignment-documents, D3).
 *
 * `scheduleTemplateSeeder` keeps the two seeded sets in sync on boot, but sets
 * cloned from them (e.g. "Emaús — Del Valle", `sourceTag = clon:emaus_mexico`)
 * are owned by their community and the seeder never touches them. Without
 * this, the retreats that run on a clone — the ones that actually use the
 * feature — would not send the table dynamics to their table leaders.
 *
 * Only rows still linked to 'Oración de Intercesión' and without a document of
 * their own are updated, so a customised clone keeps its choice. Data only →
 * normal transaction; idempotent.
 */
export class MarkTablePrayerDocumentOnAllTemplateSets20261019140000 implements MigrationInterface {
	name = 'MarkTablePrayerDocumentOnAllTemplateSets20261019140000';
	timestamp = '20261019140000';

	static readonly DOCUMENT_NAME = 'Texto: Dinámicas de Oración en Grupo';
	static readonly TABLE_PRAYER_NAMES = [
		'Dinámica de Oración de Intercesión',
		'Dinámica Oración Compartida',
		'Dinámica: Oración en Grupo (Mateo 18:19-20)',
		'Dinámica: Oración Compartida (líder bendice con Números 6:24-26)',
	];

	public async up(queryRunner: QueryRunner): Promise<void> {
		const names = MarkTablePrayerDocumentOnAllTemplateSets20261019140000.TABLE_PRAYER_NAMES;
		await queryRunner.query(
			`UPDATE "schedule_template"
			 SET "documentName" = ?, "documentAudience" = 'table_leaders'
			 WHERE "name" IN (${names.map(() => '?').join(', ')})
			   AND "responsabilityName" = 'Oración de Intercesión'
			   AND "documentName" IS NULL`,
			[MarkTablePrayerDocumentOnAllTemplateSets20261019140000.DOCUMENT_NAME, ...names],
		);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		const names = MarkTablePrayerDocumentOnAllTemplateSets20261019140000.TABLE_PRAYER_NAMES;
		await queryRunner.query(
			`UPDATE "schedule_template"
			 SET "documentName" = NULL, "documentAudience" = 'responsables'
			 WHERE "name" IN (${names.map(() => '?').join(', ')})
			   AND "documentName" = ?`,
			[...names, MarkTablePrayerDocumentOnAllTemplateSets20261019140000.DOCUMENT_NAME],
		);
	}
}
