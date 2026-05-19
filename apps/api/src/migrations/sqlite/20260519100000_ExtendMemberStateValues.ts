import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Agrega 5 nuevos valores válidos al CHECK constraint de `community_member.state`:
 *   - `wrong_contact_info` — correo/teléfono inválido
 *   - `no_time` — no tiene tiempo, declinación blanda
 *   - `paused` — pausa temporal (viaje, enfermedad, luto)
 *   - `not_interested` — no le interesa, definitivo
 *   - `do_not_contact` — lista negra explícita
 *
 * SQLite no permite ALTER del CHECK directamente → recreate-table.
 *
 * CRITICAL — `transaction = false` y `PRAGMA foreign_keys = OFF`:
 *   `community_attendance.memberId` apunta a `community_member.id` con
 *   `ON DELETE CASCADE`. Dentro de una transacción TypeORM, el
 *   `PRAGMA foreign_keys = OFF` es ignorado por SQLite y el `DROP TABLE`
 *   intermedio dispararía la cascade, borrando TODAS las asistencias.
 *   Por eso esta migration corre sin transacción (atomic = false) y desactiva
 *   las FK keys manualmente. Incidente histórico 2026-05-07: una migration
 *   similar perdió 66 community_member + 8 community_meeting silenciosamente.
 *
 * Captura el schema completo de community_member en este punto (incluye
 * columnas agregadas después: audit fields y overlay per-community). Si en
 * el futuro se agregan más columnas, esta lista debe extenderse antes de
 * correr una migration de tipo recreate-table sobre community_member.
 */
