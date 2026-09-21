import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Opacidad del recuadro central (glass card) del flyer de reunión, por comunidad.
 * 0.3–1.0 según mueva el coordinador; NULL → cada estilo usa su default (~0.8).
 */
export class AddCommunityFlyerCardOpacity20260921120000 implements MigrationInterface {
	name = 'AddCommunityFlyerCardOpacity20260921120000';
	timestamp = '20260921120000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		// Idempotente a propósito: el API de dev auto-aplica migraciones pendientes
		// en cada restart de nodemon, así que un reintento tras un guardado a medias
		// no debe morir con "duplicate column name".
		const columns: { name: string }[] = await queryRunner.query(
			`PRAGMA table_info("community")`,
		);
		if (!columns.some((c) => c.name === 'flyerCardOpacity')) {
			await queryRunner.query(`ALTER TABLE "community" ADD COLUMN "flyerCardOpacity" float`);
		}
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`ALTER TABLE "community" DROP COLUMN "flyerCardOpacity"`);
	}
}
