import { MigrationInterface, QueryRunner } from 'typeorm';

export class RemoveParticipantDeleteFromCommunications20260409120000
	implements MigrationInterface
{
	name = 'RemoveParticipantDeleteFromCommunications20260409120000';
	timestamp = '20260409120000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		const roleResult = await queryRunner.query(
			`SELECT id FROM "roles" WHERE "name" = 'communications' LIMIT 1`,
		);
		if (roleResult.length === 0) return;

		const commsId = roleResult[0].id;

		// Remove participant:delete and participant:create from communications role
		await queryRunner.query(
			`DELETE FROM "role_permissions"
			WHERE "roleId" = ?
			AND "permissionId" IN (
				SELECT id FROM "permissions"
				WHERE "resource" = 'participant'
				AND "operation" IN ('delete', 'create')
			)`,
			[commsId],
		);

		console.log('Removed participant:delete and participant:create from communications role');
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		const roleResult = await queryRunner.query(
			`SELECT id FROM "roles" WHERE "name" = 'communications' LIMIT 1`,
		);
		if (roleResult.length === 0) return;

		const commsId = roleResult[0].id;

		// Restore participant:delete and participant:create
		for (const operation of ['delete', 'create']) {
			const permResult = await queryRunner.query(
				`SELECT id FROM "permissions" WHERE "resource" = 'participant' AND "operation" = ? LIMIT 1`,
				[operation],
			);
			if (permResult.length === 0) continue;

			const existing = await queryRunner.query(
				`SELECT COUNT(*) as count FROM "role_permissions" WHERE "roleId" = ? AND "permissionId" = ?`,
				[commsId, permResult[0].id],
			);

			if (existing[0].count === 0) {
				await queryRunner.query(
					`INSERT INTO "role_permissions" ("roleId", "permissionId", "createdAt") VALUES (?, ?, datetime('now'))`,
					[commsId, permResult[0].id],
				);
			}
		}

		console.log('Restored participant:delete and participant:create to communications role');
	}
}
