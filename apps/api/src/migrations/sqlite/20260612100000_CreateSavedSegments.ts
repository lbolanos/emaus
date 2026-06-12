import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Crea la tabla `saved_segments`: combinaciones de filtros con nombre,
 * reutilizables para enviar mensajes (cola WhatsApp / bulk email) o como
 * audiencia de una secuencia. Tabla nueva sin FKs entrantes → CREATE TABLE
 * simple (los FK salientes a retreat/community/users no requieren recreate).
 */
export class CreateSavedSegments20260612100000 implements MigrationInterface {
	name = 'CreateSavedSegments20260612100000';
	timestamp = '20260612100000';
	// El down() hace DROP TABLE; el guard sqliteSafePattern exige este flag.
	// (Tabla nueva sin FKs entrantes; el runner custom además ignora el flag.)
	transaction = false as const;

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`
			CREATE TABLE IF NOT EXISTS "saved_segments" (
				"id" varchar PRIMARY KEY NOT NULL,
				"name" varchar(150) NOT NULL,
				"scope" varchar(20) NOT NULL,
				"retreatId" varchar,
				"communityId" varchar,
				"filters" text NOT NULL,
				"createdBy" varchar,
				"createdAt" datetime NOT NULL DEFAULT (datetime('now')),
				"updatedAt" datetime NOT NULL DEFAULT (datetime('now')),
				CONSTRAINT "FK_saved_segments_retreat" FOREIGN KEY ("retreatId") REFERENCES "retreat" ("id") ON DELETE CASCADE,
				CONSTRAINT "FK_saved_segments_community" FOREIGN KEY ("communityId") REFERENCES "community" ("id") ON DELETE CASCADE,
				CONSTRAINT "FK_saved_segments_user" FOREIGN KEY ("createdBy") REFERENCES "users" ("id") ON DELETE SET NULL
			)
		`);
		await queryRunner.query(
			`CREATE INDEX IF NOT EXISTS "IDX_saved_segments_retreat" ON "saved_segments" ("retreatId")`,
		);
		await queryRunner.query(
			`CREATE INDEX IF NOT EXISTS "IDX_saved_segments_community" ON "saved_segments" ("communityId")`,
		);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`DROP INDEX IF EXISTS "IDX_saved_segments_community"`);
		await queryRunner.query(`DROP INDEX IF EXISTS "IDX_saved_segments_retreat"`);
		await queryRunner.query(`DROP TABLE IF EXISTS "saved_segments"`);
	}
}
