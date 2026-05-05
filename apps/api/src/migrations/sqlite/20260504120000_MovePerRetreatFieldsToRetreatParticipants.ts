import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Move per-retreat participant fields from `participants` (global) to
 * `retreat_participants` (per-retreat).
 *
 * Rationale: a single Participant can attend multiple retreats. Fields like
 * scholarship status, palancas, who invited them, and pickup logistics differ
 * per inscription. Storing them globally on `participants` made values bleed
 * across retreats.
 *
 * Fields moved (15 total):
 *   - Scholarship: isScholarship, scholarshipAmount
 *   - Palancas:    palancasCoordinator, palancasRequested,
 *                  palancasReceived, palancasNotes
 *   - Inviter:     invitedBy, isInvitedByEmausMember,
 *                  inviterHomePhone, inviterWorkPhone,
 *                  inviterCellPhone, inviterEmail
 *   - Logistics:   pickupLocation, arrivesOnOwn, requestsSingleRoom
 *
 * Excluded (handled elsewhere):
 *   - tshirtSize, needsWhiteShirt/BlueShirt/Jacket — already per-retreat via
 *     `participant_shirt_size` (see docs/shirt-types.md).
 *
 * Also creates the permission `participant:viewScholarshipAmount` and grants
 * it to the `admin` and `treasurer` roles.
 *
 * The legacy columns on `participants` are kept as a readable fallback. A
 * future migration can drop them once nothing reads them directly.
 */
