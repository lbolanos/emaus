import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * G5 del community membership journey: agrega campos de auditoría a community_member
 * para registrar quién cambió el estado, cuándo, y desde qué estado previo.
 *
 * Usa ALTER TABLE ADD COLUMN (operación aditiva, segura en SQLite — no necesita
 * recreate-table). Idempotente: skip si las columnas ya existen.
 */
export class AddAuditFieldsToCommunityMember20260515000000 implements MigrationInterface {
	name = 'AddAuditFieldsToCommunityMember';
	timestamp = '20260515000000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		const tableInfo = await queryRunner.query(`PRAGMA table_info("community_member")`);
		const existingColumns = new Set(tableInfo.map((col: any) => col.name));

		if (!existingColumns.has('verifiedBy')) {
			await queryRunner.query(
				`ALTER TABLE "community_member" ADD COLUMN "verifiedBy" varchar(36)`,
			);
			console.log('Added verifiedBy column to community_member');
		}

		if (!existingColumns.has('verifiedAt')) {
			await queryRunner.query(`ALTER TABLE "community_member" ADD COLUMN "verifiedAt" datetime`);
			console.log('Added verifiedAt column to community_member');
		}

		if (!existingColumns.has('previousState')) {
			await queryRunner.query(
				`ALTER TABLE "community_member" ADD COLUMN "previousState" varchar(50)`,
			);
			console.log('Added previousState column to community_member');
		}
	}

	public async down(_queryRunner: QueryRunner): Promise<void> {
		// SQLite no soporta DROP COLUMN directamente. Rollback requeriría recreate-table.
		console.warn(
			'[AddAuditFieldsToCommunityMember] Rollback not implemented — SQLite limitation',
		);
	}
}
