import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Backfill `participants.userId` from `users.participantId`.
 *
 * The `/retreats/attended` endpoint queries the participants table by
 * `userId`. Historical participant rows do not have this column populated
 * even when a matching user exists.
 */
export class BackfillParticipantUserId20260408150000 implements MigrationInterface {
	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`
			UPDATE participants
			SET userId = (
				SELECT u.id FROM users u
				WHERE u.participantId = participants.id
				LIMIT 1
			)
			WHERE userId IS NULL
			  AND EXISTS (
				SELECT 1 FROM users u WHERE u.participantId = participants.id
			  )
		`);
	}

	public async down(_queryRunner: QueryRunner): Promise<void> {
		// Non-destructive backfill — no rollback.
	}
}
