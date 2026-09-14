import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Permiso `participant:health`: separa la lectura de datos sensibles de salud
 * (medicación, dieta, discapacidad, ronquidos, contactos de emergencia, notas)
 * del permiso general `participant:read`, que hoy tiene hasta `regular_server`.
 *
 * Se concede a `superadmin`, `admin`, `treasurer` y `logistics` — no a
 * `communications` ni a `regular_server`, que no necesitan la ficha médica
 * para su trabajo. `superadmin` no hereda permisos nuevos automáticamente:
 * el loop de la migración base solo alcanzó a los permisos que existían en
 * ese momento, así que hay que concedérselo explícito aquí, igual que a
 * cualquier permiso creado después.
 *
 * `transaction = false`: solo INSERT, sin CREATE/DROP TABLE — no requerido,
 * pero se mantiene por consistencia con el resto de migraciones de permisos.
 */
export class AddParticipantHealthPermission20260914130000 implements MigrationInterface {
	name = 'AddParticipantHealthPermission20260914130000';
	timestamp = '20260914130000';
	transaction = false;

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`
			INSERT OR IGNORE INTO "permissions" ("resource", "operation", "description") VALUES
			('participant', 'health', 'View/export sensitive health data: medication, diet, disability, emergency contacts, notes')
		`);

		const perm = await queryRunner.query(
			`SELECT id FROM "permissions" WHERE "resource" = 'participant' AND "operation" = 'health'`,
		);
		const permId = perm[0]?.id;
		if (!permId) return;

		const rolesResult = await queryRunner.query(
			`SELECT id, name FROM "roles" WHERE name IN ('superadmin', 'admin', 'treasurer', 'logistics')`,
		);

		for (const role of rolesResult) {
			const exists = await queryRunner.query(
				`SELECT COUNT(*) AS c FROM "role_permissions" WHERE "roleId" = ? AND "permissionId" = ?`,
				[role.id, permId],
			);
			if (exists[0].c === 0) {
				await queryRunner.query(
					`INSERT INTO "role_permissions" ("roleId", "permissionId") VALUES (?, ?)`,
					[role.id, permId],
				);
			}
		}
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			`DELETE FROM "role_permissions" WHERE "permissionId" IN (SELECT id FROM "permissions" WHERE "resource" = 'participant' AND "operation" = 'health')`,
		);
		await queryRunner.query(
			`DELETE FROM "permissions" WHERE "resource" = 'participant' AND "operation" = 'health'`,
		);
	}
}
