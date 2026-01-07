import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddComprehensivePermissionsToAdminRole20251214180000 implements MigrationInterface {
	name = 'AddComprehensivePermissionsToAdminRole20251214180000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		// Get the admin role ID
		const adminRoleResult = await queryRunner.query(`
			SELECT id FROM roles WHERE name = 'admin' LIMIT 1
		`);

		if (adminRoleResult.length === 0) {
			// Create admin role if it doesn't exist
			const insertResult = await queryRunner.query(`
				INSERT INTO roles (name) VALUES ('admin')
			`);
			const adminRoleId = insertResult.lastID;

			// Add all permissions except system:admin (reserved for superadmin)
			await queryRunner.query(
				`
				INSERT INTO role_permissions (roleId, permissionId)
				SELECT ?, id FROM permissions
				WHERE resource || ':' || operation != 'system:admin'
			`,
				[adminRoleId],
			);
		} else {
			const adminRoleId = adminRoleResult[0].id;

			// Add all missing permissions to the existing admin role except system:admin
			await queryRunner.query(
				`
				INSERT OR IGNORE INTO role_permissions (roleId, permissionId)
				SELECT ?, id FROM permissions
				WHERE resource || ':' || operation != 'system:admin'
			`,
				[adminRoleId],
			);
		}
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		// Remove the permissions that were added in this migration
		const adminRoleResult = await queryRunner.query(`
			SELECT id FROM roles WHERE name = 'admin' LIMIT 1
		`);

		if (adminRoleResult.length > 0) {
			const adminRoleId = adminRoleResult[0].id;

			// Remove all permissions except those that admin should retain by default
			await queryRunner.query(
				`
				DELETE FROM role_permissions
				WHERE roleId = ?
				AND permissionId IN (
					SELECT id FROM permissions
					WHERE resource IN ('audit', 'globalMessageTemplate', 'inventoryItem', 'user')
					OR (resource = 'retreat' AND operation = 'delete')
					OR (resource || ':' || operation = 'system:admin')
					OR (resource || ':' || operation = 'telemetry:read')
				)
			`,
				[adminRoleId],
			);
		}
	}
}
