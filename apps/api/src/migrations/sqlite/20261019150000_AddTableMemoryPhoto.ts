import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Foto de los participantes de la mesa para el recuerdo (spec
 * specs/table-memory-photo). Patrón "una foto por entidad" de
 * community_meeting: `photoUrl` = URL de S3 (presignada al leer) o data-URI
 * en modo base64 de dev; `photoS3Key` = object key para borrar el objeto al
 * reemplazar o quitar la foto.
 *
 * ALTER TABLE ADD COLUMN puro: sin recreate, sin transaction=false.
 */
export class AddTableMemoryPhoto20261019150000 implements MigrationInterface {
	name = 'AddTableMemoryPhoto20261019150000';
	timestamp = '20261019150000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		// Idempotent on purpose: the dev API auto-runs pending migrations on
		// every nodemon restart, and the test DB `synchronize`s from the
		// entities (which already declare these columns). Without the guard a
		// re-run dies with "duplicate column name".
		const columns: { name: string }[] = await queryRunner.query(
			`PRAGMA table_info("tables")`,
		);
		if (!columns.some((c) => c.name === 'photoUrl')) {
			await queryRunner.query(`ALTER TABLE "tables" ADD COLUMN "photoUrl" varchar`);
		}
		if (!columns.some((c) => c.name === 'photoS3Key')) {
			await queryRunner.query(`ALTER TABLE "tables" ADD COLUMN "photoS3Key" varchar`);
		}
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		// SQLite >= 3.35 supports native DROP COLUMN.
		const columns: { name: string }[] = await queryRunner.query(
			`PRAGMA table_info("tables")`,
		);
		if (columns.some((c) => c.name === 'photoUrl')) {
			await queryRunner.query(`ALTER TABLE "tables" DROP COLUMN "photoUrl"`);
		}
		if (columns.some((c) => c.name === 'photoS3Key')) {
			await queryRunner.query(`ALTER TABLE "tables" DROP COLUMN "photoS3Key"`);
		}
	}
}
