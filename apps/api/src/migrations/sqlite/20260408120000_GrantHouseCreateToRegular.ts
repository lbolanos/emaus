import { MigrationInterface, QueryRunner } from 'typeorm';

export class GrantHouseCreateToRegular20260408120000 implements MigrationInterface {
	name = 'GrantHouseCreateToRegular20260408120000';
	timestamp = '20260408120000';

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
		// Allow any regular user to create retreat houses. Update/delete remain
		// restricted to region_admin/superadmin since House has no ownership field.
		const regularId = await this.getRoleId(queryRunner, 'regular');
		if (regularId) {
			await this.addPermission(queryRunner, regularId, 'house', 'create');
			console.log('Granted house:create to regular role');
		}
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		const regularId = await this.getRoleId(queryRunner, 'regular');
		if (regularId) {
			await queryRunner.query(
				`DELETE FROM "role_permissions"
				WHERE "roleId" = ?
				AND "permissionId" IN (
					SELECT id FROM "permissions"
					WHERE "resource" = 'house'
					AND "operation" = 'create'
				)`,
				[regularId],
			);
			console.log('Removed house:create from regular role');
		}
	}
}
