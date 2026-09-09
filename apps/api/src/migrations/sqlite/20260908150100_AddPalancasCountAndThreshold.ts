import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Conteo numérico de palancas (cartas) recibidas y umbral del hito por retiro.
 *
 * `palancasReceived` es TEXT y el formulario invita a mezclar número y prosa
 * ("Cantidad o descripción de palancas recibidas"), así que el repo acabó con
 * tres criterios contradictorios: `Number(raw) > 0` en EditParticipantForm,
 * "texto no vacío" en un contador del dashboard y `parseInt` (que descarta la
 * prosa) en el otro. Sin un entero no se puede preguntar "¿recibió al menos 3?".
 *
 * El backfill NO mueve ni reescribe nada: rellena el conteo sólo donde el texto
 * es un entero limpio y deja el texto intacto. Las fichas con prosa quedan con
 * conteo NULL y se capturan a mano (la UI las marca). Así el backfill no puede
 * perder información y correrlo dos veces no cambia nada.
 */
export class AddPalancasCountAndThreshold20260908150100 implements MigrationInterface {
	name = 'AddPalancasCountAndThreshold20260908150100';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			`ALTER TABLE "retreat_participants" ADD COLUMN "palancasReceivedCount" integer`,
		);
		await queryRunner.query(`ALTER TABLE "retreat" ADD COLUMN "minPalancasPerWalker" integer`);

		// Entero limpio = empieza con dígito y no contiene ningún no-dígito.
		// "3 de la mamá" NO entra a propósito: un parseInt laxo aquí es
		// exactamente cómo nace un cuarto criterio distinto.
		await queryRunner.query(`
			UPDATE "retreat_participants"
			   SET "palancasReceivedCount" = CAST(TRIM("palancasReceived") AS INTEGER)
			 WHERE "palancasReceivedCount" IS NULL
			   AND "palancasReceived" IS NOT NULL
			   AND TRIM("palancasReceived") <> ''
			   AND TRIM("palancasReceived") GLOB '[0-9]*'
			   AND TRIM("palancasReceived") NOT GLOB '*[^0-9]*'
		`);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`ALTER TABLE "retreat" DROP COLUMN "minPalancasPerWalker"`);
		await queryRunner.query(
			`ALTER TABLE "retreat_participants" DROP COLUMN "palancasReceivedCount"`,
		);
	}
}
