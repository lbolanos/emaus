import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Resultado manual del flujo SERVER_SHIRT_CONFIRMATION (secuencia de WhatsApp
 * "Confirmación de camisetas (servidores)", migración 20260910120000): timestamp
 * cuando el coordinador marcó que el servidor confirmó su pedido de prendas
 * (tallas + cargo). NULL = sin confirmar. Per-retiro, como `bagMade`.
 *
 * Solo ADD COLUMN — no requiere el patrón recreate-table. La guarda de
 * idempotencia tolera la re-aplicación si un arranque a medias dejó la columna
 * creada sin registrar la migración.
 */
export class AddShirtOrderConfirmedAtToRetreatParticipants20260921220000
	implements MigrationInterface
{
	name = 'AddShirtOrderConfirmedAtToRetreatParticipants20260921220000';
	timestamp = '20260921220000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		const cols: Array<{ name: string }> = await queryRunner.query(
			`PRAGMA table_info("retreat_participants")`,
		);
		const colNames = new Set(cols.map((c) => c.name));

		if (!colNames.has('shirtOrderConfirmedAt')) {
			await queryRunner.query(
				`ALTER TABLE "retreat_participants" ADD COLUMN "shirtOrderConfirmedAt" datetime NULL`,
			);
		}
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			`ALTER TABLE "retreat_participants" DROP COLUMN "shirtOrderConfirmedAt"`,
		);
	}
}
