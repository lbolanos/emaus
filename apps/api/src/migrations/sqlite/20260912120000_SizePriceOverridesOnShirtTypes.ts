import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Per-talla price overrides on top of the shirt type's base price.
 *
 * A row here means "this size costs something different than the base
 * retreat_shirt_type.price". Effective price = COALESCE(size_price,
 * type_price, 0). Only sizes that differ from the base get a row — empty
 * table is behavior-identical to before this migration (base price only).
 *
 * The charge stays computed (never frozen on participant_shirt_size): fixing
 * a price recalculates every participant's balance, which is the point.
 */
export class SizePriceOverridesOnShirtTypes20260912120000 implements MigrationInterface {
	name = 'SizePriceOverridesOnShirtTypes20260912120000';
	timestamp = '20260912120000';

	// El down() hace DROP TABLE (tabla hoja, sin FKs entrantes que cascadear)
	// y el guard sqliteSafePattern exige la declaración también ahí. Seguro:
	// up() y down() son idempotentes (IF NOT EXISTS / IF EXISTS), toleran una
	// re-corrida sin transacción envolvente.
	transaction = false as const;

	public async up(queryRunner: QueryRunner): Promise<void> {
		// Pure additive CREATE (no recreate, no DROP) → safe inside the runner's
		// transaction. IF NOT EXISTS everywhere so a half-applied retry works.
		await queryRunner.query(`
			CREATE TABLE IF NOT EXISTS "retreat_shirt_type_size_price" (
				"id" varchar PRIMARY KEY NOT NULL,
				"shirtTypeId" varchar NOT NULL,
				"size" varchar NOT NULL,
				"price" decimal(10,2) NOT NULL,
				CONSTRAINT "FK_rstsp_shirtType" FOREIGN KEY ("shirtTypeId") REFERENCES "retreat_shirt_type" ("id") ON DELETE CASCADE
			)
		`);
		await queryRunner.query(
			`CREATE UNIQUE INDEX IF NOT EXISTS "UQ_rstsp_shirtType_size" ON "retreat_shirt_type_size_price" ("shirtTypeId", "size")`,
		);
		await queryRunner.query(
			`CREATE INDEX IF NOT EXISTS "IDX_rstsp_shirtType" ON "retreat_shirt_type_size_price" ("shirtTypeId")`,
		);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`DROP INDEX IF EXISTS "UQ_rstsp_shirtType_size"`);
		await queryRunner.query(`DROP INDEX IF EXISTS "IDX_rstsp_shirtType"`);
		await queryRunner.query(`DROP TABLE IF EXISTS "retreat_shirt_type_size_price"`);
	}
}
