import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Índice compuesto (retreatId, createdAt) para la query principal del trail de
 * auditoría: WHERE retreatId = ? ORDER BY createdAt DESC LIMIT/OFFSET (+ filtros
 * de fecha). El índice simple por retreatId obliga a un sort por createdAt.
 *
 * CREATE/DROP INDEX es no destructivo — no requiere recreate-table ni
 * consideraciones de FKs.
 */
export class AddDomainAuditRetreatCreatedAtIndex20260610130000 implements MigrationInterface {
	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`
			CREATE INDEX IF NOT EXISTS "idx_domain_audit_log_retreat_created"
			ON "domain_audit_log" ("retreatId", "createdAt")
		`);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`
			DROP INDEX IF EXISTS "idx_domain_audit_log_retreat_created"
		`);
	}
}
