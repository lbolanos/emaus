import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Face recognition in community attendance + public meeting album
 * (specs/community-attendance-faces, M3 / M7).
 *
 *  - `community.faceRecognitionEnabled`      — owner switch, off by default (FR-11).
 *  - `community_member.faceRecognitionOptOut` — member excluded from the gallery sent to the
 *    model and from album tags (FR-12, D8).
 *  - `community_meeting.albumToken` / `albumPublishedAt` — unlisted public album link (D13).
 *    Partial unique index so two meetings can never share a token.
 *  - `community_meeting_photo_tag` — confirmed face box (0-1000 normalised) per member on the
 *    meeting cover photo (FR-28). One tag per (meeting, member).
 *
 * Only ADD COLUMN + CREATE ... IF NOT EXISTS: no recreate-table, no DROP of a parent, no PRAGMA.
 * Idempotent (PRAGMA table_info guard before every ADD COLUMN), so a re-run after a partial
 * apply converges. Imports nothing from @repo/types.
 */
export class AddCommunityFaceRecognition20261022120000 implements MigrationInterface {
	name = 'AddCommunityFaceRecognition20261022120000';
	timestamp = '20261022120000';

	// Required by the sqliteSafePattern guard because down() has a DROP TABLE. That table is
	// new and has no incoming FKs, so nothing cascades; every up() step is re-runnable
	// (PRAGMA table_info guard, IF NOT EXISTS), which is what running without a transaction needs.
	transaction = false as const;

	private async addColumnIfMissing(
		queryRunner: QueryRunner,
		table: string,
		column: string,
		definition: string,
	): Promise<void> {
		const columns: { name: string }[] = await queryRunner.query(`PRAGMA table_info("${table}")`);
		if (!columns.some((c) => c.name === column)) {
			await queryRunner.query(`ALTER TABLE "${table}" ADD COLUMN "${column}" ${definition}`);
		}
	}

	public async up(queryRunner: QueryRunner): Promise<void> {
		await this.addColumnIfMissing(
			queryRunner,
			'community',
			'faceRecognitionEnabled',
			'boolean NOT NULL DEFAULT (0)',
		);
		await this.addColumnIfMissing(
			queryRunner,
			'community_member',
			'faceRecognitionOptOut',
			'boolean NOT NULL DEFAULT (0)',
		);
		await this.addColumnIfMissing(queryRunner, 'community_meeting', 'albumToken', 'varchar(32)');
		await this.addColumnIfMissing(queryRunner, 'community_meeting', 'albumPublishedAt', 'datetime');

		await queryRunner.query(
			`CREATE UNIQUE INDEX IF NOT EXISTS "UQ_community_meeting_albumToken" ON "community_meeting" ("albumToken") WHERE "albumToken" IS NOT NULL`,
		);

		await queryRunner.query(`
			CREATE TABLE IF NOT EXISTS "community_meeting_photo_tag" (
				"id" varchar PRIMARY KEY NOT NULL,
				"meetingId" varchar NOT NULL,
				"memberId" varchar NOT NULL,
				"yMin" integer NOT NULL,
				"xMin" integer NOT NULL,
				"yMax" integer NOT NULL,
				"xMax" integer NOT NULL,
				"createdAt" datetime NOT NULL DEFAULT (datetime('now')),
				CONSTRAINT "FK_meeting_photo_tag_meeting" FOREIGN KEY ("meetingId") REFERENCES "community_meeting" ("id") ON DELETE CASCADE ON UPDATE NO ACTION,
				CONSTRAINT "FK_meeting_photo_tag_member" FOREIGN KEY ("memberId") REFERENCES "community_member" ("id") ON DELETE CASCADE ON UPDATE NO ACTION
			)
		`);
		await queryRunner.query(
			`CREATE UNIQUE INDEX IF NOT EXISTS "UQ_meeting_photo_tag_meeting_member" ON "community_meeting_photo_tag" ("meetingId", "memberId")`,
		);
		await queryRunner.query(
			`CREATE INDEX IF NOT EXISTS "IDX_meeting_photo_tag_member" ON "community_meeting_photo_tag" ("memberId")`,
		);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		// Only objects this migration created. DROP of the new child table is safe: nothing
		// references it. The columns carry no FK/index except the albumToken one dropped first.
		await queryRunner.query(`DROP INDEX IF EXISTS "IDX_meeting_photo_tag_member"`);
		await queryRunner.query(`DROP INDEX IF EXISTS "UQ_meeting_photo_tag_meeting_member"`);
		await queryRunner.query(`DROP TABLE IF EXISTS "community_meeting_photo_tag"`);
		await queryRunner.query(`DROP INDEX IF EXISTS "UQ_community_meeting_albumToken"`);
		for (const [table, column] of [
			['community_meeting', 'albumPublishedAt'],
			['community_meeting', 'albumToken'],
			['community_member', 'faceRecognitionOptOut'],
			['community', 'faceRecognitionEnabled'],
		]) {
			const columns: { name: string }[] = await queryRunner.query(`PRAGMA table_info("${table}")`);
			if (columns.some((c) => c.name === column)) {
				await queryRunner.query(`ALTER TABLE "${table}" DROP COLUMN "${column}"`);
			}
		}
	}
}
