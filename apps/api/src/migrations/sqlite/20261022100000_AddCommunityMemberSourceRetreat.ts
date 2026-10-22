import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Retiro del que se importó cada miembro de comunidad, para mostrarlo al tomar
 * asistencia y ubicar a la persona ("viene del retiro de octubre").
 *
 *  - `sourceRetreatId` — lo llena "Importar desde retiro" a partir de ahora.
 *    NULL en altas manuales, por Excel o por el bot.
 *
 * Sin FOREIGN KEY a propósito: borrar un retiro no debe tocar a la comunidad, y
 * la lectura ya tolera un id que dejó de existir (el retiro no aparece). Además
 * SQLite no deja hacer DROP COLUMN de una columna con REFERENCES, y el down()
 * quedaría en recreate-table.
 *
 * Relleno de los miembros que ya existían: el import nunca guardó el retiro, así
 * que se aproxima con el retiro principal de la ficha (`participants.retreatId`).
 * Para quien estuvo en varios retiros puede no ser el del import; se aceptó así
 * (2026-10-22). Los creados a mano tienen `retreatId` NULL y quedan sin retiro.
 *
 * Solo ADD COLUMN + UPDATE: sin recreate-table, sin DROP, sin PRAGMA. Idempotente.
 */
export class AddCommunityMemberSourceRetreat20261022100000 implements MigrationInterface {
	name = 'AddCommunityMemberSourceRetreat20261022100000';
	timestamp = '20261022100000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		const columns = await queryRunner.query(`PRAGMA table_info("community_member")`);
		if (!columns.some((c: { name: string }) => c.name === 'sourceRetreatId')) {
			await queryRunner.query(
				`ALTER TABLE "community_member" ADD COLUMN "sourceRetreatId" VARCHAR(36)`,
			);
		}

		await queryRunner.query(`
			UPDATE "community_member"
			SET "sourceRetreatId" = (
				SELECT p."retreatId"
				FROM "participants" p
				JOIN "retreat" r ON r."id" = p."retreatId"
				WHERE p."id" = "community_member"."participantId"
			)
			WHERE "sourceRetreatId" IS NULL
		`);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`ALTER TABLE "community_member" DROP COLUMN "sourceRetreatId"`);
	}
}
