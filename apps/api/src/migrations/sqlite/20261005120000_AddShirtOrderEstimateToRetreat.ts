import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Estimado de caminantes que faltan por inscribirse, por prenda × talla, para que
 * el pedido de camisetas al proveedor cubra al total esperado ("hay 10 caminantes
 * pero se esperan 40"). JSON en TEXT (simple-json); NULL = sin estimado.
 */
export class AddShirtOrderEstimateToRetreat20261005120000 implements MigrationInterface {
	name = 'AddShirtOrderEstimateToRetreat20261005120000';
	timestamp = '20261005120000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		// Idempotente a propósito: el API de dev auto-aplica migraciones pendientes
		// en cada restart de nodemon, así que un reintento no debe morir con
		// "duplicate column name".
		const columns: { name: string }[] = await queryRunner.query(`PRAGMA table_info("retreat")`);
		if (!columns.some((c) => c.name === 'shirtOrderEstimate')) {
			await queryRunner.query(`ALTER TABLE "retreat" ADD COLUMN "shirtOrderEstimate" text`);
		}
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`ALTER TABLE "retreat" DROP COLUMN "shirtOrderEstimate"`);
	}
}
