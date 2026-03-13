import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSlugToRetreat20260313120000 implements MigrationInterface {
	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			`ALTER TABLE retreat ADD COLUMN "slug" varchar`,
		);

		// Populate slugs for existing retreats from parish + retreat_number_version
		const retreats = await queryRunner.query(
			`SELECT id, parish, retreat_number_version FROM retreat`,
		);

		for (const retreat of retreats) {
			if (retreat.parish) {
				const base = (retreat.parish + (retreat.retreat_number_version || ''))
					.normalize('NFD')
					.replace(/[\u0300-\u036f]/g, '') // remove accents
					.toLowerCase()
					.replace(/[^a-z0-9]/g, ''); // remove non-alphanumeric

				if (base) {
					// Check for duplicates and append suffix if needed
					let slug = base;
					let suffix = 2;
					let exists = await queryRunner.query(
						`SELECT id FROM retreat WHERE slug = ? AND id != ?`,
						[slug, retreat.id],
					);
					while (exists.length > 0) {
						slug = `${base}${suffix}`;
						suffix++;
						exists = await queryRunner.query(
							`SELECT id FROM retreat WHERE slug = ? AND id != ?`,
							[slug, retreat.id],
						);
					}

					await queryRunner.query(
						`UPDATE retreat SET slug = ? WHERE id = ?`,
						[slug, retreat.id],
					);
				}
			}
		}

		// Create unique index after populating
		await queryRunner.query(
			`CREATE UNIQUE INDEX "IDX_retreat_slug" ON retreat ("slug")`,
		);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		console.log('Rollback: slug column should be manually removed if needed');
	}
}
