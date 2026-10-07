import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Concede `participant:health` al rol `communications`.
 *
 * El permiso se creó (20260914) excluyendo a `communications` porque "no
 * necesita la ficha médica". En la operación real sí la necesita: el equipo de
 * comunicaciones/palancas es quien contacta a las familias y quien conoce los
 * problemas de los caminantes — sin los contactos de emergencia no puede
 * hacer su trabajo (reporte 2026-10-07: mnico2310@gmail.com, communications
 * en Buen Despacho, no veía los contactos al editar en la vista Palancas).
 *
 * `regular_server` sigue fuera del permiso, como en el diseño original.
 *
 * `transaction = false`: solo INSERT/DELETE, sin CREATE/DROP TABLE — no
 * requerido, pero se mantiene por consistencia con el resto de migraciones
 * de permisos.
 */
export class GrantParticipantHealthToCommunications20261007100000 implements MigrationInterface {
	name = 'GrantParticipantHealthToCommunications20261007100000';
	timestamp = '20261007100000';

	transaction = false as const;

	public async up(queryRunner: QueryRunner): Promise<void> {
		const perm = await queryRunner.query(
			`SELECT id FROM "permissions" WHERE "resource" = 'participant' AND "operation" = 'health'`,
		);
		const permId = perm[0]?.id;
		if (!permId) return;

		const role = await queryRunner.query(
			`SELECT id FROM "roles" WHERE "name" = 'communications'`,
		);
		const roleId = role[0]?.id;
		if (!roleId) return;

		const exists = await queryRunner.query(
			`SELECT COUNT(*) AS c FROM "role_permissions" WHERE "roleId" = ? AND "permissionId" = ?`,
			[roleId, permId],
		);
		if (exists[0].c === 0) {
			await queryRunner.query(
				`INSERT INTO "role_permissions" ("roleId", "permissionId") VALUES (?, ?)`,
				[roleId, permId],
			);
		}
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		// Solo la concesión de communications; el permiso en sí y las demás
		// concesiones (superadmin, admin, treasurer, logistics) no se tocan.
		await queryRunner.query(
			`DELETE FROM "role_permissions"
			WHERE "permissionId" IN (
				SELECT id FROM "permissions" WHERE "resource" = 'participant' AND "operation" = 'health'
			)
			AND "roleId" IN (SELECT id FROM "roles" WHERE "name" = 'communications')`,
		);
	}
}
