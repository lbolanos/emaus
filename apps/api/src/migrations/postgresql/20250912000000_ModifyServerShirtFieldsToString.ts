import { MigrationInterface, QueryRunner } from 'typeorm';

export class ModifyServerShirtFieldsToString20250912000000 implements MigrationInterface {
	name = 'ModifyServerShirtFieldsToString';
	timestamp = '20250912000000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		// Check if columns exist and determine current type
		const columnsExist = await queryRunner.query(`
			SELECT column_name, data_type 
			FROM information_schema.columns 
			WHERE table_name = 'participants' 
			AND column_name IN ('needsWhiteShirt', 'needsBlueShirt', 'needsJacket')
		`);

		const columnMap = new Map(columnsExist.map((col: any) => [col.column_name, col.data_type]));

		// PostgreSQL can directly alter column types
		if (columnMap.has('needsWhiteShirt')) {
			const currentType = columnMap.get('needsWhiteShirt');
			if (currentType === 'boolean') {
				// Convert boolean to VARCHAR(10), converting true to 'M', false to NULL
				await queryRunner.query(`
					ALTER TABLE participants 
					ALTER COLUMN needsWhiteShirt TYPE VARCHAR(10),
					ALTER COLUMN needsWhiteShirt DROP NOT NULL,
					ALTER COLUMN needsWhiteShirt SET DEFAULT NULL
				`);

				// Convert existing boolean values to size strings
				await queryRunner.query(`
					UPDATE participants 
					SET needsWhiteShirt = CASE 
						WHEN needsWhiteShirt = true THEN 'M'
						ELSE NULL
					END
					WHERE needsWhiteShirt IS NOT NULL
				`);
			}
		}

		if (columnMap.has('needsBlueShirt')) {
			const currentType = columnMap.get('needsBlueShirt');
			if (currentType === 'boolean') {
				await queryRunner.query(`
					ALTER TABLE participants 
					ALTER COLUMN needsBlueShirt TYPE VARCHAR(10),
					ALTER COLUMN needsBlueShirt DROP NOT NULL,
					ALTER COLUMN needsBlueShirt SET DEFAULT NULL
				`);

				await queryRunner.query(`
					UPDATE participants 
					SET needsBlueShirt = CASE 
						WHEN needsBlueShirt = true THEN 'M'
						ELSE NULL
					END
					WHERE needsBlueShirt IS NOT NULL
				`);
			}
		}

		if (columnMap.has('needsJacket')) {
			const currentType = columnMap.get('needsJacket');
			if (currentType === 'boolean') {
				await queryRunner.query(`
					ALTER TABLE participants 
					ALTER COLUMN needsJacket TYPE VARCHAR(10),
					ALTER COLUMN needsJacket DROP NOT NULL,
					ALTER COLUMN needsJacket SET DEFAULT NULL
				`);

				await queryRunner.query(`
					UPDATE participants 
					SET needsJacket = CASE 
						WHEN needsJacket = true THEN 'M'
						ELSE NULL
					END
					WHERE needsJacket IS NOT NULL
				`);
			}
		}

		// Add check constraints for valid size values
		await queryRunner.query(`
			ALTER TABLE participants 
			ADD CONSTRAINT chk_needswhiteshirt_size 
			CHECK (needsWhiteShirt IS NULL OR needsWhiteShirt IN ('S', 'M', 'G', 'X', '2', 'null'))
		`);

		await queryRunner.query(`
			ALTER TABLE participants 
			ADD CONSTRAINT chk_needsblueshirt_size 
			CHECK (needsBlueShirt IS NULL OR needsBlueShirt IN ('S', 'M', 'G', 'X', '2', 'null'))
		`);

		await queryRunner.query(`
			ALTER TABLE participants 
			ADD CONSTRAINT chk_needsjacket_size 
			CHECK (needsJacket IS NULL OR needsJacket IN ('S', 'M', 'G', 'X', '2', 'null'))
		`);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		// Drop check constraints
		await queryRunner.query(`
			ALTER TABLE participants 
			DROP CONSTRAINT IF EXISTS chk_needswhiteshirt_size
		`);

		await queryRunner.query(`
			ALTER TABLE participants 
			DROP CONSTRAINT IF EXISTS chk_needsblueshirt_size
		`);

		await queryRunner.query(`
			ALTER TABLE participants 
			DROP CONSTRAINT IF EXISTS chk_needsjacket_size
		`);

		// Check if columns exist
		const columnsExist = await queryRunner.query(`
			SELECT column_name, data_type 
			FROM information_schema.columns 
			WHERE table_name = 'participants' 
			AND column_name IN ('needsWhiteShirt', 'needsBlueShirt', 'needsJacket')
		`);

		const columnMap = new Map(columnsExist.map((col: any) => [col.column_name, col.data_type]));

		// Convert back to boolean
		if (columnMap.has('needsWhiteShirt')) {
			const currentType = columnMap.get('needsWhiteShirt');
			if (currentType === 'character varying') {
				await queryRunner.query(`
					ALTER TABLE participants 
					ALTER COLUMN needsWhiteShirt TYPE BOOLEAN USING 
						CASE 
							WHEN needsWhiteShirt IN ('S', 'M', 'G', 'X', '2') THEN true
							ELSE false
						END
				`);
			}
		}

		if (columnMap.has('needsBlueShirt')) {
			const currentType = columnMap.get('needsBlueShirt');
			if (currentType === 'character varying') {
				await queryRunner.query(`
					ALTER TABLE participants 
					ALTER COLUMN needsBlueShirt TYPE BOOLEAN USING 
						CASE 
							WHEN needsBlueShirt IN ('S', 'M', 'G', 'X', '2') THEN true
							ELSE false
						END
				`);
			}
		}

		if (columnMap.has('needsJacket')) {
			const currentType = columnMap.get('needsJacket');
			if (currentType === 'character varying') {
				await queryRunner.query(`
					ALTER TABLE participants 
					ALTER COLUMN needsJacket TYPE BOOLEAN USING 
						CASE 
							WHEN needsJacket IN ('S', 'M', 'G', 'X', '2') THEN true
							ELSE false
						END
				`);
			}
		}
	}
}
