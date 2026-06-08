import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Audit log de operaciones de ESCRITURA del dominio:
 *  - participant.* (create/update/delete/import/checkin/confirm/anonymize)
 *  - table.*       (create/update/delete/assign_leader/assign_walker/rebalance/clear_all)
 *  - bed.* / house.*
 *  - payment.*     (create/update/delete)
 *  - retreat.*     (create/update/memory.*)
 *
 * Tabla genérica y append-only, separada de `audit_logs` (RBAC) y `community_audit_log`.
 * Es una tabla hoja (sin FKs entrantes); guardamos IDs históricos sin FK CASCADE para
 * forense. Igual que `CreateCommunityAuditLog`, deshabilitamos la transacción que TypeORM
 * envuelve por defecto porque el `down()` contiene `DROP TABLE` (regla del skill
 * sqlite-migrations sobre cualquier migration con DROP TABLE).
 */
export class CreateDomainAuditLog20260606000000 implements MigrationInterface {
	name = 'CreateDomainAuditLog';
	timestamp = '20260606000000';
	transaction = false;

	public async up(queryRunner: QueryRunner): Promise<void> {
		const tableExists = await queryRunner.query(
			`SELECT name FROM sqlite_master WHERE type='table' AND name='domain_audit_log'`,
		);
		if (tableExists.length > 0) {
			console.log('domain_audit_log table already exists, skipping...');
			return;
		}

		await queryRunner.query(`
			CREATE TABLE "domain_audit_log" (
				"id" VARCHAR(36) PRIMARY KEY NOT NULL,
				"actorUserId" VARCHAR(36),
				"action" VARCHAR(100) NOT NULL,
				"resourceType" VARCHAR(50) NOT NULL,
				"resourceId" VARCHAR(36),
				"retreatId" VARCHAR(36),
				"oldValues" TEXT,
				"newValues" TEXT,
				"metadata" TEXT,
				"ipAddress" VARCHAR(64),
				"userAgent" VARCHAR(255),
				"createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
			)
		`);
		await queryRunner.query(
			`CREATE INDEX "idx_domain_audit_log_resource" ON "domain_audit_log" ("resourceType", "resourceId")`,
		);
		await queryRunner.query(
			`CREATE INDEX "idx_domain_audit_log_retreat" ON "domain_audit_log" ("retreatId")`,
		);
		await queryRunner.query(
			`CREATE INDEX "idx_domain_audit_log_actor" ON "domain_audit_log" ("actorUserId")`,
		);
		await queryRunner.query(
			`CREATE INDEX "idx_domain_audit_log_action" ON "domain_audit_log" ("action", "createdAt")`,
		);
		console.log('Created domain_audit_log table with indexes');
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`DROP TABLE IF EXISTS "domain_audit_log"`);
	}
}
