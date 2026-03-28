import { MigrationInterface, QueryRunner } from 'typeorm';

export class ClearStaleExpiresAtOnActiveUserRetreats20260328180000
	implements MigrationInterface
{
	name = 'ClearStaleExpiresAtOnActiveUserRetreats20260328180000';
	timestamp = '20260328180000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		// Clear expiresAt on active user_retreats where it is in the past or before invitedAt.
		// These are stale values carried over from previous (expired) invitations
		// when the user was re-invited without an explicit expiration.
		const staleRows = await queryRunner.query(
			`SELECT ur.id, u.email, ur.invitedAt, ur.expiresAt
			 FROM user_retreats ur
			 JOIN users u ON ur.userId = u.id
			 WHERE ur.status = 'active'
			   AND ur.expiresAt IS NOT NULL
			   AND (ur.expiresAt < ur.invitedAt OR ur.expiresAt < datetime('now'))`,
		);

		if (staleRows.length > 0) {
			console.log(
				`Clearing stale expiresAt on ${staleRows.length} active user_retreat(s):`,
			);
			for (const row of staleRows) {
				console.log(
					`  - ${row.email}: invitedAt=${row.invitedAt}, expiresAt=${row.expiresAt}`,
				);
			}

			await queryRunner.query(
				`UPDATE user_retreats
				 SET expiresAt = NULL
				 WHERE status = 'active'
				   AND expiresAt IS NOT NULL
				   AND (expiresAt < invitedAt OR expiresAt < datetime('now'))`,
			);
		} else {
			console.log('No stale expiresAt values found — nothing to fix.');
		}
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		// Cannot restore original expiresAt values — this is a data-fix migration
		console.log(
			'ClearStaleExpiresAtOnActiveUserRetreats: down is a no-op (data-fix migration)',
		);
	}
}
