import { MigrationInterface, QueryRunner } from 'typeorm';

export class RenameTableNamesToSpanish20260415130000 implements MigrationInterface {
	name = 'RenameTableNamesToSpanish20260415130000';
	timestamp = '20260415130000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`
			UPDATE "tables"
			SET "name" = 'Mesa ' || SUBSTR("name", 7)
			WHERE "name" LIKE 'Table %'
		`);
		console.log('Renamed Table N → Mesa N in tables');
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`
			UPDATE "tables"
			SET "name" = 'Table ' || SUBSTR("name", 6)
			WHERE "name" LIKE 'Mesa %'
		`);
		console.log('Reverted Mesa N → Table N in tables');
	}
}
