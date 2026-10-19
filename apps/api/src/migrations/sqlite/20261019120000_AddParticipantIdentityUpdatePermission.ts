import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Permiso `participant:identity:update` — corregir el correo de una ficha
 * (specs/participant-email-change, D2 aprobada 2026-10-19).
 *
 * El correo es identidad global (auto-link de cuentas, dedupe de imports), así
 * que su corrección vive tras un permiso propio en vez de `participant:update`.
 * Se concede a superadmin (rol global) y admin (rol de retiro — el
 * "administrador del retiro" de la operación real). regular_server NO lo
 * recibe.
 *
 * Data-only (permissions + role_permissions), idempotente, sin recreate.
 */
export class AddParticipantIdentityUpdatePermission20261019120000
	implements MigrationInterface
{
	name = 'AddParticipantIdentityUpdatePermission20261019120000';
	timestamp = '20261019120000';

	// Solo INSERT/DELETE, sin CREATE/DROP TABLE — no requerido, pero se mantiene
	// por consistencia con el resto de migraciones de permisos.
	transaction = false as const;

	private async ensurePermission(
		queryRunner: QueryRunner,
		resource: string,
		operation: string,
		description: string,
	): Promise<string | null> {
		const existing = await queryRunner.query(
			`SELECT id FROM "permissions" WHERE "resource" = ? AND "operation" = ? LIMIT 1`,
			[resource, operation],
		);
		if (existing.length > 0) return existing[0].id;

		await queryRunner.query(
			`INSERT INTO "permissions" ("resource", "operation", "description", "createdAt", "updatedAt")
			 VALUES (?, ?, ?, datetime('now'), datetime('now'))`,
			[resource, operation, description],
		);
		const created = await queryRunner.query(
			`SELECT id FROM "permissions" WHERE "resource" = ? AND "operation" = ? LIMIT 1`,
			[resource, operation],
		);
		return created.length > 0 ? created[0].id : null;
	}

	private async getRoleId(
		queryRunner: QueryRunner,
		roleName: string,
	): Promise<string | null> {
		const rows = await queryRunner.query(
			`SELECT id FROM "roles" WHERE "name" = ? LIMIT 1`,
			[roleName],
		);
		return rows.length > 0 ? rows[0].id : null;
	}

	private async grantPermission(
		queryRunner: QueryRunner,
		roleId: string,
		permissionId: string,
	): Promise<void> {
		const existing = await queryRunner.query(
			`SELECT COUNT(*) as count FROM "role_permissions" WHERE "roleId" = ? AND "permissionId" = ?`,
			[roleId, permissionId],
		);
		if (existing[0].count > 0) return;
		await queryRunner.query(
			`INSERT INTO "role_permissions" ("roleId", "permissionId", "createdAt") VALUES (?, ?, datetime('now'))`,
			[roleId, permissionId],
		);
	}

	public async up(queryRunner: QueryRunner): Promise<void> {
		const permId = await this.ensurePermission(
			queryRunner,
			'participant',
			'identity:update',
			"Correct a participant's email (global identity change, audited)",
		);
		if (!permId) return;

		for (const roleName of ['superadmin', 'admin']) {
			const roleId = await this.getRoleId(queryRunner, roleName);
			if (roleId) {
				await this.grantPermission(queryRunner, roleId, permId);
			}
		}
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			`DELETE FROM "role_permissions" WHERE "permissionId" IN (
				SELECT id FROM "permissions"
				WHERE "resource" = 'participant' AND "operation" = 'identity:update'
			)`,
		);
		await queryRunner.query(
			`DELETE FROM "permissions"
			 WHERE "resource" = 'participant' AND "operation" = 'identity:update'`,
		);
	}
}
