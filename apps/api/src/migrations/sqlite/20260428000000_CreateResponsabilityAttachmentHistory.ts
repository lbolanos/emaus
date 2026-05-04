import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Crea la tabla `responsability_attachment_history` que guarda versiones
 * anteriores de los markdowns. Cada vez que se hace `updateMarkdown`, la
 * versión actual del attachment se snapshota aquí ANTES de aplicar el cambio,
 * para que el coordinador pueda restaurar si edita por error (Ctrl+A + Delete
 * + Save es el accidente más común).
 *
 * Solo se versionan markdowns (kind='markdown'). Files no — su contenido vive
 * en S3/data-url y no se sobrescribe (cada upload es una fila nueva).
 *
 * Política de retención: sin límite por ahora. Si la tabla crece (>10MB),
 * agregar un cron que mantenga últimas N=20 versiones por attachmentId.
 */
export class CreateResponsabilityAttachmentHistory20260428000000
	implements MigrationInterface
{
	name = 'CreateResponsabilityAttachmentHistory20260428000000';
	timestamp = '20260428000000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`
			CREATE TABLE IF NOT EXISTS "responsability_attachment_history" (
				"id" varchar PRIMARY KEY NOT NULL,
				"attachmentId" varchar NOT NULL,
				"title" varchar NOT NULL,
				"content" text NOT NULL,
				"description" text,
				"sizeBytes" integer NOT NULL,
				"savedAt" datetime NOT NULL DEFAULT (datetime('now')),
				"savedById" varchar,
				CONSTRAINT "FK_rah_attachment" FOREIGN KEY ("attachmentId") REFERENCES "responsability_attachment" ("id") ON DELETE CASCADE,
				CONSTRAINT "FK_rah_user" FOREIGN KEY ("savedById") REFERENCES "users" ("id") ON DELETE SET NULL
			)
		`);
		await queryRunner.query(
			`CREATE INDEX IF NOT EXISTS "IDX_rah_attachment" ON "responsability_attachment_history" ("attachmentId")`,
		);
		await queryRunner.query(
			`CREATE INDEX IF NOT EXISTS "IDX_rah_attachment_savedAt" ON "responsability_attachment_history" ("attachmentId", "savedAt")`,
		);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			`DROP INDEX IF EXISTS "IDX_rah_attachment_savedAt"`,
		);
		await queryRunner.query(
			`DROP INDEX IF EXISTS "IDX_rah_attachment"`,
		);
		await queryRunner.query(`DROP TABLE IF EXISTS "responsability_attachment_history"`);
	}
}
