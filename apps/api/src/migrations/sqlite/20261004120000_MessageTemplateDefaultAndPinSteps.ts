import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * M6 (sequence-template-resolution): "predeterminada" per template type, and
 * sequence steps always pinned to a template.
 *
 * - ADD COLUMN `message_templates.isDefault` boolean NOT NULL DEFAULT 0 (pure
 *   ADD COLUMN, no recreate), guarded for idempotency. At most one default
 *   per (retreat, type) — enforced by the service when one is set, not by an
 *   index (a stale second default only falls back to the oldest).
 * - Backfill: live steps still without `templateId` get pinned to the
 *   template the engine was already resolving for them (default of the type,
 *   else the oldest: `isDefault DESC, createdAt ASC, rowid ASC`), so no send
 *   changes. These are the steps seeded by `createDefaultMessageSequencesForRetreat`
 *   for retreats created after M3 (the seed did not pin) and any step created
 *   through the API without a template. No template of the type → stays NULL.
 */
export class MessageTemplateDefaultAndPinSteps20261004120000 implements MigrationInterface {
	name = 'MessageTemplateDefaultAndPinSteps20261004120000';
	timestamp = '20261004120000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		// Idempotency guard: a half-applied run (dev auto-runs migrations on
		// every nodemon restart) must not die on "duplicate column name".
		const columns: { name: string }[] = await queryRunner.query(`PRAGMA table_info("message_templates")`);
		if (!columns.some((c) => c.name === 'isDefault')) {
			await queryRunner.query(`ALTER TABLE "message_templates" ADD COLUMN "isDefault" boolean NOT NULL DEFAULT 0`);
		}

		await queryRunner.query(`
			UPDATE "sequence_steps" AS ss SET "templateId" = (
				SELECT mt."id" FROM "message_templates" mt
				JOIN "message_sequences" ms ON ms."id" = ss."sequenceId"
				WHERE mt."retreatId" = ms."retreatId" AND mt."type" = ss."templateType"
				ORDER BY mt."isDefault" DESC, mt."createdAt" ASC, mt."rowid" ASC LIMIT 1
			)
			WHERE ss."templateId" IS NULL AND ss."isArchived" = 0
		`);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		// The pinning backfill is not reverted: it only made explicit what the
		// engine already resolved. Dropping the column restores the structure.
		const columns: { name: string }[] = await queryRunner.query(`PRAGMA table_info("message_templates")`);
		if (columns.some((c) => c.name === 'isDefault')) {
			await queryRunner.query(`ALTER TABLE "message_templates" DROP COLUMN "isDefault"`);
		}
	}
}
