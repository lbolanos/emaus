import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * M3 (sequence-template-resolution): los pasos de secuencia referencian su
 * plantilla por id, no solo por tipo. Hasta ahora el motor resolvía la primera
 * fila de (retreatId, templateType) — con dos plantillas del mismo tipo en un
 * retiro (caso "Ultimo Prendas", 2026-10-01), la nueva era inalcanzable.
 *
 * - ADD COLUMN `sequence_steps.templateId` varchar(36) NULL (ADD COLUMN puro,
 *   sin recreate) con guard de idempotencia.
 * - Backfill determinista: cada paso vivo toma la plantilla más antigua de su
 *   tipo en el retiro (`createdAt ASC, rowid ASC`) — exactamente la que el
 *   motor venía resolviendo, así el backfill no cambia ningún envío existente.
 *   Sin plantilla del tipo en el retiro → queda NULL (el fallback por type
 *   sigue; processDue ya reporta "sin plantilla").
 * - Los pasos archivados no se backfillean: no vuelven a enrolar.
 *
 * `templateType` se conserva como clave desnormalizada (filtros de audiencia,
 * scheduled_messages y plantillas globales siguen por tipo).
 */
export class SequenceStepTemplateId20261002120000 implements MigrationInterface {
	name = 'SequenceStepTemplateId20261002120000';
	timestamp = '20261002120000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		// Guard de idempotencia: si un arranque a medias ya creó la columna, el
		// ADD COLUMN moriría con "duplicate column name" y la migración quedaría
		// atascada para siempre (regla del skill sqlite-migrations).
		const columns: { name: string }[] = await queryRunner.query(`PRAGMA table_info("sequence_steps")`);
		if (!columns.some((c) => c.name === 'templateId')) {
			await queryRunner.query(`ALTER TABLE "sequence_steps" ADD COLUMN "templateId" varchar(36)`);
		}

		// Backfill: la misma plantilla que resolvía el motor (createdAt ASC).
		await queryRunner.query(`
			UPDATE "sequence_steps" AS ss SET "templateId" = (
				SELECT mt."id" FROM "message_templates" mt
				JOIN "message_sequences" ms ON ms."id" = ss."sequenceId"
				WHERE mt."retreatId" = ms."retreatId" AND mt."type" = ss."templateType"
				ORDER BY mt."createdAt" ASC, mt."rowid" ASC LIMIT 1
			)
			WHERE ss."templateId" IS NULL AND ss."isArchived" = 0
		`);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		// El backfill no se revierte: borrar la columna devuelve el estado
		// estructural previo y el motor vuelve a resolver por tipo.
		const columns: { name: string }[] = await queryRunner.query(`PRAGMA table_info("sequence_steps")`);
		if (columns.some((c) => c.name === 'templateId')) {
			await queryRunner.query(`ALTER TABLE "sequence_steps" DROP COLUMN "templateId"`);
		}
	}
}
