import { MigrationInterface, QueryRunner } from 'typeorm';

export class RemoveTablePermissionsFromCommunications20260330120000 implements MigrationInterface {
	name = 'RemoveTablePermissionsFromCommunications20260330120000';
	timestamp = '20260330120000';

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
		// 1. Remove table:* and retreat:update from communications
		const commsId = await this.getRoleId(queryRunner, 'communications');
		if (commsId) {
			await queryRunner.query(
				`DELETE FROM "role_permissions"
				WHERE "roleId" = ?
				AND "permissionId" IN (
					SELECT id FROM "permissions"
					WHERE "resource" = 'table'
					OR ("resource" = 'retreat' AND "operation" = 'update')
				)`,
				[commsId],
			);
			console.log('Removed table:* and retreat:update from communications role');
		}

		// 2. Add house:read and retreatInventory:read/list to logistics
		const logisticsId = await this.getRoleId(queryRunner, 'logistics');
		if (logisticsId) {
			await this.addPermission(queryRunner, logisticsId, 'house', 'read');
			await this.addPermission(queryRunner, logisticsId, 'retreatInventory', 'read');
			await this.addPermission(queryRunner, logisticsId, 'retreatInventory', 'list');
			console.log('Added house:read, retreatInventory:read/list to logistics role');
		}
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		// 1. Restore table:* and retreat:update to communications
		const commsId = await this.getRoleId(queryRunner, 'communications');
		if (commsId) {
			const tablePerms = await queryRunner.query(
				`SELECT id FROM "permissions" WHERE "resource" = 'table'`,
			);
			for (const perm of tablePerms) {
				await this.addPermission(queryRunner, commsId, 'table', perm.operation || '');
			}
			// Re-add using direct query for table perms
			for (const perm of tablePerms) {
				const existing = await queryRunner.query(
					`SELECT COUNT(*) as count FROM "role_permissions" WHERE "roleId" = ? AND "permissionId" = ?`,
					[commsId, perm.id],
				);
				if (existing[0].count === 0) {
					await queryRunner.query(
						`INSERT INTO "role_permissions" ("roleId", "permissionId", "createdAt") VALUES (?, ?, datetime('now'))`,
						[commsId, perm.id],
					);
				}
			}
			await this.addPermission(queryRunner, commsId, 'retreat', 'update');
			console.log('Restored table:* and retreat:update to communications role');
		}

		// 2. Remove house:read and retreatInventory:read/list from logistics
		const logisticsId = await this.getRoleId(queryRunner, 'logistics');
		if (logisticsId) {
			await queryRunner.query(
				`DELETE FROM "role_permissions"
				WHERE "roleId" = ?
				AND "permissionId" IN (
					SELECT id FROM "permissions"
					WHERE ("resource" = 'house' AND "operation" = 'read')
					OR ("resource" = 'retreatInventory' AND "operation" IN ('read', 'list'))
				)`,
				[logisticsId],
			);
			console.log('Removed house:read, retreatInventory:read/list from logistics role');
		}
	}
}
