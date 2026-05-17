import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Audit log para acciones críticas en COMMUNITY:
 *  - community.update / community.delete
 *  - community.admin.invite / community.admin.revoke
 *  - community.member.remove / community.member.state_change
 *  - community.link.token_accepted (Vuln 2 fix)
 *
 * Tabla separada de `audit_logs` (la existente es retreat-scoped). Append-only.
 * Sin FK CASCADE — si una community o user se elimina, el log persiste con IDs
 * históricos para forense.
 */
export class CreateCommunityAuditLog20260516000000 implements MigrationInterface {
	name = 'CreateCommunityAuditLog';
	timestamp = '20260516000000';
	// down() does DROP TABLE; we disable TypeORM's wrapping transaction so the
	// `PRAGMA foreign_keys = OFF` (set by sqlite-migrations skill guidelines)
	// would be honored if FK children ever appear. Today the table is a leaf,
	// but the safety-guard test enforces this on any migration containing
	// DROP TABLE — see `.ruler/skills/sqlite-migrations/SKILL.md`.
	transaction = false;

	public async up(queryRunner: QueryRunner): Promise<void> {
		const tableExists = await queryRunner.query(
			`SELECT name FROM sqlite_master WHERE type='table' AND name='community_audit_log'`,
		);
		if (tableExists.length > 0) {
			console.log('community_audit_log table already exists, skipping...');
			return;
		}

		await queryRunner.query(`
			CREATE TABLE "community_audit_log" (
				"id" VARCHAR(36) PRIMARY KEY NOT NULL,
				"actorUserId" VARCHAR(36),
				"action" VARCHAR(100) NOT NULL,
				"resourceType" VARCHAR(50) NOT NULL,
				"resourceId" VARCHAR(36),
				"communityId" VARCHAR(36),
				"metadata" TEXT,
				"ipAddress" VARCHAR(64),
				"userAgent" VARCHAR(255),
				"createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
			)
		`);
		await queryRunner.query(
			`CREATE INDEX "idx_community_audit_log_community" ON "community_audit_log" ("communityId")`,
		);
		await queryRunner.query(
			`CREATE INDEX "idx_community_audit_log_actor" ON "community_audit_log" ("actorUserId")`,
		);
		await queryRunner.query(
			`CREATE INDEX "idx_community_audit_log_action" ON "community_audit_log" ("action", "createdAt")`,
		);
		console.log('Created community_audit_log table with indexes');
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`DROP TABLE IF EXISTS "community_audit_log"`);
	}
}
