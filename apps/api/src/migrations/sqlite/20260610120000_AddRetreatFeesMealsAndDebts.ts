import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Cobros por tipo de participante, comidas y deudas manuales (paz y salvo v2).
 *
 * - retreat.serverFeeAmount: cobro del retiro para servidores. El cobro del
 *   caminante es el campo `cost` existente del retiro (no se agrega columna).
 * - retreat.mealCost: valor de UNA comida.
 * - retreat_participants.mealCount: nº de comidas que toma un angelito (partial_server).
 * - retreat_participants.takesFridayMeal: si un servidor toma la comida del viernes.
 * - participant_debts: deudas manuales (espejo de `payments`) para servidores/angelitos.
 *
 * Todas las columnas nuevas son nullable y la tabla nueva no tiene hijas → `ADD COLUMN`
 * + `CREATE TABLE` son seguros (sin recreate-table, sin transaction=false).
 * SQL plano, sin imports del workspace (regla: las migraciones de prod no deben
 * encadenar `@repo/types` ni paquetes con `main` `.ts`).
 */
export class AddRetreatFeesMealsAndDebts20260610120000 implements MigrationInterface {
	name = 'AddRetreatFeesMealsAndDebts20260610120000';
	timestamp = '20260610120000';

	// El guard `sqliteSafePattern.simple.test.ts` exige `transaction = false` para
	// cualquier migración con `DROP TABLE` (incluido el de down()) — ver skill
	// sqlite-migrations. up() solo hace ADD COLUMN + CREATE TABLE (seguro).
	transaction = false;

	public async up(queryRunner: QueryRunner): Promise<void> {
		// --- Config del retiro (el cobro del caminante es el campo `cost` existente) ---
		await queryRunner.query(`ALTER TABLE "retreat" ADD COLUMN "serverFeeAmount" decimal(10,2)`);
		await queryRunner.query(`ALTER TABLE "retreat" ADD COLUMN "mealCost" decimal(10,2)`);

		// --- Selecciones de comida per-retiro ---
		await queryRunner.query(
			`ALTER TABLE "retreat_participants" ADD COLUMN "mealCount" integer`,
		);
		await queryRunner.query(
			`ALTER TABLE "retreat_participants" ADD COLUMN "takesFridayMeal" boolean`,
		);

		// --- Deudas manuales (espejo de payments) ---
		await queryRunner.query(`
			CREATE TABLE "participant_debts" (
				"id" varchar PRIMARY KEY NOT NULL,
				"participantId" varchar NOT NULL,
				"retreatId" varchar NOT NULL,
				"amount" decimal(10,2) NOT NULL,
				"description" varchar,
				"recordedBy" varchar,
				"createdAt" datetime NOT NULL DEFAULT (datetime('now')),
				"updatedAt" datetime NOT NULL DEFAULT (datetime('now')),
				CONSTRAINT "FK_participant_debts_participant" FOREIGN KEY ("participantId") REFERENCES "participants" ("id") ON DELETE CASCADE,
				CONSTRAINT "FK_participant_debts_retreat" FOREIGN KEY ("retreatId") REFERENCES "retreat" ("id") ON DELETE CASCADE,
				CONSTRAINT "FK_participant_debts_user" FOREIGN KEY ("recordedBy") REFERENCES "users" ("id") ON DELETE SET NULL
			)
		`);
		await queryRunner.query(
			`CREATE INDEX "IDX_participant_debts_participant" ON "participant_debts" ("participantId")`,
		);
		await queryRunner.query(
			`CREATE INDEX "IDX_participant_debts_retreat" ON "participant_debts" ("retreatId")`,
		);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`DROP INDEX IF EXISTS "IDX_participant_debts_retreat"`);
		await queryRunner.query(`DROP INDEX IF EXISTS "IDX_participant_debts_participant"`);
		await queryRunner.query(`DROP TABLE IF EXISTS "participant_debts"`);
		await queryRunner.query(`ALTER TABLE "retreat_participants" DROP COLUMN "takesFridayMeal"`);
		await queryRunner.query(`ALTER TABLE "retreat_participants" DROP COLUMN "mealCount"`);
		await queryRunner.query(`ALTER TABLE "retreat" DROP COLUMN "mealCost"`);
		await queryRunner.query(`ALTER TABLE "retreat" DROP COLUMN "serverFeeAmount"`);
	}
}
