import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Descarte de falsos positivos del detector de duplicados: el owner marca un
 * par como "no son la misma persona" y deja de salir en el listado, el badge y
 * el hint de attendance stats (spec community-duplicate-resolution, M3).
 *
 * El par va canónico en dos columnas (A < B) y no como una firma string: así
 * las FKs a participants son reales y el UNIQUE sirve para buscar por
 * participante cuando alguien reaparece en otro cruce.
 *
 * Ojo con los nombres de tabla del repo: `participants` y `users` en plural,
 * `community` en singular. Los tests usan `synchronize` y no detectan una FK
 * colgada.
 */
export class CreateCommunityDuplicateDismissal20261009094500 implements MigrationInterface {
	name = 'CreateCommunityDuplicateDismissal20261009094500';
	// El down() hace DROP TABLE — el guard sqliteSafePattern lo exige.
	transaction = false as const;

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`
			CREATE TABLE IF NOT EXISTS "community_duplicate_dismissal" (
				"id" varchar PRIMARY KEY NOT NULL,
				"communityId" varchar NOT NULL,
				"participantAId" varchar NOT NULL,
				"participantBId" varchar NOT NULL,
				"dismissedBy" varchar,
				"createdAt" datetime NOT NULL DEFAULT (datetime('now')),
				CONSTRAINT "FK_dup_dismissal_community" FOREIGN KEY ("communityId")
					REFERENCES "community" ("id") ON DELETE CASCADE,
				CONSTRAINT "FK_dup_dismissal_participant_a" FOREIGN KEY ("participantAId")
					REFERENCES "participants" ("id") ON DELETE CASCADE,
				CONSTRAINT "FK_dup_dismissal_participant_b" FOREIGN KEY ("participantBId")
					REFERENCES "participants" ("id") ON DELETE CASCADE,
				CONSTRAINT "FK_dup_dismissal_user" FOREIGN KEY ("dismissedBy")
					REFERENCES "users" ("id") ON DELETE SET NULL,
				CONSTRAINT "CK_dup_dismissal_canonical_pair" CHECK ("participantAId" < "participantBId")
			)
		`);
		// Un descarte por (comunidad, par). Leer antes de insertar no basta con
		// un doble clic o dos pestañas — mismo caso que
		// UQ_participant_notes_palanca_milestone.
		await queryRunner.query(`
			CREATE UNIQUE INDEX IF NOT EXISTS "UQ_dup_dismissal_pair"
				ON "community_duplicate_dismissal" ("communityId", "participantAId", "participantBId")
		`);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`DROP INDEX IF EXISTS "UQ_dup_dismissal_pair"`);
		await queryRunner.query(`DROP TABLE IF EXISTS "community_duplicate_dismissal"`);
	}
}
