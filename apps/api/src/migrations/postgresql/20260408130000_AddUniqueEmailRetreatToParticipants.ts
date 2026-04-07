import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Tables (and their FK column to participants.id) that must be repointed
 * when merging duplicate participants. Order does not matter — all rows
 * referencing a duplicate id are reassigned to the canonical id before the
 * duplicate row is deleted.
 *
 * Tables with a UNIQUE constraint that could collide on merge are listed
 * with their conflict columns so we can pre-delete colliding rows on the
 * duplicate side.
 */
const FK_TABLES: Array<{ table: string; column: string; conflictCols?: string[] }> = [
	{ table: 'users', column: 'participantId' },
	{ table: 'payments', column: 'participantId' },
	{ table: 'retreat_bed', column: 'participantId' },
	{ table: 'participant_tags', column: 'participantId' },
	{ table: 'participant_communications', column: 'participantId' },
	{ table: 'community_member', column: 'participantId', conflictCols: ['communityId'] },
	{ table: 'retreat_participants', column: 'participantId' },
	{ table: 'service_teams', column: 'leaderId' },
	{ table: 'service_team_members', column: 'participantId' },
	{ table: 'retreat_responsibilities', column: 'participantId' },
];

export class AddUniqueEmailRetreatToParticipants20260408130000 implements MigrationInterface {
	name = 'AddUniqueEmailRetreatToParticipants';
	timestamp = '20260408130000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		// 1. Normalize emails before any matching/merging logic
		await queryRunner.query(
			`UPDATE participants SET email = LOWER(TRIM(email)) WHERE email IS NOT NULL AND email <> LOWER(TRIM(email))`,
		);
		await queryRunner.query(
			`UPDATE users SET email = LOWER(TRIM(email)) WHERE email <> LOWER(TRIM(email))`,
		);

		// Skip table operations gracefully if a referencing table does not exist
		// in this database (defensive — production schema may evolve).
		const existingTables = new Set<string>(
			(
				await queryRunner.query(
					`SELECT table_name FROM information_schema.tables WHERE table_schema = current_schema()`,
				)
			).map((r: { table_name: string }) => r.table_name),
		);
		const activeFkTables = FK_TABLES.filter((fk) => existingTables.has(fk.table));

		// 2. Merge duplicate participants that share the same email globally.
		// For each duplicate group, the canonical record is the one with the
		// most retreat participations (tiebreak by id ASC).
		const duplicateGroups: Array<{ email: string }> = await queryRunner.query(`
			SELECT LOWER(email) AS email
			FROM participants
			WHERE email IS NOT NULL AND email <> ''
			GROUP BY LOWER(email)
			HAVING COUNT(*) > 1
		`);

		for (const { email } of duplicateGroups) {
			const rows: Array<{ id: string }> = await queryRunner.query(
				`SELECT p.id
				 FROM participants p
				 WHERE LOWER(p.email) = $1
				 ORDER BY (SELECT COUNT(*) FROM retreat_participants rp WHERE rp."participantId" = p.id) DESC, p.id ASC`,
				[email],
			);
			if (rows.length < 2) continue;
			const canonicalId = rows[0].id;
			const duplicateIds = rows.slice(1).map((r) => r.id);

			for (const dupId of duplicateIds) {
				for (const fk of activeFkTables) {
					if (fk.conflictCols && fk.conflictCols.length > 0) {
						const conflictMatch = fk.conflictCols
							.map((c) => `dup."${c}" = canon."${c}"`)
							.join(' AND ');
						await queryRunner.query(
							`DELETE FROM "${fk.table}" t
							 WHERE t."${fk.column}" = $1
							   AND EXISTS (
								 SELECT 1 FROM "${fk.table}" canon
								 WHERE canon."${fk.column}" = $2
								   AND ${conflictMatch.replace(/dup\./g, 't.')}
							 )`,
							[dupId, canonicalId],
						);
					}
					await queryRunner.query(
						`UPDATE "${fk.table}" SET "${fk.column}" = $1 WHERE "${fk.column}" = $2`,
						[canonicalId, dupId],
					);
				}
				await queryRunner.query(`DELETE FROM participants WHERE id = $1`, [dupId]);
			}
		}

		// 3. Backfill: link users to their participant by matching email.
		await queryRunner.query(`
			UPDATE users u
			SET "participantId" = p.id
			FROM participants p
			WHERE u."participantId" IS NULL
			  AND LOWER(p.email) = LOWER(u.email)
		`);

		// 4. Backfill retreat_participants.userId from users.participantId.
		await queryRunner.query(`
			UPDATE retreat_participants rp
			SET "userId" = u.id
			FROM users u
			WHERE rp."userId" IS NULL
			  AND rp."participantId" IS NOT NULL
			  AND u."participantId" = rp."participantId"
		`);

		// 5. Prevent duplicate participant records with the same email within the
		// same retreat.
		await queryRunner.query(
			`CREATE UNIQUE INDEX "UQ_participants_email_retreat"
			 ON participants (LOWER(email), "retreatId")
			 WHERE email IS NOT NULL AND email <> ''`,
		);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`DROP INDEX IF EXISTS "UQ_participants_email_retreat"`);
	}
}
