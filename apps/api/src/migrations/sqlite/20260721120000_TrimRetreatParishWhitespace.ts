import { MigrationInterface, QueryRunner } from 'typeorm';

export class TrimRetreatParishWhitespace20260721120000 implements MigrationInterface {
	name = 'TrimRetreatParishWhitespace20260721120000';
	timestamp = '20260721120000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		// Limpia espacios al borde en nombres de retiro ya guardados (p. ej.
		// "… | Mexico City "). Esos espacios rompían la confirmación por nombre del
		// borrado y confundían al deduplicar. De aquí en más el schema (.trim()) los
		// evita en cada create/update.
		await queryRunner.query(
			`UPDATE "retreat" SET "parish" = TRIM("parish") WHERE "parish" <> TRIM("parish")`,
		);
		console.log('Trimmed leading/trailing whitespace from retreat.parish');
	}

	public async down(_queryRunner: QueryRunner): Promise<void> {
		// No-op: re-agregar los espacios no tiene sentido ni es recuperable.
		console.log('Down no-op: whitespace trim on retreat.parish is not reversible');
	}
}
