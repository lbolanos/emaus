import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Refuerza unicidad de teléfono por comunidad a nivel BD como safety net
 * adicional a la validación en código (CommunityService.findPhoneCollision).
 *
 * Dos protecciones complementarias:
 *
 * 1) UNIQUE INDEX parcial sobre community_member.cellPhone (overlay).
 *    Bloquea que dos overlays en la misma comunidad apunten al mismo
 *    teléfono. No cubre el caso overlay-NULL + participant.cellPhone
 *    (el tel "efectivo" vive en participant); para eso el trigger.
 *
 * 2) TRIGGER BEFORE INSERT/UPDATE que valida el cellPhone efectivo
 *    (COALESCE(overlay, participant)) contra otros miembros de la misma
 *    comunidad. Normaliza últimos 10 dígitos (ignora espacios/guiones/+52).
 *
 * Es schema-only (solo CREATE INDEX/TRIGGER), no toca data ni FKs. No
 * requiere transaction=false ni el patrón recreate-table.
 *
 * IMPORTANTE: si ya hay duplicados pre-existentes en BD, los triggers
 * NO los borran ni fallan al instalarse (los triggers solo aplican a
 * INSERT/UPDATE futuros). El UNIQUE INDEX parcial sí fallaría si dos
 * overlays existen con el mismo tel — en este repo no es el caso (todos
 * los duplicados están en participant.cellPhone con overlay NULL).
 */
export class UniquePhonePerCommunity20260521170000 implements MigrationInterface {
	name = 'UniquePhonePerCommunity20260521170000';
	timestamp = '20260521170000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		// (1) UNIQUE INDEX parcial sobre overlay normalizado (últimos 10 dígitos).
		await queryRunner.query(`
			CREATE UNIQUE INDEX IF NOT EXISTS "uniq_community_member_overlay_phone"
			ON "community_member" (
				"communityId",
				substr(
					REPLACE(REPLACE(REPLACE(REPLACE(REPLACE("cellPhone", ' ', ''), '-', ''), '(', ''), ')', ''), '+', ''),
					-10
				)
			)
			WHERE "cellPhone" IS NOT NULL
			  AND length(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE("cellPhone", ' ', ''), '-', ''), '(', ''), ')', ''), '+', '')) >= 7
		`);

		// (2a) Trigger BEFORE INSERT. Si el tel efectivo del nuevo miembro
		//      coincide (últimos 10 dígitos normalizados) con cualquier otro
		//      miembro de la misma comunidad, aborta con error nombrado.
		await queryRunner.query(`
			CREATE TRIGGER IF NOT EXISTS "trg_cm_phone_uniq_insert"
			BEFORE INSERT ON "community_member"
			BEGIN
				SELECT RAISE(ABORT, 'PHONE_DUPLICATE_IN_COMMUNITY')
				WHERE EXISTS (
					SELECT 1
					FROM "community_member" cm
					LEFT JOIN "participants" p ON p.id = cm.participantId
					LEFT JOIN "participants" pNew ON pNew.id = NEW.participantId
					WHERE cm.communityId = NEW.communityId
					  AND cm.id != COALESCE(NEW.id, '')
					  AND length(COALESCE(NEW.cellPhone, pNew.cellPhone, '')) > 0
					  AND length(COALESCE(cm.cellPhone, p.cellPhone, '')) > 0
					  AND substr(
					        REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(NEW.cellPhone, pNew.cellPhone), ' ', ''), '-', ''), '(', ''), ')', ''), '+', ''),
					        -10
					      ) =
					      substr(
					        REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(cm.cellPhone, p.cellPhone), ' ', ''), '-', ''), '(', ''), ')', ''), '+', ''),
					        -10
					      )
					  AND length(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(NEW.cellPhone, pNew.cellPhone), ' ', ''), '-', ''), '(', ''), ')', ''), '+', '')) >= 7
				);
			END
		`);

		// (2b) Trigger BEFORE UPDATE. Solo dispara cuando cambia cellPhone (overlay)
		//      o participantId. Misma lógica que insert pero excluyendo el row actual.
		await queryRunner.query(`
			CREATE TRIGGER IF NOT EXISTS "trg_cm_phone_uniq_update"
			BEFORE UPDATE OF "cellPhone", "participantId" ON "community_member"
			BEGIN
				SELECT RAISE(ABORT, 'PHONE_DUPLICATE_IN_COMMUNITY')
				WHERE EXISTS (
					SELECT 1
					FROM "community_member" cm
					LEFT JOIN "participants" p ON p.id = cm.participantId
					LEFT JOIN "participants" pNew ON pNew.id = NEW.participantId
					WHERE cm.communityId = NEW.communityId
					  AND cm.id != NEW.id
					  AND length(COALESCE(NEW.cellPhone, pNew.cellPhone, '')) > 0
					  AND length(COALESCE(cm.cellPhone, p.cellPhone, '')) > 0
					  AND substr(
					        REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(NEW.cellPhone, pNew.cellPhone), ' ', ''), '-', ''), '(', ''), ')', ''), '+', ''),
					        -10
					      ) =
					      substr(
					        REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(cm.cellPhone, p.cellPhone), ' ', ''), '-', ''), '(', ''), ')', ''), '+', ''),
					        -10
					      )
					  AND length(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(NEW.cellPhone, pNew.cellPhone), ' ', ''), '-', ''), '(', ''), ')', ''), '+', '')) >= 7
				);
			END
		`);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`DROP TRIGGER IF EXISTS "trg_cm_phone_uniq_update"`);
		await queryRunner.query(`DROP TRIGGER IF EXISTS "trg_cm_phone_uniq_insert"`);
		await queryRunner.query(`DROP INDEX IF EXISTS "uniq_community_member_overlay_phone"`);
	}
}
