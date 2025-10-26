import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRetreatPermissionsToRegularRole20250914180000 implements MigrationInterface {
	name = 'AddRetreatPermissionsToRegularRole20250914180000';
	timestamp = '20250914180000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		console.log('🔧 PRODUCTION FIX: Adding retreat permissions to regular role...');

		// Get the regular role ID
		const regularRoleResult = await queryRunner.query(
			`SELECT id FROM "roles" WHERE "name" = 'regular' LIMIT 1`,
		);

		if (regularRoleResult.length === 0) {
			console.log('❌ Regular role not found');
			return;
		}

		const regularRoleId = regularRoleResult[0].id;
		console.log(`✅ Found regular role with ID: ${regularRoleId}`);

		// Get retreat permissions
		const retreatPermissions = await queryRunner.query(
			`SELECT id, resource, operation FROM "permissions" WHERE "resource" = 'retreat' AND "operation" IN ('read', 'list')`,
		);

		console.log('📋 Retreat permissions found:', retreatPermissions);

		// Add missing retreat permissions to regular role
		for (const permission of retreatPermissions) {
			// Check if permission already exists for this role
			const existing = await queryRunner.query(
				`SELECT COUNT(*) as count FROM "role_permissions" WHERE "roleId" = ? AND "permissionId" = ?`,
				[regularRoleId, permission.id],
			);

			if (existing[0].count === 0) {
				await queryRunner.query(
					`INSERT INTO "role_permissions" ("roleId", "permissionId", "createdAt") VALUES (?, ?, datetime('now'))`,
					[regularRoleId, permission.id],
				);
				console.log(
					`✅ Added ${permission.resource}:${permission.operation} permission to regular role`,
				);
			} else {
				console.log(
					`ℹ️  ${permission.resource}:${permission.operation} permission already exists for regular role`,
				);
			}
		}

		// Verify the fix by checking regular role permissions
		const finalPermissions = await queryRunner.query(
			`
			SELECT p.resource, p.operation
			FROM "role_permissions" rp
			JOIN "permissions" p ON rp.permissionId = p.id
			WHERE rp.roleId = ?
			ORDER BY p.resource, p.operation
		`,
			[regularRoleId],
		);

		console.log('🔍 Final regular role permissions:');
		finalPermissions.forEach((perm: any) => {
			console.log(`  - ${perm.resource}:${perm.operation}`);
		});

		// Check if retreat:read is now available
		const hasRetreatRead = finalPermissions.some(
			(perm: any) => perm.resource === 'retreat' && perm.operation === 'read',
		);
		console.log(
			`\n✅ PRODUCTION FIX COMPLETE: Regular role now has retreat:read permission: ${hasRetreatRead ? 'YES' : 'NO'}`,
		);

		console.log('\n🎯 This fixes the 403 error for Google login users like Luna');
		console.log('👥 Users affected: All users with "regular" role who log in via Google');
		console.log('📖 Impact: Regular users can now view retreats but still cannot modify them');
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		console.log('🔙 Rolling back: Removing retreat permissions from regular role...');

		// Get the regular role ID
		const regularRoleResult = await queryRunner.query(
			`SELECT id FROM "roles" WHERE "name" = 'regular' LIMIT 1`,
		);

		if (regularRoleResult.length === 0) {
			return;
		}

		const regularRoleId = regularRoleResult[0].id;

		// Remove retreat permissions from regular role
		await queryRunner.query(
			`
			DELETE FROM "role_permissions"
			WHERE "roleId" = ?
			AND "permissionId" IN (
				SELECT id FROM "permissions"
				WHERE "resource" = 'retreat'
				AND "operation" IN ('read', 'list')
			)
		`,
			[regularRoleId],
		);

		console.log('✅ Removed retreat permissions from regular role');
	}
}