export class MovePerRetreatFieldsToRetreatParticipants20260504120000
	implements MigrationInterface
{
	name = 'MovePerRetreatFieldsToRetreatParticipants20260504120000';
	timestamp = '20260504120000';

	// ----- column descriptors -----
	private readonly columns: Array<{
		name: string;
		ddl: string;
		legacyOnParticipants: boolean;
	}> = [
		// Scholarship
		{
			name: 'isScholarship',
			ddl: '"isScholarship" boolean NOT NULL DEFAULT 0',
			legacyOnParticipants: true,
		},
		{
			name: 'scholarshipAmount',
			ddl: '"scholarshipAmount" DECIMAL(10,2) NULL',
			legacyOnParticipants: true,
		},
		// Palancas
		{
			name: 'palancasCoordinator',
			ddl: '"palancasCoordinator" varchar NULL',
			legacyOnParticipants: true,
		},
		{
			name: 'palancasRequested',
			ddl: '"palancasRequested" boolean NULL',
			legacyOnParticipants: true,
		},
		{
			name: 'palancasReceived',
			ddl: '"palancasReceived" text NULL',
			legacyOnParticipants: true,
		},
		{
			name: 'palancasNotes',
			ddl: '"palancasNotes" text NULL',
			legacyOnParticipants: true,
		},
		// Inviter
		{
			name: 'invitedBy',
			ddl: '"invitedBy" varchar NULL',
			legacyOnParticipants: true,
		},
		{
			name: 'isInvitedByEmausMember',
			ddl: '"isInvitedByEmausMember" boolean NULL',
			legacyOnParticipants: true,
		},
		{
			name: 'inviterHomePhone',
			ddl: '"inviterHomePhone" varchar NULL',
			legacyOnParticipants: true,
		},
		{
			name: 'inviterWorkPhone',
			ddl: '"inviterWorkPhone" varchar NULL',
			legacyOnParticipants: true,
		},
		{
			name: 'inviterCellPhone',
			ddl: '"inviterCellPhone" varchar NULL',
			legacyOnParticipants: true,
		},
		{
			name: 'inviterEmail',
			ddl: '"inviterEmail" varchar NULL',
			legacyOnParticipants: true,
		},
		// Logistics
		{
			name: 'pickupLocation',
			ddl: '"pickupLocation" varchar NULL',
			legacyOnParticipants: true,
		},
		{
			name: 'arrivesOnOwn',
			ddl: '"arrivesOnOwn" boolean NULL',
			legacyOnParticipants: true,
		},
		{
			name: 'requestsSingleRoom',
			ddl: '"requestsSingleRoom" boolean NULL',
			legacyOnParticipants: true,
		},
	];

	// ----- helpers -----
	private async hasColumn(
		queryRunner: QueryRunner,
		table: string,
		column: string,
	): Promise<boolean> {
		const cols = await queryRunner.query(`PRAGMA table_info("${table}")`);
		return cols.some((c: any) => c.name === column);
	}

	private async getRoleId(
		queryRunner: QueryRunner,
		roleName: string,
	): Promise<string | null> {
		const result = await queryRunner.query(
			`SELECT id FROM "roles" WHERE "name" = ? LIMIT 1`,
			[roleName],
		);
		return result.length > 0 ? result[0].id : null;
	}

	private async ensurePermission(
		queryRunner: QueryRunner,
		resource: string,
		operation: string,
		description: string,
	): Promise<string> {
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
		return created[0].id;
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
		if (existing[0].count === 0) {
			await queryRunner.query(
				`INSERT INTO "role_permissions" ("roleId", "permissionId", "createdAt") VALUES (?, ?, datetime('now'))`,
				[roleId, permissionId],
			);
		}
	}

	// ----- up / down -----
	public async up(queryRunner: QueryRunner): Promise<void> {
		// 1. Add columns to retreat_participants (idempotent).
		for (const col of this.columns) {
			if (!(await this.hasColumn(queryRunner, 'retreat_participants', col.name))) {
				await queryRunner.query(
					`ALTER TABLE "retreat_participants" ADD COLUMN ${col.ddl}`,
				);
			}
		}

		// 2. Backfill from participants (one UPDATE per column).
		// SQLite does not support multi-column UPDATE FROM cleanly; correlated
		// subqueries are the portable choice.
		for (const col of this.columns) {
			if (!col.legacyOnParticipants) continue;
			if (!(await this.hasColumn(queryRunner, 'participants', col.name))) continue;

			// Boolean NOT NULL columns need COALESCE so they get 0 instead of NULL.
			const isNotNull = col.ddl.includes('NOT NULL');
			const valueExpr = isNotNull
				? `COALESCE((SELECT p."${col.name}" FROM "participants" p WHERE p."id" = "retreat_participants"."participantId"), 0)`
				: `(SELECT p."${col.name}" FROM "participants" p WHERE p."id" = "retreat_participants"."participantId")`;

			await queryRunner.query(
				`UPDATE "retreat_participants" SET "${col.name}" = ${valueExpr}`,
			);
		}

		// 3. Permission: participant:viewScholarshipAmount → admin, treasurer.
		const permId = await this.ensurePermission(
			queryRunner,
			'participant',
			'viewScholarshipAmount',
			'View the scholarship amount on participants (financial-sensitive field)',
		);
		for (const roleName of ['admin', 'treasurer']) {
			const roleId = await this.getRoleId(queryRunner, roleName);
			if (roleId) {
				await this.grantPermission(queryRunner, roleId, permId);
			}
		}
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		// Revoke + delete the permission.
		await queryRunner.query(
			`DELETE FROM "role_permissions"
			 WHERE "permissionId" IN (
			   SELECT id FROM "permissions"
			   WHERE "resource" = 'participant' AND "operation" = 'viewScholarshipAmount'
			 )`,
		);
		await queryRunner.query(
			`DELETE FROM "permissions" WHERE "resource" = 'participant' AND "operation" = 'viewScholarshipAmount'`,
		);

		// Drop columns (SQLite ≥3.35). Best-effort; safe to leave in place.
		for (const col of [...this.columns].reverse()) {
			try {
				await queryRunner.query(
					`ALTER TABLE "retreat_participants" DROP COLUMN "${col.name}"`,
				);
			} catch {
				// ignore — older SQLite or column missing
			}
		}
	}
}