export class ExtendMemberStateValues20260519100000 implements MigrationInterface {
	name = 'ExtendMemberStateValues';
	timestamp = '20260519100000';
	transaction = false as const;

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`PRAGMA foreign_keys = OFF`);

		try {
			await queryRunner.query(`
				CREATE TABLE "community_member_new" (
					"id" VARCHAR(36) PRIMARY KEY NOT NULL,
					"communityId" VARCHAR(36) NOT NULL,
					"participantId" VARCHAR(36) NOT NULL,
					"state" VARCHAR(255) NOT NULL DEFAULT 'active_member' CHECK ("state" IN (
						'far_from_location',
						'no_answer',
						'another_group',
						'active_member',
						'pending_verification',
						'wrong_contact_info',
						'no_time',
						'paused',
						'not_interested',
						'do_not_contact'
					)),
					"joinedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
					"updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
					"notes" TEXT,
					"verifiedBy" varchar(36),
					"verifiedAt" datetime,
					"previousState" varchar(50),
					"firstName" varchar(100),
					"lastName" varchar(100),
					"email" varchar(254),
					"cellPhone" varchar(30),
					FOREIGN KEY ("communityId") REFERENCES "community" ("id") ON DELETE CASCADE,
					FOREIGN KEY ("participantId") REFERENCES "participants" ("id") ON DELETE CASCADE,
					UNIQUE("communityId", "participantId")
				)
			`);

			await queryRunner.query(`
				INSERT INTO "community_member_new" (
					"id", "communityId", "participantId", "state", "joinedAt", "updatedAt", "notes",
					"verifiedBy", "verifiedAt", "previousState",
					"firstName", "lastName", "email", "cellPhone"
				)
				SELECT
					"id", "communityId", "participantId", "state", "joinedAt", "updatedAt", "notes",
					"verifiedBy", "verifiedAt", "previousState",
					"firstName", "lastName", "email", "cellPhone"
				FROM "community_member"
			`);

			// Safety check: confirmar que todas las filas se copiaron antes de DROP.
			const oldCountRow: { c: number }[] = await queryRunner.query(
				`SELECT COUNT(*) as c FROM "community_member"`,
			);
			const newCountRow: { c: number }[] = await queryRunner.query(
				`SELECT COUNT(*) as c FROM "community_member_new"`,
			);
			const oldCount = Number(oldCountRow?.[0]?.c ?? 0);
			const newCount = Number(newCountRow?.[0]?.c ?? 0);
			if (oldCount !== newCount) {
				throw new Error(
					`[ExtendMemberStateValues] row count mismatch: old=${oldCount} new=${newCount}. Aborting before DROP.`,
				);
			}

			await queryRunner.query(`DROP TABLE "community_member"`);
			await queryRunner.query(`ALTER TABLE "community_member_new" RENAME TO "community_member"`);

			// Recrear los 3 índices (los 2 ordinarios + el parcial unique del overlay).
			await queryRunner.query(
				`CREATE INDEX "idx_community_member_community" ON "community_member" ("communityId")`,
			);
			await queryRunner.query(
				`CREATE INDEX "idx_community_member_participant" ON "community_member" ("participantId")`,
			);
			await queryRunner.query(
				`CREATE UNIQUE INDEX "uq_community_member_overlay_email"
				 ON "community_member" ("communityId", LOWER("email"))
				 WHERE "email" IS NOT NULL`,
			);
		} finally {
			await queryRunner.query(`PRAGMA foreign_keys = ON`);
		}
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`PRAGMA foreign_keys = OFF`);
		try {
			// Revertir al CHECK anterior. Filas con los nuevos estados deben
			// convertirse a algo válido — usamos `no_answer` como fallback
			// porque es el más cercano a "no podemos contactarlo" sin perder
			// la fila. El admin puede re-clasificarlas después de re-aplicar
			// la migration up.
			await queryRunner.query(`
				CREATE TABLE "community_member_new" (
					"id" VARCHAR(36) PRIMARY KEY NOT NULL,
					"communityId" VARCHAR(36) NOT NULL,
					"participantId" VARCHAR(36) NOT NULL,
					"state" VARCHAR(255) NOT NULL DEFAULT 'active_member' CHECK ("state" IN (
						'far_from_location', 'no_answer', 'another_group', 'active_member', 'pending_verification'
					)),
					"joinedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
					"updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
					"notes" TEXT,
					"verifiedBy" varchar(36),
					"verifiedAt" datetime,
					"previousState" varchar(50),
					"firstName" varchar(100),
					"lastName" varchar(100),
					"email" varchar(254),
					"cellPhone" varchar(30),
					FOREIGN KEY ("communityId") REFERENCES "community" ("id") ON DELETE CASCADE,
					FOREIGN KEY ("participantId") REFERENCES "participants" ("id") ON DELETE CASCADE,
					UNIQUE("communityId", "participantId")
				)
			`);

			await queryRunner.query(`
				INSERT INTO "community_member_new" (
					"id", "communityId", "participantId", "state", "joinedAt", "updatedAt", "notes",
					"verifiedBy", "verifiedAt", "previousState",
					"firstName", "lastName", "email", "cellPhone"
				)
				SELECT
					"id", "communityId", "participantId",
					CASE
						WHEN "state" IN ('wrong_contact_info', 'no_time', 'paused', 'not_interested', 'do_not_contact') THEN 'no_answer'
						ELSE "state"
					END,
					"joinedAt", "updatedAt", "notes",
					"verifiedBy", "verifiedAt", "previousState",
					"firstName", "lastName", "email", "cellPhone"
				FROM "community_member"
			`);

			await queryRunner.query(`DROP TABLE "community_member"`);
			await queryRunner.query(`ALTER TABLE "community_member_new" RENAME TO "community_member"`);
			await queryRunner.query(
				`CREATE INDEX "idx_community_member_community" ON "community_member" ("communityId")`,
			);
			await queryRunner.query(
				`CREATE INDEX "idx_community_member_participant" ON "community_member" ("participantId")`,
			);
			await queryRunner.query(
				`CREATE UNIQUE INDEX "uq_community_member_overlay_email"
				 ON "community_member" ("communityId", LOWER("email"))
				 WHERE "email" IS NOT NULL`,
			);
		} finally {
			await queryRunner.query(`PRAGMA foreign_keys = ON`);
		}
	}
}
