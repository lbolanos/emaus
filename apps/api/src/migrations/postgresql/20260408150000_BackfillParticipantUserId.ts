import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Backfill `participants.userId` from `users.participantId`.
 *
 * The `/retreats/attended` endpoint queries the participants table by
 * `userId`. Historical participant rows do not have this column populated
 * even when a matching user exists.
 */
export class BackfillParticipantUserId20260408150000 implements MigrationInterface {
	name = 'BackfillParticipantUserId';
	timestamp = '20260408150000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`
			UPDATE participants p
			SET "userId" = u.id
			FROM users u
			WHERE p."userId" IS NULL
			  AND u."participantId" = p.id
		`);
	}

	public async down(_queryRunner: QueryRunner): Promise<void> {
		// Non-destructive backfill — no rollback.
	}
}
