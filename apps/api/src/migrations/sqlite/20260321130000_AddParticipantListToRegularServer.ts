import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddParticipantListToRegularServer20260321130000 implements MigrationInterface {
	name = 'AddParticipantListToRegularServer20260321130000';
	timestamp = '20260321130000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		console.log('Adding participant:list permission to regular_server role...');

		const roleResult = await queryRunner.query(
			`SELECT id FROM "roles" WHERE "name" = 'regular_server' LIMIT 1`,
		);

		if (roleResult.length === 0) {
			console.log('regular_server role not found');
			return;
		}

		const roleId = roleResult[0].id;

		const permResult = await queryRunner.query(
			`SELECT id FROM "permissions" WHERE "resource" = 'participant' AND "operation" = 'list' LIMIT 1`,
		);

		if (permResult.length === 0) {
			console.log('participant:list permission not found');
			return;
		}

		const permId = permResult[0].id;

		const existing = await queryRunner.query(
			`SELECT COUNT(*) as count FROM "role_permissions" WHERE "roleId" = ? AND "permissionId" = ?`,
			[roleId, permId],
		);

		if (existing[0].count === 0) {
			await queryRunner.query(
				`INSERT INTO "role_permissions" ("roleId", "permissionId", "createdAt") VALUES (?, ?, datetime('now'))`,
				[roleId, permId],
			);
			console.log('Added participant:list to regular_server role');
		} else {
			console.log('participant:list already exists for regular_server role');
		}
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		const roleResult = await queryRunner.query(
			`SELECT id FROM "roles" WHERE "name" = 'regular_server' LIMIT 1`,
		);

		if (roleResult.length === 0) return;

		await queryRunner.query(
			`
			DELETE FROM "role_permissions"
			WHERE "roleId" = ?
			AND "permissionId" IN (
				SELECT id FROM "permissions"
				WHERE "resource" = 'participant' AND "operation" = 'list'
			)
		`,
			[roleResult[0].id],
		);

		console.log('Removed participant:list from regular_server role');
	}
}
