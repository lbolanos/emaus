import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Foto del rostro de cada miembro de comunidad, para reconocer a la gente en
 * las reuniones.
 *
 *  - `photoUrl`   — URL del objeto en S3 (prefijo privado `community-members/`)
 *                   o data-URI base64 cuando el almacenamiento es local (dev).
 *  - `photoS3Key` — key del objeto, necesaria para borrarlo. NULL en base64.
 *
 * Mismo par de columnas que `community_meeting`, que ya resuelve este problema
 * para la foto de una reunión.
 *
 * Solo ADD COLUMN: sin recreate-table, sin DROP, sin PRAGMA. Idempotente.
 */
export class AddCommunityMemberPhoto20260831140000 implements MigrationInterface {
	name = 'AddCommunityMemberPhoto20260831140000';
	timestamp = '20260831140000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		const columns = await queryRunner.query(`PRAGMA table_info("community_member")`);
		const has = (name: string) => columns.some((c: { name: string }) => c.name === name);

		if (!has('photoUrl')) {
			await queryRunner.query(`ALTER TABLE "community_member" ADD COLUMN "photoUrl" TEXT`);
		}
		if (!has('photoS3Key')) {
			await queryRunner.query(
				`ALTER TABLE "community_member" ADD COLUMN "photoS3Key" VARCHAR(255)`,
			);
		}
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		// SQLite >= 3.35 soporta DROP COLUMN nativo; no hace falta recreate.
		// Los objetos en S3 no se tocan aquí: revertir el esquema no es una
		// solicitud de borrado de datos personales.
		await queryRunner.query(`ALTER TABLE "community_member" DROP COLUMN "photoS3Key"`);
		await queryRunner.query(`ALTER TABLE "community_member" DROP COLUMN "photoUrl"`);
	}
}
