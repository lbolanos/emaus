import { MigrationInterface, QueryRunner } from 'typeorm';

export class GrantResponsabilityReadToCommunications20260407120000
	implements MigrationInterface
{
	name = 'GrantResponsabilityReadToCommunications20260407120000';
	timestamp = '20260407120000';

	private async getRoleId(queryRunner: QueryRunner, roleName: string): Promise<string | null> {
		const result = await queryRunner.query(
			`SELECT id FROM "roles" WHERE "name" = ? LIMIT 1`,
			[roleName],
		);
		return result.length > 0 ? result[0].id : null;
	}

	private async addPermission(
		queryRunner: QueryRunner,
		roleId: string,
		resource: string,
		operation: string,
	): Promise<void> {
		const permResult = await queryRunner.query(
			`SELECT id FROM "permissions" WHERE "resource" = ? AND "operation" = ? LIMIT 1`,
			[resource, operation],
		);
		if (permResult.length === 0) return;

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
		}
	}

	public async up(queryRunner: QueryRunner): Promise<void> {
		// Communications coordinators need to know which palanquero attends each
		// caminante so they can resolve {participant.palanquero*} variables in
		// message template previews and the MessageDialog. Grant read/list on
		// responsability (no create/update/delete).
		const commsId = await this.getRoleId(queryRunner, 'communications');
		if (commsId) {
			await this.addPermission(queryRunner, commsId, 'responsability', 'read');
			await this.addPermission(queryRunner, commsId, 'responsability', 'list');
			console.log('Granted responsability:read/list to communications role');
		}
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		const commsId = await this.getRoleId(queryRunner, 'communications');
		if (commsId) {
			await queryRunner.query(
				`DELETE FROM "role_permissions"
				WHERE "roleId" = ?
				AND "permissionId" IN (
					SELECT id FROM "permissions"
					WHERE "resource" = 'responsability'
					AND "operation" IN ('read', 'list')
				)`,
				[commsId],
			);
			console.log('Removed responsability:read/list from communications role');
		}
	}
}
