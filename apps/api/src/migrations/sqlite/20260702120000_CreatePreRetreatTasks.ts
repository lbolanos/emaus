import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Tareas Pre-Retiro (checklist "Qué Hacer y Cuándo" antes del retiro).
 *
 * Tres tablas espejo del patrón Minuto a Minuto:
 *  - pre_retreat_task_template_set  (agrupador de templates, con default)
 *  - pre_retreat_task_template      (tareas del template; sub-tareas vía parentId)
 *  - retreat_pre_retreat_task       (instancias por retiro con dueDate calculada)
 *
 * `transaction = false`: requerido por el guard sqliteSafePattern por el
 * DROP TABLE del down(); el up() solo hace CREATE/INSERT.
 */
export class CreatePreRetreatTasks20260702120000 implements MigrationInterface {
	name = 'CreatePreRetreatTasks20260702120000';
	timestamp = '20260702120000';
	transaction = false;

	public async up(queryRunner: QueryRunner): Promise<void> {
		// 1a. pre_retreat_task_template_set
		await queryRunner.query(`
			CREATE TABLE "pre_retreat_task_template_set" (
				"id" varchar PRIMARY KEY NOT NULL,
				"name" varchar NOT NULL,
				"description" text,
				"sourceTag" varchar,
				"isActive" boolean NOT NULL DEFAULT 1,
				"isDefault" boolean NOT NULL DEFAULT 0,
				"createdAt" datetime NOT NULL DEFAULT (datetime('now')),
				"updatedAt" datetime NOT NULL DEFAULT (datetime('now'))
			)
		`);
		await queryRunner.query(
			`CREATE UNIQUE INDEX "IDX_prt_tpl_set_name" ON "pre_retreat_task_template_set" ("name")`,
		);

		// 1b. pre_retreat_task_template (tarea raíz o sub-tarea vía parentId)
		await queryRunner.query(`
			CREATE TABLE "pre_retreat_task_template" (
				"id" varchar PRIMARY KEY NOT NULL,
				"templateSetId" varchar REFERENCES "pre_retreat_task_template_set" ("id") ON DELETE CASCADE,
				"parentId" varchar REFERENCES "pre_retreat_task_template" ("id") ON DELETE CASCADE,
				"name" varchar NOT NULL,
				"description" text,
				"dueOffsetDays" integer,
				"defaultOrder" integer NOT NULL DEFAULT 0,
				"supportNotes" text,
				"isActive" boolean NOT NULL DEFAULT 1,
				"createdAt" datetime NOT NULL DEFAULT (datetime('now')),
				"updatedAt" datetime NOT NULL DEFAULT (datetime('now'))
			)
		`);
		await queryRunner.query(
			`CREATE INDEX "IDX_prt_tpl_set" ON "pre_retreat_task_template" ("templateSetId")`,
		);
		await queryRunner.query(
			`CREATE INDEX "IDX_prt_tpl_parent" ON "pre_retreat_task_template" ("parentId")`,
		);

		// 2. retreat_pre_retreat_task (instancia por retiro)
		await queryRunner.query(`
			CREATE TABLE "retreat_pre_retreat_task" (
				"id" varchar PRIMARY KEY NOT NULL,
				"retreatId" varchar NOT NULL,
				"templateId" varchar,
				"parentId" varchar,
				"name" varchar NOT NULL,
				"description" text,
				"dueOffsetDays" integer,
				"dueDate" date,
				"status" varchar NOT NULL DEFAULT 'pending',
				"responsibleParticipantId" varchar,
				"responsibleText" varchar,
				"notes" text,
				"supportNotes" text,
				"sortOrder" integer NOT NULL DEFAULT 0,
				"completedAt" datetime,
				"createdAt" datetime NOT NULL DEFAULT (datetime('now')),
				"updatedAt" datetime NOT NULL DEFAULT (datetime('now')),
				FOREIGN KEY ("retreatId") REFERENCES "retreat" ("id") ON DELETE CASCADE,
				FOREIGN KEY ("templateId") REFERENCES "pre_retreat_task_template" ("id") ON DELETE SET NULL,
				FOREIGN KEY ("parentId") REFERENCES "retreat_pre_retreat_task" ("id") ON DELETE CASCADE,
				FOREIGN KEY ("responsibleParticipantId") REFERENCES "participants" ("id") ON DELETE SET NULL
			)
		`);
		await queryRunner.query(
			`CREATE INDEX "IDX_rprt_retreat_due" ON "retreat_pre_retreat_task" ("retreatId", "dueDate")`,
		);
		await queryRunner.query(
			`CREATE INDEX "IDX_rprt_parent" ON "retreat_pre_retreat_task" ("parentId")`,
		);
		await queryRunner.query(
			`CREATE INDEX "IDX_rprt_responsible" ON "retreat_pre_retreat_task" ("responsibleParticipantId")`,
		);

		// 3. Permissions
		await queryRunner.query(`
			INSERT OR IGNORE INTO "permissions" ("resource", "operation", "description") VALUES
			('preRetreatTask', 'read', 'View retreat pre-retreat task checklist'),
			('preRetreatTask', 'manage', 'Create, edit, complete pre-retreat tasks'),
			('preRetreatTaskTemplate', 'read', 'View global pre-retreat task template'),
			('preRetreatTaskTemplate', 'manage', 'Edit global pre-retreat task template')
		`);

		const perms = await queryRunner.query(
			`SELECT id, resource, operation FROM "permissions" WHERE "resource" IN ('preRetreatTask','preRetreatTaskTemplate')`,
		);
		const permMap: Record<string, number> = {};
		perms.forEach((p: any) => (permMap[`${p.resource}:${p.operation}`] = p.id));

		const rolesResult = await queryRunner.query(`SELECT id, name FROM "roles"`);
		const roles: Record<string, number> = {};
		rolesResult.forEach((r: any) => (roles[r.name] = r.id));

		// Espejo exacto de la matriz de roles del Minuto a Minuto.
		const grants: Array<{ role: string; perms: string[] }> = [
			{
				role: 'superadmin',
				perms: [
					'preRetreatTask:read',
					'preRetreatTask:manage',
					'preRetreatTaskTemplate:read',
					'preRetreatTaskTemplate:manage',
				],
			},
			{
				role: 'admin',
				perms: [
					'preRetreatTask:read',
					'preRetreatTask:manage',
					'preRetreatTaskTemplate:read',
					'preRetreatTaskTemplate:manage',
				],
			},
			{
				role: 'region_admin',
				perms: ['preRetreatTask:read', 'preRetreatTask:manage', 'preRetreatTaskTemplate:read'],
			},
			{ role: 'communications', perms: ['preRetreatTask:read'] },
			{ role: 'treasurer', perms: ['preRetreatTask:read'] },
			{ role: 'logistics', perms: ['preRetreatTask:read', 'preRetreatTask:manage'] },
			{ role: 'regular_server', perms: ['preRetreatTask:read'] },
			{ role: 'regular', perms: ['preRetreatTask:read'] },
		];

		for (const { role, perms: ps } of grants) {
			const roleId = roles[role];
			if (!roleId) continue;
			for (const permKey of ps) {
				const permId = permMap[permKey];
				if (!permId) continue;
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
		}
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			`DELETE FROM "role_permissions" WHERE "permissionId" IN (SELECT id FROM "permissions" WHERE "resource" IN ('preRetreatTask','preRetreatTaskTemplate'))`,
		);
		await queryRunner.query(
			`DELETE FROM "permissions" WHERE "resource" IN ('preRetreatTask','preRetreatTaskTemplate')`,
		);
		await queryRunner.query(`DROP INDEX IF EXISTS "IDX_rprt_responsible"`);
		await queryRunner.query(`DROP INDEX IF EXISTS "IDX_rprt_parent"`);
		await queryRunner.query(`DROP INDEX IF EXISTS "IDX_rprt_retreat_due"`);
		await queryRunner.query(`DROP TABLE IF EXISTS "retreat_pre_retreat_task"`);
		await queryRunner.query(`DROP INDEX IF EXISTS "IDX_prt_tpl_parent"`);
		await queryRunner.query(`DROP INDEX IF EXISTS "IDX_prt_tpl_set"`);
		await queryRunner.query(`DROP TABLE IF EXISTS "pre_retreat_task_template"`);
		await queryRunner.query(`DROP INDEX IF EXISTS "IDX_prt_tpl_set_name"`);
		await queryRunner.query(`DROP TABLE IF EXISTS "pre_retreat_task_template_set"`);
	}
}
