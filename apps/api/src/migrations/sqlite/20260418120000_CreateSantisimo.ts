import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateSantisimo20260418120000 implements MigrationInterface {
	name = 'CreateSantisimo20260418120000';
	timestamp = '20260418120000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		// 1. Add santisimoEnabled flag to retreat
		await queryRunner.query(
			`ALTER TABLE retreat ADD COLUMN "santisimoEnabled" boolean NOT NULL DEFAULT 0`,
		);

		// 2. Create santisimo_slot table
		await queryRunner.query(`
			CREATE TABLE "santisimo_slot" (
				"id" varchar PRIMARY KEY NOT NULL,
				"retreatId" varchar NOT NULL,
				"startTime" datetime NOT NULL,
				"endTime" datetime NOT NULL,
				"capacity" integer NOT NULL DEFAULT 1,
				"isDisabled" boolean NOT NULL DEFAULT 0,
				"intention" text,
				"notes" text,
				"createdAt" datetime NOT NULL DEFAULT (datetime('now')),
				"updatedAt" datetime NOT NULL DEFAULT (datetime('now')),
				FOREIGN KEY ("retreatId") REFERENCES "retreat" ("id") ON DELETE CASCADE
			)
		`);
		await queryRunner.query(
			`CREATE UNIQUE INDEX "IDX_santisimo_slot_retreat_start" ON "santisimo_slot" ("retreatId", "startTime")`,
		);

		// 3. Create santisimo_signup table
		await queryRunner.query(`
			CREATE TABLE "santisimo_signup" (
				"id" varchar PRIMARY KEY NOT NULL,
				"slotId" varchar NOT NULL,
				"name" varchar(120) NOT NULL,
				"phone" varchar(40),
				"email" varchar(160),
				"userId" varchar,
				"cancelToken" varchar(48),
				"ipAddress" varchar(64),
				"createdAt" datetime NOT NULL DEFAULT (datetime('now')),
				FOREIGN KEY ("slotId") REFERENCES "santisimo_slot" ("id") ON DELETE CASCADE,
				FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE SET NULL
			)
		`);
		await queryRunner.query(
			`CREATE INDEX "IDX_santisimo_signup_slot" ON "santisimo_signup" ("slotId")`,
		);
		await queryRunner.query(
			`CREATE UNIQUE INDEX "IDX_santisimo_signup_cancel_token" ON "santisimo_signup" ("cancelToken") WHERE "cancelToken" IS NOT NULL`,
		);

		// 4. Register new permissions
		await queryRunner.query(`
			INSERT OR IGNORE INTO "permissions" ("resource", "operation", "description") VALUES
			('santisimo', 'read', 'View Santisimo schedule and signups'),
			('santisimo', 'manage', 'Create, edit, delete Santisimo slots and signups')
		`);

		// 5. Grant permissions to roles
		const permResult = await queryRunner.query(
			`SELECT id, resource, operation FROM "permissions" WHERE "resource" = 'santisimo'`,
		);
		const perms: Record<string, number> = {};
		permResult.forEach((p: any) => (perms[p.operation] = p.id));

		const rolesResult = await queryRunner.query(`SELECT id, name FROM "roles"`);
		const roles: Record<string, number> = {};
		rolesResult.forEach((r: any) => (roles[r.name] = r.id));

		const grants: Array<{ role: string; ops: string[] }> = [
			{ role: 'superadmin', ops: ['read', 'manage'] },
			{ role: 'admin', ops: ['read', 'manage'] },
			{ role: 'region_admin', ops: ['read', 'manage'] },
			{ role: 'communications', ops: ['read', 'manage'] },
			{ role: 'treasurer', ops: ['read'] },
			{ role: 'logistics', ops: ['read'] },
			{ role: 'regular_server', ops: ['read'] },
			{ role: 'regular', ops: ['read'] },
		];

		for (const { role, ops } of grants) {
			const roleId = roles[role];
			if (!roleId) continue;
			for (const op of ops) {
				const permId = perms[op];
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
			`DELETE FROM "role_permissions" WHERE "permissionId" IN (SELECT id FROM "permissions" WHERE "resource" = 'santisimo')`,
		);
		await queryRunner.query(`DELETE FROM "permissions" WHERE "resource" = 'santisimo'`);
		await queryRunner.query(`DROP TABLE IF EXISTS "santisimo_signup"`);
		await queryRunner.query(`DROP TABLE IF EXISTS "santisimo_slot"`);
		// NOTE: santisimoEnabled column on retreat is left in place (SQLite can't drop easily)
	}
}
