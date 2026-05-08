import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Añade floorLabels (TEXT JSON) a House para permitir nombres configurables
 * de pisos por casa (ej. {"1":"Planta Baja","2":"Planta Alta"}).
 *
 * El campo `bed.floor` y `retreat_bed.floor` siguen siendo INTEGER — solo el
 * display cambia. Si una casa no define labels, el frontend cae al fallback
 * "Piso N".
 *
 * Seed inicial: todas las casas existentes están en México, así que se pre-pobla
 * con la convención mexicana — para cada casa, mapeamos los pisos efectivamente
 * presentes en sus camas: 1 → "Planta Baja", 2 → "Planta Alta". Pisos 3+
 * quedan sin etiqueta (caen al fallback "Piso N").
 *
 * Solo ADD COLUMN + UPDATE → sin recreate-table, sin transaction=false.
 */
export class AddFloorLabelsToHouse20260508153000 implements MigrationInterface {
	name = 'AddFloorLabelsToHouse20260508153000';
	timestamp = '20260508153000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`ALTER TABLE "house" ADD COLUMN "floorLabels" TEXT`);

		const houses: { id: string }[] = await queryRunner.query(`SELECT id FROM "house"`);
		for (const { id } of houses) {
			const floors: { floor: number | null }[] = await queryRunner.query(
				`SELECT DISTINCT floor FROM "bed" WHERE houseId = ? AND floor IS NOT NULL`,
				[id],
			);
			const labels: Record<string, string> = {};
			for (const { floor } of floors) {
				if (floor === 1) labels['1'] = 'Planta Baja';
				else if (floor === 2) labels['2'] = 'Planta Alta';
			}
			if (Object.keys(labels).length === 0) {
				labels['1'] = 'Planta Baja';
				labels['2'] = 'Planta Alta';
			}
			await queryRunner.query(`UPDATE "house" SET floorLabels = ? WHERE id = ?`, [
				JSON.stringify(labels),
				id,
			]);
		}
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`ALTER TABLE "house" DROP COLUMN "floorLabels"`);
	}
}
