import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Plantillas reutilizables de volante: una instantánea de flyer_options (distribución
 * de bloques, imágenes y textos) que se puede aplicar a otro retiro.
 *
 * `scope` lo elige quien la guarda, no se deriva del retiro: `retreat` no tiene FK a
 * `community`, así que no hay camino relacional para inferirlo.
 *
 * `transaction = false`: lo exige el guard sqliteSafePattern por el DROP TABLE del
 * down(); el up() solo hace CREATE.
 */
export class CreateFlyerTemplates20260902120000 implements MigrationInterface {
	name = 'CreateFlyerTemplates20260902120000';
	timestamp = '20260902120000';
	transaction = false;

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`
			CREATE TABLE "flyer_templates" (
				"id" varchar PRIMARY KEY NOT NULL,
				"name" varchar(255) NOT NULL,
				"scope" varchar NOT NULL DEFAULT 'personal',
				"communityId" varchar,
				"createdBy" varchar,
				"layout" text NOT NULL,
				"createdAt" datetime NOT NULL DEFAULT (datetime('now')),
				"updatedAt" datetime NOT NULL DEFAULT (datetime('now')),
				FOREIGN KEY ("communityId") REFERENCES "community" ("id") ON DELETE CASCADE,
				FOREIGN KEY ("createdBy") REFERENCES "users" ("id") ON DELETE SET NULL
			)
		`);

		// El listado filtra por comunidad (plantillas compartidas) o por autor (personales).
		await queryRunner.query(
			`CREATE INDEX "IDX_flyer_templates_community" ON "flyer_templates" ("communityId")`,
		);
		await queryRunner.query(
			`CREATE INDEX "IDX_flyer_templates_created_by" ON "flyer_templates" ("createdBy")`,
		);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`DROP INDEX IF EXISTS "IDX_flyer_templates_created_by"`);
		await queryRunner.query(`DROP INDEX IF EXISTS "IDX_flyer_templates_community"`);
		await queryRunner.query(`DROP TABLE IF EXISTS "flyer_templates"`);
	}
}
