import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateMinutoAMinuto20260423120000 implements MigrationInterface {
	name = 'CreateMinutoAMinuto20260423120000';
	timestamp = '20260423120000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		// 1a. schedule_template_set (agrupa templates: Colombia, México, etc.)
		await queryRunner.query(`
			CREATE TABLE "schedule_template_set" (
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
		await queryRunner.query(`CREATE UNIQUE INDEX "IDX_sched_tpl_set_name" ON "schedule_template_set" ("name")`);

		// 1b. schedule_template (global, agrupado por set)
		await queryRunner.query(`
			CREATE TABLE "schedule_template" (
				"id" varchar PRIMARY KEY NOT NULL,
				"templateSetId" varchar REFERENCES "schedule_template_set" ("id") ON DELETE CASCADE,
				"name" varchar NOT NULL,
				"description" text,
				"type" varchar NOT NULL DEFAULT 'otro',
				"defaultDurationMinutes" integer NOT NULL DEFAULT 15,
				"defaultOrder" integer NOT NULL DEFAULT 0,
				"defaultDay" integer NOT NULL DEFAULT 1,
				"defaultStartTime" varchar,
				"requiresResponsable" boolean NOT NULL DEFAULT 0,
				"allowedResponsibilityTypes" text,
				"responsabilityName" varchar,
				"musicTrackUrl" text,
				"palanquitaNotes" text,
				"planBNotes" text,
				"blocksSantisimoAttendance" boolean NOT NULL DEFAULT 0,
				"locationHint" varchar,
				"isActive" boolean NOT NULL DEFAULT 1,
				"createdAt" datetime NOT NULL DEFAULT (datetime('now')),
				"updatedAt" datetime NOT NULL DEFAULT (datetime('now'))
			)
		`);
		await queryRunner.query(`CREATE INDEX "IDX_schedule_template_set" ON "schedule_template" ("templateSetId")`);

		// 2. retreat_schedule_item (per-retreat)
		await queryRunner.query(`
			CREATE TABLE "retreat_schedule_item" (
				"id" varchar PRIMARY KEY NOT NULL,
				"retreatId" varchar NOT NULL,
				"scheduleTemplateId" varchar,
				"name" varchar NOT NULL,
				"type" varchar NOT NULL DEFAULT 'otro',
				"day" integer NOT NULL DEFAULT 1,
				"startTime" datetime NOT NULL,
				"endTime" datetime NOT NULL,
				"durationMinutes" integer NOT NULL DEFAULT 15,
				"orderInDay" integer NOT NULL DEFAULT 0,
				"status" varchar NOT NULL DEFAULT 'pending',
				"responsabilityId" varchar,
				"location" text,
				"notes" text,
				"musicTrackUrl" text,
				"palanquitaNotes" text,
				"planBNotes" text,
				"blocksSantisimoAttendance" boolean NOT NULL DEFAULT 0,
				"actualStartTime" datetime,
				"actualEndTime" datetime,
				"createdAt" datetime NOT NULL DEFAULT (datetime('now')),
				"updatedAt" datetime NOT NULL DEFAULT (datetime('now')),
				FOREIGN KEY ("retreatId") REFERENCES "retreat" ("id") ON DELETE CASCADE,
				FOREIGN KEY ("scheduleTemplateId") REFERENCES "schedule_template" ("id") ON DELETE SET NULL,
				FOREIGN KEY ("responsabilityId") REFERENCES "retreat_responsibilities" ("id") ON DELETE SET NULL
			)
		`);
		await queryRunner.query(
			`CREATE INDEX "IDX_rsi_retreat_start" ON "retreat_schedule_item" ("retreatId", "startTime")`,
		);

		// 3. retreat_schedule_item_responsable (N:N item↔participant)
		await queryRunner.query(`
			CREATE TABLE "retreat_schedule_item_responsable" (
				"id" varchar PRIMARY KEY NOT NULL,
				"scheduleItemId" varchar NOT NULL,
				"participantId" varchar NOT NULL,
				"role" varchar,
				"createdAt" datetime NOT NULL DEFAULT (datetime('now')),
				FOREIGN KEY ("scheduleItemId") REFERENCES "retreat_schedule_item" ("id") ON DELETE CASCADE,
				FOREIGN KEY ("participantId") REFERENCES "participants" ("id") ON DELETE CASCADE
			)
		`);
		await queryRunner.query(
			`CREATE INDEX "IDX_rsir_item" ON "retreat_schedule_item_responsable" ("scheduleItemId")`,
		);
		await queryRunner.query(
			`CREATE INDEX "IDX_rsir_participant" ON "retreat_schedule_item_responsable" ("participantId")`,
		);

		// 4. Extend santisimo_signup with angelito + autoAssigned flags
		await queryRunner.query(
			`ALTER TABLE "santisimo_signup" ADD COLUMN "isAngelito" boolean NOT NULL DEFAULT 0`,
		);
		await queryRunner.query(
			`ALTER TABLE "santisimo_signup" ADD COLUMN "autoAssigned" boolean NOT NULL DEFAULT 0`,
		);
		await queryRunner.query(
			`ALTER TABLE "santisimo_signup" ADD COLUMN "participantId" varchar`,
		);

		// 5. Extend santisimo_slot with mealWindow flag
		await queryRunner.query(
			`ALTER TABLE "santisimo_slot" ADD COLUMN "mealWindow" boolean NOT NULL DEFAULT 0`,
		);

		// 6. Permissions
		await queryRunner.query(`
			INSERT OR IGNORE INTO "permissions" ("resource", "operation", "description") VALUES
			('schedule', 'read', 'View retreat minuto-a-minuto schedule'),
			('schedule', 'manage', 'Create, edit, reorder retreat schedule items'),
			('scheduleTemplate', 'read', 'View global schedule template'),
			('scheduleTemplate', 'manage', 'Edit global schedule template')
		`);

		const perms = await queryRunner.query(
			`SELECT id, resource, operation FROM "permissions" WHERE "resource" IN ('schedule','scheduleTemplate')`,
		);
		const permMap: Record<string, number> = {};
		perms.forEach((p: any) => (permMap[`${p.resource}:${p.operation}`] = p.id));

		const rolesResult = await queryRunner.query(`SELECT id, name FROM "roles"`);
		const roles: Record<string, number> = {};
		rolesResult.forEach((r: any) => (roles[r.name] = r.id));

		const grants: Array<{ role: string; perms: string[] }> = [
			{ role: 'superadmin', perms: ['schedule:read', 'schedule:manage', 'scheduleTemplate:read', 'scheduleTemplate:manage'] },
			{ role: 'admin', perms: ['schedule:read', 'schedule:manage', 'scheduleTemplate:read', 'scheduleTemplate:manage'] },
			{ role: 'region_admin', perms: ['schedule:read', 'schedule:manage', 'scheduleTemplate:read'] },
			{ role: 'communications', perms: ['schedule:read'] },
			{ role: 'treasurer', perms: ['schedule:read'] },
			{ role: 'logistics', perms: ['schedule:read', 'schedule:manage'] },
			{ role: 'regular_server', perms: ['schedule:read'] },
			{ role: 'regular', perms: ['schedule:read'] },
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
			`DELETE FROM "role_permissions" WHERE "permissionId" IN (SELECT id FROM "permissions" WHERE "resource" IN ('schedule','scheduleTemplate'))`,
		);
		await queryRunner.query(
			`DELETE FROM "permissions" WHERE "resource" IN ('schedule','scheduleTemplate')`,
		);
		await queryRunner.query(`DROP TABLE IF EXISTS "retreat_schedule_item_responsable"`);
		await queryRunner.query(`DROP TABLE IF EXISTS "retreat_schedule_item"`);
		await queryRunner.query(`DROP INDEX IF EXISTS "IDX_schedule_template_set"`);
		await queryRunner.query(`DROP TABLE IF EXISTS "schedule_template"`);
		await queryRunner.query(`DROP INDEX IF EXISTS "IDX_sched_tpl_set_name"`);
		await queryRunner.query(`DROP TABLE IF EXISTS "schedule_template_set"`);
		// Added columns on santisimo_* left in place (SQLite cannot easily drop columns).
	}
}
