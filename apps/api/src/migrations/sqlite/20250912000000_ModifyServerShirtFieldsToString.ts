import { MigrationInterface, QueryRunner } from 'typeorm';

export class ModifyServerShirtFieldsToString20250912000000 implements MigrationInterface {
	name = 'ModifyServerShirtFieldsToString';
	timestamp = '20250912000000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		// Check if columns exist and determine current type
		const tableInfo = await queryRunner.query(`PRAGMA table_info(participants)`);

		const needsWhiteShirtColumn = tableInfo.find((col: any) => col.name === 'needsWhiteShirt');
		const needsBlueShirtColumn = tableInfo.find((col: any) => col.name === 'needsBlueShirt');
		const needsJacketColumn = tableInfo.find((col: any) => col.name === 'needsJacket');

		// For SQLite, we need to:
		// 1. Create new columns with the correct type
		// 2. Copy data from old columns to new columns
		// 3. Drop old columns
		// 4. Rename new columns to old column names

		if (needsWhiteShirtColumn) {
			await queryRunner.query(`
				ALTER TABLE participants ADD COLUMN needsWhiteShirt_new VARCHAR(10) NULL
			`);

			// Convert boolean values to size strings
			await queryRunner.query(`
				UPDATE participants SET needsWhiteShirt_new = 
					CASE 
						WHEN needsWhiteShirt = 1 THEN 'M'
						ELSE NULL
					END
			`);

			await queryRunner.query(`
				ALTER TABLE participants DROP COLUMN needsWhiteShirt
			`);

			await queryRunner.query(`
				ALTER TABLE participants RENAME COLUMN needsWhiteShirt_new TO needsWhiteShirt
			`);
		}

		if (needsBlueShirtColumn) {
			await queryRunner.query(`
				ALTER TABLE participants ADD COLUMN needsBlueShirt_new VARCHAR(10) NULL
			`);

			// Convert boolean values to size strings
			await queryRunner.query(`
				UPDATE participants SET needsBlueShirt_new = 
					CASE 
						WHEN needsBlueShirt = 1 THEN 'M'
						ELSE NULL
					END
			`);

			await queryRunner.query(`
				ALTER TABLE participants DROP COLUMN needsBlueShirt
			`);

			await queryRunner.query(`
				ALTER TABLE participants RENAME COLUMN needsBlueShirt_new TO needsBlueShirt
			`);
		}

		if (needsJacketColumn) {
			await queryRunner.query(`
				ALTER TABLE participants ADD COLUMN needsJacket_new VARCHAR(10) NULL
			`);

			// Convert boolean values to size strings
			await queryRunner.query(`
				UPDATE participants SET needsJacket_new = 
					CASE 
						WHEN needsJacket = 1 THEN 'M'
						ELSE NULL
					END
			`);

			await queryRunner.query(`
				ALTER TABLE participants DROP COLUMN needsJacket
			`);

			await queryRunner.query(`
				ALTER TABLE participants RENAME COLUMN needsJacket_new TO needsJacket
			`);
		}
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		// Revert the changes - convert back to boolean
		const tableInfo = await queryRunner.query(`PRAGMA table_info(participants)`);

		const needsWhiteShirtColumn = tableInfo.find((col: any) => col.name === 'needsWhiteShirt');
		const needsBlueShirtColumn = tableInfo.find((col: any) => col.name === 'needsBlueShirt');
		const needsJacketColumn = tableInfo.find((col: any) => col.name === 'needsJacket');

		if (needsWhiteShirtColumn) {
			await queryRunner.query(`
				ALTER TABLE participants ADD COLUMN needsWhiteShirt_new BOOLEAN
			`);

			// Convert size strings back to boolean
			await queryRunner.query(`
				UPDATE participants SET needsWhiteShirt_new = 
					CASE 
						WHEN needsWhiteShirt IN ('S', 'M', 'G', 'X', '2') THEN 1
						ELSE 0
					END
			`);

			await queryRunner.query(`
				ALTER TABLE participants DROP COLUMN needsWhiteShirt
			`);

			await queryRunner.query(`
				ALTER TABLE participants RENAME COLUMN needsWhiteShirt_new TO needsWhiteShirt
			`);
		}

		if (needsBlueShirtColumn) {
			await queryRunner.query(`
				ALTER TABLE participants ADD COLUMN needsBlueShirt_new BOOLEAN
			`);

			// Convert size strings back to boolean
			await queryRunner.query(`
				UPDATE participants SET needsBlueShirt_new = 
					CASE 
						WHEN needsBlueShirt IN ('S', 'M', 'G', 'X', '2') THEN 1
						ELSE 0
					END
			`);

			await queryRunner.query(`
				ALTER TABLE participants DROP COLUMN needsBlueShirt
			`);

			await queryRunner.query(`
				ALTER TABLE participants RENAME COLUMN needsBlueShirt_new TO needsBlueShirt
			`);
		}

		if (needsJacketColumn) {
			await queryRunner.query(`
				ALTER TABLE participants ADD COLUMN needsJacket_new BOOLEAN
			`);

			// Convert size strings back to boolean
			await queryRunner.query(`
				UPDATE participants SET needsJacket_new = 
					CASE 
						WHEN needsJacket IN ('S', 'M', 'G', 'X', '2') THEN 1
						ELSE 0
					END
			`);

			await queryRunner.query(`
				ALTER TABLE participants DROP COLUMN needsJacket
			`);

			await queryRunner.query(`
				ALTER TABLE participants RENAME COLUMN needsJacket_new TO needsJacket
			`);
		}
	}
}
