import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Attendance statistics per meeting type.
 *
 * Coordinators need to know who actually shows up to the *preparation* meetings
 * (the server team's formation before a retreat) so they can pick table leaders
 * on evidence instead of memory. Two additions make that possible:
 *
 * 1. `community_meeting.meetingType` — the meetings already differ in practice
 *    but only by title ("Preparacion Retiro" vs. the community's regular
 *    meeting), so nothing could be filtered. `isAnnouncement` stays a separate
 *    dimension: an announcement never takes attendance.
 *
 * 2. `retreat.communityId` — nullable on purpose. A retreat MAY belong to a
 *    community; most do not, and that stays valid. When set, the tables screen
 *    can read the server team's attendance from that community's roster.
 *
 * Both are plain ADD COLUMN. No CHECK constraint on `meetingType` and no
 * physical FK on `communityId`: SQLite cannot add either through ALTER TABLE,
 * and doing it properly would mean recreating tables that have incoming
 * foreign keys (`community_attendance` -> `community_meeting`) — the exact
 * operation that already destroyed data in this repo. The value catalog is
 * enforced by Zod at the API boundary; the dangling-reference cleanup lives in
 * `communityService.deleteCommunity`.
 */
/**
 * Backfill heurístico del tipo de reunión. Exportado para que el test lo ejecute
 * TAL CUAL en vez de replicarlo: una copia inline del SQL confirma la heurística
 * en vez de comprobarla (así se colaba el título en mayúsculas con acento).
 *
 * El `_` es un comodín de un carácter en la vocal acentuada a propósito: el
 * lower() de SQLite solo baja ASCII, así que 'PREPARACIÓN RETIRO' no coincide ni
 * con '%preparacion%' ni con '%preparación%'.
 *
 * Solo toca filas que siguen en el default, así que reejecutarlo nunca pisa un
 * tipo elegido a mano.
 */
export const PREPARATION_BACKFILL_SQL = `UPDATE "community_meeting" SET "meetingType" = 'preparation'
	 WHERE "meetingType" = 'general'
	   AND lower("title") LIKE '%preparaci_n%'`;

export class AddMeetingTypeAndRetreatCommunity20260907180000 implements MigrationInterface {
	name = 'AddMeetingTypeAndRetreatCommunity20260907180000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			`ALTER TABLE "community_meeting" ADD COLUMN "meetingType" varchar NOT NULL DEFAULT 'general'`,
		);
		await queryRunner.query(
			`CREATE INDEX IF NOT EXISTS "idx_community_meeting_type" ON "community_meeting" ("communityId", "meetingType")`,
		);

		// Backfill: meetings whose title already says "preparación" are the ones
		// the coordinator has been classifying by hand. Idempotent — it only
		// touches rows still sitting on the default, so re-running never
		// overwrites a type someone chose explicitly.
		await queryRunner.query(PREPARATION_BACKFILL_SQL);

		await queryRunner.query(`ALTER TABLE "retreat" ADD COLUMN "communityId" varchar`);
		await queryRunner.query(
			`CREATE INDEX IF NOT EXISTS "idx_retreat_community" ON "retreat" ("communityId")`,
		);

		// Deliberately NOT backfilled: there is no reliable way to infer which
		// community ran a past retreat, and guessing wrong would link one
		// community's roster to another community's retreat. The coordinator sets it.
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`DROP INDEX IF EXISTS "idx_retreat_community"`);
		await queryRunner.query(`ALTER TABLE "retreat" DROP COLUMN "communityId"`);
		await queryRunner.query(`DROP INDEX IF EXISTS "idx_community_meeting_type"`);
		await queryRunner.query(`ALTER TABLE "community_meeting" DROP COLUMN "meetingType"`);
	}
}
