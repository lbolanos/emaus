import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateTelemetryTables20251026000000 implements MigrationInterface {
	name = 'CreateTelemetryTables';
	timestamp = '20251026000000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		console.log('📊 Creating telemetry tables...');

		// Create telemetry_metrics table
		await queryRunner.query(`
			CREATE TABLE IF NOT EXISTS "telemetry_metrics" (
				"id" VARCHAR(36) PRIMARY KEY NOT NULL,
				"metricType" VARCHAR(255) NOT NULL,
				"unit" VARCHAR(255) NOT NULL,
				"value" DECIMAL(10,3) NOT NULL,
				"tags" JSON,
				"metadata" JSON,
				"userId" VARCHAR(36),
				"retreatId" VARCHAR(36),
				"endpoint" TEXT,
				"component" TEXT,
				"createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
				FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE SET NULL,
				FOREIGN KEY ("retreatId") REFERENCES "retreat" ("id") ON DELETE SET NULL
			)
		`);

		await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_telemetry_metrics_metricType_createdAt" ON "telemetry_metrics" ("metricType", "createdAt")`);
		await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_telemetry_metrics_userId" ON "telemetry_metrics" ("userId")`);
		await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_telemetry_metrics_retreatId" ON "telemetry_metrics" ("retreatId")`);
		await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_telemetry_metrics_tags" ON "telemetry_metrics" ("tags")`);

		// Create telemetry_events table
		await queryRunner.query(`
			CREATE TABLE IF NOT EXISTS "telemetry_events" (
				"id" VARCHAR(36) PRIMARY KEY NOT NULL,
				"eventType" VARCHAR(255) NOT NULL,
				"severity" VARCHAR(255) NOT NULL,
				"description" TEXT NOT NULL,
				"resourceType" TEXT,
				"resourceId" TEXT,
				"eventData" JSON,
				"oldValues" JSON,
				"newValues" JSON,
				"ipAddress" TEXT,
				"userAgent" TEXT,
				"userId" VARCHAR(36),
				"retreatId" VARCHAR(36),
				"endpoint" TEXT,
				"component" TEXT,
				"createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
				FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE SET NULL,
				FOREIGN KEY ("retreatId") REFERENCES "retreat" ("id") ON DELETE SET NULL
			)
		`);

		await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_telemetry_events_eventType_severity_createdAt" ON "telemetry_events" ("eventType", "severity", "createdAt")`);
		await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_telemetry_events_userId" ON "telemetry_events" ("userId")`);
		await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_telemetry_events_retreatId" ON "telemetry_events" ("retreatId")`);
		await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_telemetry_events_resourceType_resourceId" ON "telemetry_events" ("resourceType", "resourceId")`);

		// Create telemetry_sessions table
		await queryRunner.query(`
			CREATE TABLE IF NOT EXISTS "telemetry_sessions" (
				"id" VARCHAR(36) PRIMARY KEY NOT NULL,
				"userId" VARCHAR(36) NOT NULL,
				"sessionId" TEXT,
				"ipAddress" TEXT,
				"userAgent" TEXT,
				"referrer" TEXT,
				"browserInfo" JSON,
				"geolocation" JSON,
				"sessionData" JSON,
				"isActive" BOOLEAN DEFAULT 1,
				"pageViews" INTEGER DEFAULT 0,
				"interactions" INTEGER DEFAULT 0,
				"errors" INTEGER DEFAULT 0,
				"duration" DECIMAL(10,3) DEFAULT 0,
				"createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
				"lastActivity" DATETIME,
				"endedAt" DATETIME,
				FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE
			)
		`);

		await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_telemetry_sessions_userId_isActive" ON "telemetry_sessions" ("userId", "isActive")`);
		await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_telemetry_sessions_createdAt" ON "telemetry_sessions" ("createdAt")`);
		await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_telemetry_sessions_lastActivity" ON "telemetry_sessions" ("lastActivity")`);

		// Create telemetry_dashboards table
		await queryRunner.query(`
			CREATE TABLE IF NOT EXISTS "telemetry_dashboards" (
				"id" VARCHAR(36) PRIMARY KEY NOT NULL,
				"name" TEXT NOT NULL,
				"description" TEXT,
				"dashboardType" VARCHAR(255) NOT NULL,
				"layout" JSON NOT NULL,
				"filters" JSON,
				"refreshInterval" JSON,
				"isDefault" BOOLEAN DEFAULT 0,
				"isActive" BOOLEAN DEFAULT 1,
				"isPublic" BOOLEAN DEFAULT 0,
				"userId" VARCHAR(36) NOT NULL,
				"createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
				"updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
				FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE
			)
		`);

		await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_telemetry_dashboards_userId_isDefault" ON "telemetry_dashboards" ("userId", "isDefault")`);
		await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_telemetry_dashboards_dashboardType" ON "telemetry_dashboards" ("dashboardType")`);
		await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_telemetry_dashboards_isActive" ON "telemetry_dashboards" ("isActive")`);

		console.log('📊 Created telemetry tables');

		// Create telemetry:read permission
		console.log('🔐 Creating telemetry:read permission...');
		await queryRunner.query(`
			INSERT OR IGNORE INTO "permissions" ("resource", "operation", "description") 
			VALUES ('telemetry', 'read', 'Access telemetry monitoring and analytics')
		`);

		// Assign telemetry:read permission ONLY to superadmin role
		console.log('👑 Assigning telemetry:read permission to superadmin only...');
		const superadminRole = await queryRunner.query(
			`SELECT id FROM "roles" WHERE "name" = 'superadmin' LIMIT 1`,
		);

		const telemetryReadPerm = await queryRunner.query(
			`SELECT id FROM "permissions" WHERE "resource" = 'telemetry' AND "operation" = 'read' LIMIT 1`,
		);

		if (superadminRole.length > 0 && telemetryReadPerm.length > 0) {
			await queryRunner.query(
				`INSERT OR IGNORE INTO "role_permissions" ("roleId", "permissionId") VALUES (?, ?)`,
				[superadminRole[0].id, telemetryReadPerm[0].id],
			);
			console.log('✅ Telemetry:read permission assigned to superadmin role only');
		} else {
			console.log('⚠️ Superadmin role or telemetry:read permission not found');
		}

		console.log('🎉 Telemetry setup completed');
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		console.log('🧹 Removing telemetry setup...');

		// Remove telemetry permission assignments
		await queryRunner.query(`
			DELETE FROM "role_permissions" 
			WHERE "permissionId" IN (
				SELECT id FROM "permissions" WHERE "resource" = 'telemetry'
			)
		`);

		// Remove telemetry permissions
		await queryRunner.query(`DELETE FROM "permissions" WHERE "resource" = 'telemetry'`);

		// Drop telemetry tables
		await queryRunner.query(`DROP TABLE IF EXISTS "telemetry_dashboards"`);
		await queryRunner.query(`DROP TABLE IF EXISTS "telemetry_sessions"`);
		await queryRunner.query(`DROP TABLE IF EXISTS "telemetry_events"`);
		await queryRunner.query(`DROP TABLE IF EXISTS "telemetry_metrics"`);

		console.log('🧹 Telemetry teardown completed');
	}
}
