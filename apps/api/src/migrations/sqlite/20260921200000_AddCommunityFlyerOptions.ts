import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Diseño del flyer de reunión "Personalizado" (bloques/tema/textos/imágenes),
 * por comunidad — todas las reuniones lo heredan. JSON en TEXT; NULL = sin diseño.
 */
export class AddCommunityFlyerOptions20260921200000 implements MigrationInterface {
	name = 'AddCommunityFlyerOptions20260921200000';
	timestamp = '20260921200000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		// Idempotente a propósito: el API de dev auto-aplica migraciones pendientes
		// en cada restart de nodemon, así que un reintento tras un guardado a medias
		// no debe morir con "duplicate column name".
		const columns: { name: string }[] = await queryRunner.query(
			`PRAGMA table_info("community")`,
		);
		if (!columns.some((c) => c.name === 'flyerOptions')) {
			await queryRunner.query(`ALTER TABLE "community" ADD COLUMN "flyerOptions" text`);
		}
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`ALTER TABLE "community" DROP COLUMN "flyerOptions"`);
	}
}
