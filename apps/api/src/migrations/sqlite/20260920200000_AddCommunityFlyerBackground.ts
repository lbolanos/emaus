import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Fondo personalizado del flyer de reunión, por comunidad.
 * URL pública (S3) o data-URI inline en dev; NULL → fondo por defecto (/poster.png).
 */
export class AddCommunityFlyerBackground20260920200000 implements MigrationInterface {
	name = 'AddCommunityFlyerBackground20260920200000';
	timestamp = '20260920200000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		// Idempotente a propósito: el API de dev auto-aplica migraciones pendientes
		// en cada restart de nodemon, así que un reintento tras un guardado a medias
		// no debe morir con "duplicate column name".
		const columns: { name: string }[] = await queryRunner.query(
			`PRAGMA table_info("community")`,
		);
		if (!columns.some((c) => c.name === 'flyerBackgroundUrl')) {
			await queryRunner.query(`ALTER TABLE "community" ADD COLUMN "flyerBackgroundUrl" text`);
		}
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`ALTER TABLE "community" DROP COLUMN "flyerBackgroundUrl"`);
	}
}
