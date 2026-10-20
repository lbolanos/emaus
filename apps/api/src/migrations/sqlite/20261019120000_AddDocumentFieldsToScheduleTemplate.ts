import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds two columns to `schedule_template` so a moment can carry the document
 * that whoever runs it should receive (specs/assignment-documents, D1/D3):
 *
 * - `documentName` (nullable): canonical attachment name for the moment when it
 *   differs from its responsibility. The table prayer dynamics keep
 *   `responsabilityName = 'Oración de Intercesión'` (that still links the
 *   person in charge) but their document lives under
 *   'Texto: Dinámicas de Oración en Grupo'.
 * - `documentAudience` ('responsables' | 'table_leaders'): who receives the
 *   document. 'table_leaders' sends it to every table leader and co-leader.
 *
 * Schema only. The values for the seeded templates are written by
 * `scheduleTemplateSeeder.syncTemplateFields` on API boot (both fields are in
 * SYNCABLE_FIELDS), the same path every other template field uses.
 *
 * Plain ADD COLUMN (no recreate-table) → runs inside the normal transaction.
 * Idempotency guards so a re-run after a partial failure (or the dev
 * auto-runner restarting mid-write) doesn't die with "duplicate column name".
 */
export class AddDocumentFieldsToScheduleTemplate20261019120000 implements MigrationInterface {
	name = 'AddDocumentFieldsToScheduleTemplate20261019120000';
	timestamp = '20261019120000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		const columns: { name: string }[] = await queryRunner.query(
			`PRAGMA table_info("schedule_template")`,
		);
		if (!columns.some((c) => c.name === 'documentName')) {
			await queryRunner.query(
				`ALTER TABLE "schedule_template" ADD COLUMN "documentName" varchar`,
			);
		}
		if (!columns.some((c) => c.name === 'documentAudience')) {
			await queryRunner.query(
				`ALTER TABLE "schedule_template" ADD COLUMN "documentAudience" varchar NOT NULL DEFAULT 'responsables'`,
			);
		}
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		// SQLite >= 3.35 supports native DROP COLUMN (no recreate needed).
		await queryRunner.query(`ALTER TABLE "schedule_template" DROP COLUMN "documentAudience"`);
		await queryRunner.query(`ALTER TABLE "schedule_template" DROP COLUMN "documentName"`);
	}
}
