import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Crea la tabla `responsability_attachment`: guiones/archivos asociados a una
 * responsabilidad canónica por nombre (ej. `Comedor`, `Charlista 1`). Un mismo
 * guion sirve a múltiples templates si comparten la responsabilidad.
 *
 * Si una migración previa creó la tabla intermedia `schedule_template_attachment`
 * (esquema viejo, vinculado por scheduleTemplateId), se migran sus datos al
 * nuevo esquema vía JOIN con `schedule_template.responsabilityName` y luego se
 * borra. Los huérfanos (template item sin responsabilidad) se descartan.
 */
export class CreateResponsabilityAttachments20260503120000
	implements MigrationInterface
{
	name = 'CreateResponsabilityAttachments20260503120000';
	timestamp = '20260503120000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`
			CREATE TABLE IF NOT EXISTS "responsability_attachment" (
				"id" varchar PRIMARY KEY NOT NULL,
				"responsabilityName" varchar NOT NULL,
				"kind" varchar NOT NULL DEFAULT 'file',
				"fileName" varchar NOT NULL,
				"mimeType" varchar NOT NULL,
				"sizeBytes" integer NOT NULL,
				"storageUrl" text NOT NULL,
				"storageKey" text,
				"content" text,
				"description" text,
				"sortOrder" integer NOT NULL DEFAULT 0,
				"uploadedById" varchar,
				"createdAt" datetime NOT NULL DEFAULT (datetime('now')),
				"updatedAt" datetime NOT NULL DEFAULT (datetime('now')),
				CONSTRAINT "FK_ra_user" FOREIGN KEY ("uploadedById") REFERENCES "users" ("id") ON DELETE SET NULL
			)
		`);
		await queryRunner.query(
			`CREATE INDEX IF NOT EXISTS "IDX_ra_responsability_name" ON "responsability_attachment" ("responsabilityName")`,
		);

		// Migrar datos de la tabla intermedia legacy (si existe).
		const oldTableExists = await queryRunner.query(
			`SELECT name FROM sqlite_master WHERE type='table' AND name='schedule_template_attachment'`,
		);
		if (oldTableExists.length) {
			await queryRunner.query(`
				INSERT INTO "responsability_attachment" (
					"id", "responsabilityName", "kind", "fileName", "mimeType", "sizeBytes",
					"storageUrl", "storageKey", "content", "description", "sortOrder",
					"uploadedById", "createdAt", "updatedAt"
				)
				SELECT
					a."id",
					st."responsabilityName",
					a."kind",
					a."fileName",
					a."mimeType",
					a."sizeBytes",
					a."storageUrl",
					a."storageKey",
					a."content",
					a."description",
					a."sortOrder",
					a."uploadedById",
					a."createdAt",
					a."updatedAt"
				FROM "schedule_template_attachment" a
				INNER JOIN "schedule_template" st ON st."id" = a."scheduleTemplateId"
				WHERE st."responsabilityName" IS NOT NULL AND st."responsabilityName" <> ''
			`);

			await queryRunner.query(`DROP INDEX IF EXISTS "IDX_sta_template"`);
			await queryRunner.query(`DROP TABLE "schedule_template_attachment"`);
		}
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`DROP INDEX IF EXISTS "IDX_ra_responsability_name"`);
		await queryRunner.query(`DROP TABLE IF EXISTS "responsability_attachment"`);
	}
}
