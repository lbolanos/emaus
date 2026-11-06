import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Puente WhatsApp de solo lectura del retiro (specs/whatsapp-inbox, M1).
 *
 * Tres tablas nuevas + seeds de permisos. Plantilla simple idempotente:
 * solo CREATE TABLE/INDEX IF NOT EXISTS e inserts guardados — sin recreate,
 * sin DROP de tablas preexistentes, sin PRAGMA foreign_keys.
 *
 * Tablas:
 *  - whatsapp_bridge_link: un vínculo por staff y retiro (UNIQUE userId+retreatId).
 *    FKs → retreat / users con CASCADE (el borrado del retiro o del usuario
 *    limpia sus vínculos; el DELETE del link borra sus mensajes y read-state).
 *  - whatsapp_inbox_message: solo mensajes de caminantes que pasaron la
 *    whitelist de ingesta (D4). retreatId desnormalizado SIN FK física a
 *    propósito: las queries de bandeja y purga van por retiro y el cascade
 *    real lo hace el link padre.
 *  - whatsapp_inbox_read_state: no-leídos por usuario (D11).
 *
 * Permisos: whatsappInbox:read y whatsappInbox:manage para superadmin, admin,
 * logistics y communications (regular_server y treasurer sin nada).
 */
export class CreateWhatsappBridge20261107120000 implements MigrationInterface {
	name = 'CreateWhatsappBridge20261107120000';
	timestamp = '20261107120000';

	// DDL + data seeds en una sola migración; el runner propio respeta el flag
	// desde 2026-09-08 (consistencia con las demás migraciones de permisos).
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
		await queryRunner.query(`
			CREATE TABLE IF NOT EXISTS "whatsapp_bridge_link" (
				"id" varchar(36) PRIMARY KEY,
				"retreatId" varchar(36) NOT NULL,
				"userId" varchar(36) NOT NULL,
				"status" varchar(20) NOT NULL DEFAULT ('pending')
					CHECK ("status" IN ('pending','qr','connected','error','logged_out','expired')),
				"linkedJid" varchar(64),
				"linkedPhone" varchar(20),
				"storePath" varchar(255) NOT NULL,
				"lastError" text,
				"connectedAt" datetime,
				"lastSyncAt" datetime,
				"createdAt" datetime DEFAULT (datetime('now')),
				"updatedAt" datetime DEFAULT (datetime('now')),
				CONSTRAINT "FK_wa_bridge_link_retreat" FOREIGN KEY ("retreatId") REFERENCES "retreat" ("id") ON DELETE CASCADE,
				CONSTRAINT "FK_wa_bridge_link_user" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE
			)
		`);
		await queryRunner.query(
			`CREATE UNIQUE INDEX IF NOT EXISTS "UQ_wa_bridge_link_user_retreat" ON "whatsapp_bridge_link" ("userId", "retreatId")`,
		);
		await queryRunner.query(
			`CREATE INDEX IF NOT EXISTS "IDX_wa_bridge_link_retreat_status" ON "whatsapp_bridge_link" ("retreatId", "status")`,
		);
		await queryRunner.query(
			`CREATE INDEX IF NOT EXISTS "IDX_wa_bridge_link_status" ON "whatsapp_bridge_link" ("status")`,
		);

		await queryRunner.query(`
			CREATE TABLE IF NOT EXISTS "whatsapp_inbox_message" (
				"id" varchar(36) PRIMARY KEY,
				"linkId" varchar(36) NOT NULL,
				"retreatId" varchar(36) NOT NULL,
				"chatJid" varchar(64) NOT NULL,
				"chatPhone" varchar(20) NOT NULL,
				"waMessageId" varchar(128) NOT NULL,
				"timestamp" datetime NOT NULL,
				"fromMe" boolean NOT NULL DEFAULT (0),
				"body" text,
				"messageType" varchar(32) NOT NULL DEFAULT ('text'),
				"createdAt" datetime DEFAULT (datetime('now')),
				CONSTRAINT "FK_wa_inbox_message_link" FOREIGN KEY ("linkId") REFERENCES "whatsapp_bridge_link" ("id") ON DELETE CASCADE
			)
		`);
		await queryRunner.query(
			`CREATE UNIQUE INDEX IF NOT EXISTS "UQ_wa_inbox_message_dedupe" ON "whatsapp_inbox_message" ("linkId", "waMessageId")`,
		);
		await queryRunner.query(
			`CREATE INDEX IF NOT EXISTS "IDX_wa_inbox_message_thread" ON "whatsapp_inbox_message" ("retreatId", "chatJid", "timestamp")`,
		);
		await queryRunner.query(
			`CREATE INDEX IF NOT EXISTS "IDX_wa_inbox_message_retreat_ts" ON "whatsapp_inbox_message" ("retreatId", "timestamp")`,
		);

		await queryRunner.query(`
			CREATE TABLE IF NOT EXISTS "whatsapp_inbox_read_state" (
				"id" varchar(36) PRIMARY KEY,
				"userId" varchar(36) NOT NULL,
				"retreatId" varchar(36) NOT NULL,
				"chatJid" varchar(64) NOT NULL,
				"lastSeenMessageTimestamp" datetime NOT NULL,
				"updatedAt" datetime DEFAULT (datetime('now')),
				CONSTRAINT "FK_wa_inbox_read_state_user" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE
			)
		`);
		await queryRunner.query(
			`CREATE UNIQUE INDEX IF NOT EXISTS "UQ_wa_inbox_read_state_user_chat" ON "whatsapp_inbox_read_state" ("userId", "retreatId", "chatJid")`,
		);

		const roles = ['superadmin', 'admin', 'logistics', 'communications'];
		const permissions = [
			[
				'whatsappInbox',
				'read',
				'View the retreat WhatsApp inbox (read-only bridge, walkers only)',
			],
			[
				'whatsappInbox',
				'manage',
				'Link or unlink own WhatsApp account for the retreat inbox',
			],
		] as const;
		for (const [resource, operation, description] of permissions) {
			const permId = await this.ensurePermission(
				queryRunner,
				resource,
				operation,
				description,
			);
			if (!permId) continue;
			for (const roleName of roles) {
				const roleId = await this.getRoleId(queryRunner, roleName);
				if (roleId) {
					await this.grantPermission(queryRunner, roleId, permId);
				}
			}
		}
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			`DELETE FROM "role_permissions" WHERE "permissionId" IN (
				SELECT id FROM "permissions" WHERE "resource" = 'whatsappInbox'
			)`,
		);
		await queryRunner.query(
			`DELETE FROM "permissions" WHERE "resource" = 'whatsappInbox'`,
		);
		// Hijos primero: message y read_state cuelgan de link (CASCADE) o de users.
		await queryRunner.query(`DROP TABLE IF EXISTS "whatsapp_inbox_read_state"`);
		await queryRunner.query(`DROP TABLE IF EXISTS "whatsapp_inbox_message"`);
		await queryRunner.query(`DROP TABLE IF EXISTS "whatsapp_bridge_link"`);
	}
}
