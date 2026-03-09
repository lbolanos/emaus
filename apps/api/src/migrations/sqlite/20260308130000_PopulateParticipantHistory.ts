import { MigrationInterface, QueryRunner } from 'typeorm';

export class PopulateParticipantHistory20260308130000 implements MigrationInterface {
	name = 'PopulateParticipantHistory20260308130000';

	// ── helpers ──────────────────────────────────────────────────────────
	private async tableExists(qr: QueryRunner, name: string): Promise<boolean> {
		const rows = await qr.query(
			`SELECT name FROM sqlite_master WHERE type='table' AND name=?`,
			[name],
		);
		return rows.length > 0;
	}

	private async columnExists(qr: QueryRunner, table: string, column: string): Promise<boolean> {
		const cols: Array<{ name: string }> = await qr.query(`PRAGMA table_info("${table}")`);
		return cols.some((c) => c.name === column);
	}

	// ── UP ───────────────────────────────────────────────────────────────
	public async up(queryRunner: QueryRunner): Promise<void> {
		// Clean up leftover temp tables from a previous failed run
		await queryRunner.query(`DROP TABLE IF EXISTS "participant_history_old"`);
		await queryRunner.query(`DROP TABLE IF EXISTS "participants_old"`);

		// Determine current state
		const hasPH = await this.tableExists(queryRunner, 'participant_history');
		const hasRP = await this.tableExists(queryRunner, 'retreat_participants');
		const participantsHasType = await this.columnExists(queryRunner, 'participants', 'type');

		// ────────────────────────────────────────────────────────────────
		// PHASE 1: Ensure we have a working participant_history / retreat_participants table
		//          with nullable userId + the 5 retreat-specific columns.
		// ────────────────────────────────────────────────────────────────

		// The "working table" is whichever currently exists
		const workingTable = hasRP ? 'retreat_participants' : 'participant_history';

		if (!hasPH && !hasRP) {
			// Neither table exists — create retreat_participants from scratch
			await this.createRetreatParticipantsTable(queryRunner, 'retreat_participants');
		} else if (hasPH && !hasRP) {
			// participant_history exists — may need schema upgrade
			const tableInfo: Array<{ name: string; notnull: number }> = await queryRunner.query(
				`PRAGMA table_info("participant_history")`,
			);
			const userIdCol = tableInfo.find((col) => col.name === 'userId');
			const hasTypeCol = tableInfo.some((col) => col.name === 'type');
			const needsRecreate = (userIdCol && userIdCol.notnull === 1) || !hasTypeCol;

			if (needsRecreate) {
				await queryRunner.query(
					`ALTER TABLE "participant_history" RENAME TO "participant_history_old"`,
				);
				await this.createRetreatParticipantsTable(queryRunner, 'participant_history');

				// Copy existing data
				await queryRunner.query(`
					INSERT INTO "participant_history" ("id", "userId", "participantId", "retreatId", "roleInRetreat", "isPrimaryRetreat", "notes", "metadata", "createdAt")
					SELECT "id", "userId", "participantId", "retreatId", "roleInRetreat", "isPrimaryRetreat", "notes", "metadata", "createdAt"
					FROM "participant_history_old"
				`);
				await queryRunner.query(`DROP TABLE "participant_history_old"`);
			}
		}
		// else: hasRP=true → table already has the right schema, skip phase 1

		// ────────────────────────────────────────────────────────────────
		// PHASE 2: Backfill retreat-specific fields from participants
		//          (only possible if participants still has the 5 columns)
		// ────────────────────────────────────────────────────────────────

		if (participantsHasType) {
			// Step A: Try to link old rows (userId but no participantId) to participants
			await queryRunner.query(`
				UPDATE "${workingTable}" SET
					"participantId" = (
						SELECT p."id" FROM "participants" p
						WHERE p."userId" = "${workingTable}"."userId"
							AND p."retreatId" = "${workingTable}"."retreatId"
						LIMIT 1
					)
				WHERE "participantId" IS NULL
					AND "userId" IS NOT NULL
			`);

			// Step B: Remove ALL rows that still have NULL participantId.
			// These are unlinkable old rows. We'll re-insert fresh rows below.
			const beforeDelete = await queryRunner.query(`SELECT COUNT(*) as cnt FROM "${workingTable}" WHERE "participantId" IS NULL`);
			console.log(`  → Step B: Deleting ${beforeDelete[0]?.cnt ?? 0} orphan rows (NULL participantId)`);
			await queryRunner.query(`
				DELETE FROM "${workingTable}" WHERE "participantId" IS NULL
			`);

			// Step C: Insert a row for every participant that doesn't already have one.
			// NOTE: We fetch into JS and insert row-by-row because TypeORM's SQLite
			// driver corrupts INSERT...SELECT results (participantId becomes NULL).
			const missingParticipants: Array<{
				id: string;
				userId: string | null;
				retreatId: string;
				type: string | null;
				isCancelled: boolean | null;
				tableId: string | null;
				id_on_retreat: number | null;
				family_friend_color: string | null;
			}> = await queryRunner.query(`
				SELECT p."id", p."userId", p."retreatId", p."type", p."isCancelled",
					   p."tableId", p."id_on_retreat", p."family_friend_color"
				FROM "participants" p
				WHERE p."retreatId" IS NOT NULL
					AND NOT EXISTS (
						SELECT 1 FROM "${workingTable}" rp
						WHERE rp."participantId" = p."id"
							AND rp."retreatId" = p."retreatId"
					)
			`);

			for (const p of missingParticipants) {
				const roleInRetreat =
					p.type === 'server' || p.type === 'partial_server' ? 'server' : 'walker';
				await queryRunner.query(
					`INSERT INTO "${workingTable}" (
						"id", "userId", "participantId", "retreatId", "roleInRetreat",
						"isPrimaryRetreat", "createdAt",
						"type", "isCancelled", "tableId", "idOnRetreat", "familyFriendColor"
					) VALUES (
						lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))), 2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6))),
						?, ?, ?, ?, 0, datetime('now'), ?, ?, ?, ?, ?
					)`,
					[
						p.userId,
						p.id, // participantId
						p.retreatId,
						roleInRetreat,
						p.type,
						p.isCancelled ? 1 : 0,
						p.tableId,
						p.id_on_retreat,
						p.family_friend_color,
					],
				);
			}
			console.log(`  → Inserted ${missingParticipants.length} retreat_participant rows`);

			// Step D: For pre-existing rows that have participantId but lack retreat-specific fields
			const rowsToUpdate: Array<{
				rpId: string;
				type: string | null;
				isCancelled: boolean | null;
				tableId: string | null;
				id_on_retreat: number | null;
				family_friend_color: string | null;
			}> = await queryRunner.query(`
				SELECT rp."id" as rpId, p."type", p."isCancelled", p."tableId",
					   p."id_on_retreat", p."family_friend_color"
				FROM "${workingTable}" rp
				JOIN "participants" p ON p."id" = rp."participantId" AND p."retreatId" = rp."retreatId"
				WHERE rp."type" IS NULL AND rp."participantId" IS NOT NULL
			`);

			for (const row of rowsToUpdate) {
				await queryRunner.query(
					`UPDATE "${workingTable}" SET
						"type" = ?, "isCancelled" = ?, "tableId" = ?,
						"idOnRetreat" = ?, "familyFriendColor" = ?
					WHERE "id" = ?`,
					[
						row.type,
						row.isCancelled ? 1 : 0,
						row.tableId,
						row.id_on_retreat,
						row.family_friend_color,
						row.rpId,
					],
				);
			}
			if (rowsToUpdate.length > 0) {
				console.log(`  → Updated ${rowsToUpdate.length} rows with retreat-specific fields`);
			}
		} else {
			// The 5 columns were already dropped from participants.
			// Ensure every participant with a retreatId has a retreat_participants row.
			console.log('  Phase 2 (fallback): participants columns already dropped, creating rows with defaults...');

			// Clean orphan rows
			await queryRunner.query(`DELETE FROM "${workingTable}" WHERE "participantId" IS NULL`);

			const missingParticipants: Array<{
				id: string;
				userId: string | null;
				retreatId: string;
			}> = await queryRunner.query(`
				SELECT p."id", p."userId", p."retreatId"
				FROM "participants" p
				WHERE p."retreatId" IS NOT NULL
					AND NOT EXISTS (
						SELECT 1 FROM "${workingTable}" rp
						WHERE rp."participantId" = p."id"
							AND rp."retreatId" = p."retreatId"
					)
			`);

			let idCounter = 0;
			for (const p of missingParticipants) {
				idCounter++;
				await queryRunner.query(
					`INSERT INTO "${workingTable}" (
						"id", "userId", "participantId", "retreatId", "roleInRetreat",
						"isPrimaryRetreat", "createdAt",
						"type", "isCancelled", "idOnRetreat"
					) VALUES (
						lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))), 2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6))),
						?, ?, ?, 'walker', 0, datetime('now'), 'walker', 0, ?
					)`,
					[p.userId, p.id, p.retreatId, idCounter],
				);
			}
			console.log(`  → Inserted ${missingParticipants.length} retreat_participant rows (defaults)`);
		}

		// Unconditional cleanup: remove any orphan rows with NULL participantId
		// (may exist from old participant_history data that couldn't be linked)
		const orphanCount = await queryRunner.query(`SELECT COUNT(*) as cnt FROM "${workingTable}" WHERE "participantId" IS NULL`);
		if (orphanCount[0]?.cnt > 0) {
			console.log(`  → Cleanup: removing ${orphanCount[0].cnt} orphan rows with NULL participantId`);
			await queryRunner.query(`DELETE FROM "${workingTable}" WHERE "participantId" IS NULL`);
		}

		// ────────────────────────────────────────────────────────────────
		// PHASE 3: Set primary retreat flags
		// ────────────────────────────────────────────────────────────────

		// For rows WITH userId — first walker retreat becomes primary
		await queryRunner.query(`
			UPDATE "${workingTable}"
			SET "isPrimaryRetreat" = 1
			WHERE id IN (
				SELECT ph.id
				FROM "${workingTable}" ph
				WHERE ph."userId" IS NOT NULL
					AND ph."roleInRetreat" = 'walker'
					AND ph."isPrimaryRetreat" = 0
					AND NOT EXISTS (
						SELECT 1 FROM "${workingTable}" ph2
						WHERE ph2."userId" = ph."userId" AND ph2."isPrimaryRetreat" = 1
					)
					AND NOT EXISTS (
						SELECT 1 FROM "${workingTable}" ph3
						WHERE ph3."userId" = ph."userId" AND ph3."roleInRetreat" = 'walker'
							AND ph3."createdAt" < ph."createdAt"
					)
			)
		`);

		// For users with no walker retreat and no primary yet, set oldest
		await queryRunner.query(`
			UPDATE "${workingTable}"
			SET "isPrimaryRetreat" = 1
			WHERE id IN (
				SELECT ph.id
				FROM "${workingTable}" ph
				WHERE ph."userId" IS NOT NULL
					AND ph."isPrimaryRetreat" = 0
					AND NOT EXISTS (
						SELECT 1 FROM "${workingTable}" ph2
						WHERE ph2."userId" = ph."userId" AND ph2."isPrimaryRetreat" = 1
					)
					AND NOT EXISTS (
						SELECT 1 FROM "${workingTable}" ph3
						WHERE ph3."userId" = ph."userId" AND ph3."createdAt" < ph."createdAt"
					)
			)
		`);

		// For rows WITHOUT userId — set primary by participantId grouping
		await queryRunner.query(`
			UPDATE "${workingTable}"
			SET "isPrimaryRetreat" = 1
			WHERE id IN (
				SELECT ph.id
				FROM "${workingTable}" ph
				WHERE ph."userId" IS NULL
					AND ph."participantId" IS NOT NULL
					AND ph."roleInRetreat" = 'walker'
					AND ph."isPrimaryRetreat" = 0
					AND NOT EXISTS (
						SELECT 1 FROM "${workingTable}" ph2
						WHERE ph2."participantId" = ph."participantId" AND ph2."isPrimaryRetreat" = 1
					)
					AND NOT EXISTS (
						SELECT 1 FROM "${workingTable}" ph3
						WHERE ph3."participantId" = ph."participantId" AND ph3."roleInRetreat" = 'walker'
							AND ph3."createdAt" < ph."createdAt"
					)
			)
		`);

		// For participants (without userId) with no primary yet, set oldest
		await queryRunner.query(`
			UPDATE "${workingTable}"
			SET "isPrimaryRetreat" = 1
			WHERE id IN (
				SELECT ph.id
				FROM "${workingTable}" ph
				WHERE ph."userId" IS NULL
					AND ph."participantId" IS NOT NULL
					AND ph."isPrimaryRetreat" = 0
					AND NOT EXISTS (
						SELECT 1 FROM "${workingTable}" ph2
						WHERE ph2."participantId" = ph."participantId" AND ph2."isPrimaryRetreat" = 1
					)
					AND NOT EXISTS (
						SELECT 1 FROM "${workingTable}" ph3
						WHERE ph3."participantId" = ph."participantId" AND ph3."createdAt" < ph."createdAt"
					)
			)
		`);

		// ────────────────────────────────────────────────────────────────
		// PHASE 4: Rename participant_history → retreat_participants
		// ────────────────────────────────────────────────────────────────

		if (hasPH && !hasRP) {
			await queryRunner.query(`ALTER TABLE "participant_history" RENAME TO "retreat_participants"`);
		}

		// Recreate indexes with canonical names (idempotent — drop first)
		await queryRunner.query(`DROP INDEX IF EXISTS "IDX_participant_history_userId"`);
		await queryRunner.query(`DROP INDEX IF EXISTS "IDX_participant_history_retreatId"`);
		await queryRunner.query(`DROP INDEX IF EXISTS "IDX_participant_history_participantId"`);
		await queryRunner.query(`DROP INDEX IF EXISTS "IDX_retreat_participants_userId"`);
		await queryRunner.query(`DROP INDEX IF EXISTS "IDX_retreat_participants_retreatId"`);
		await queryRunner.query(`DROP INDEX IF EXISTS "IDX_retreat_participants_participantId"`);
		await queryRunner.query(`
			CREATE INDEX "IDX_retreat_participants_userId"
			ON "retreat_participants" ("userId")
		`);
		await queryRunner.query(`
			CREATE INDEX "IDX_retreat_participants_retreatId"
			ON "retreat_participants" ("retreatId")
		`);
		await queryRunner.query(`
			CREATE INDEX "IDX_retreat_participants_participantId"
			ON "retreat_participants" ("participantId")
		`);

		// ── Phase 5: Fix retreat_bed unique index ─────────────────────────
		// The old index enforced one bed per participant GLOBALLY. Now that participants
		// can exist in multiple retreats, the unique constraint must be per-retreat.
		console.log('Phase 5: Fixing retreat_bed unique index to be per-retreat...');
		await queryRunner.query(`DROP INDEX IF EXISTS idx_retreat_bed_participant_unique`);
		await queryRunner.query(`
			CREATE UNIQUE INDEX IF NOT EXISTS idx_retreat_bed_participant_unique
			ON retreat_bed (retreatId, participantId)
			WHERE participantId IS NOT NULL
		`);
		console.log('✅ retreat_bed unique index now scoped to (retreatId, participantId)');

		// ────────────────────────────────────────────────────────────────
		// PHASE 6: Drop the 5 leftover retreat-specific columns from participants.
		//          Ground truth now lives in retreat_participants.
		//
		//          SQLite can't DROP COLUMN when the column is part of a FK
		//          definition (tableId → tables.id), so we rebuild the table.
		// ────────────────────────────────────────────────────────────────
		const columnsToDrop = ['type', 'isCancelled', 'tableId', 'id_on_retreat', 'family_friend_color'];
		const hasAnyColumn = (await Promise.all(
			columnsToDrop.map((c) => this.columnExists(queryRunner, 'participants', c)),
		)).some(Boolean);

		if (hasAnyColumn) {
			console.log('Phase 6: Rebuilding participants table without retreat-specific columns...');

			// Drop the view that references isCancelled
			await queryRunner.query(`DROP VIEW IF EXISTS "participant_bed_assignments"`);

			// Build the list of columns to KEEP (everything except the 5 we're dropping)
			const allCols: Array<{ name: string }> = await queryRunner.query(
				`PRAGMA table_info("participants")`,
			);
			const keepCols = allCols
				.map((c) => c.name)
				.filter((name) => !columnsToDrop.includes(name));
			const quotedKeepCols = keepCols.map((c) => `"${c}"`).join(', ');

			// Disable FK checks for the rebuild
			await queryRunner.query(`PRAGMA foreign_keys = OFF`);

			// Create the new table without the 5 columns and without the tableId FK
			await queryRunner.query(`
				CREATE TABLE "participants_new" (
					"id" VARCHAR(36) PRIMARY KEY NOT NULL,
					"firstName" VARCHAR NOT NULL,
					"lastName" VARCHAR NOT NULL,
					"nickname" VARCHAR,
					"birthDate" DATE NOT NULL,
					"maritalStatus" VARCHAR NOT NULL,
					"street" VARCHAR NOT NULL,
					"houseNumber" VARCHAR NOT NULL,
					"postalCode" VARCHAR NOT NULL,
					"neighborhood" VARCHAR NOT NULL,
					"city" VARCHAR NOT NULL,
					"state" VARCHAR NOT NULL,
					"country" VARCHAR NOT NULL,
					"parish" VARCHAR,
					"homePhone" VARCHAR,
					"workPhone" VARCHAR,
					"cellPhone" VARCHAR NOT NULL,
					"email" VARCHAR NOT NULL,
					"occupation" VARCHAR NOT NULL,
					"snores" BOOLEAN NOT NULL DEFAULT 0,
					"hasMedication" BOOLEAN NOT NULL DEFAULT 0,
					"medicationDetails" VARCHAR,
					"medicationSchedule" VARCHAR,
					"hasDietaryRestrictions" BOOLEAN NOT NULL DEFAULT 0,
					"dietaryRestrictionsDetails" VARCHAR,
					"disabilitySupport" TEXT,
					"sacraments" TEXT NOT NULL,
					"emergencyContact1Name" VARCHAR NOT NULL,
					"emergencyContact1Relation" VARCHAR NOT NULL,
					"emergencyContact1HomePhone" VARCHAR,
					"emergencyContact1WorkPhone" VARCHAR,
					"emergencyContact1CellPhone" VARCHAR NOT NULL,
					"emergencyContact1Email" VARCHAR,
					"emergencyContact2Name" VARCHAR,
					"emergencyContact2Relation" VARCHAR,
					"emergencyContact2HomePhone" VARCHAR,
					"emergencyContact2WorkPhone" VARCHAR,
					"emergencyContact2CellPhone" VARCHAR,
					"emergencyContact2Email" VARCHAR,
					"tshirtSize" VARCHAR,
					"needsWhiteShirt" VARCHAR,
					"needsBlueShirt" VARCHAR,
					"needsJacket" VARCHAR,
					"invitedBy" VARCHAR,
					"isInvitedByEmausMember" BOOLEAN,
					"inviterHomePhone" VARCHAR,
					"inviterWorkPhone" VARCHAR,
					"inviterCellPhone" VARCHAR,
					"inviterEmail" VARCHAR,
					"pickupLocation" VARCHAR,
					"arrivesOnOwn" BOOLEAN,
					"isScholarship" BOOLEAN NOT NULL DEFAULT 0,
					"palancasCoordinator" VARCHAR,
					"palancasRequested" BOOLEAN,
					"palancasReceived" TEXT,
					"palancasNotes" TEXT,
					"requestsSingleRoom" BOOLEAN,
					"notes" TEXT,
					"registrationDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
					"lastUpdatedDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
					"retreatId" VARCHAR(36) NULL,
					"userId" varchar,
					FOREIGN KEY ("retreatId") REFERENCES "retreat" ("id") ON DELETE CASCADE
				)
			`);

			// Copy data
			await queryRunner.query(`
				INSERT INTO "participants_new" (${quotedKeepCols})
				SELECT ${quotedKeepCols} FROM "participants"
			`);

			// Swap tables: DROP old + RENAME new.
			// With foreign_keys = OFF, DROP does NOT trigger ON DELETE cascades.
			// Do NOT use RENAME on the old table — SQLite rewrites FK references
			// in child tables to point at the renamed table, and a subsequent DROP
			// of that renamed table WILL cascade ON DELETE SET NULL.
			await queryRunner.query(`DROP TABLE "participants"`);
			await queryRunner.query(`ALTER TABLE "participants_new" RENAME TO "participants"`);

			// Recreate indexes
			await queryRunner.query(`CREATE INDEX "IDX_participants_retreatId" ON "participants" ("retreatId")`);
			await queryRunner.query(`CREATE INDEX "IDX_participants_userId" ON "participants" ("userId")`);

			// Re-enable FK checks
			await queryRunner.query(`PRAGMA foreign_keys = ON`);

			console.log('  ✅ Rebuilt participants table — dropped type, isCancelled, tableId, id_on_retreat, family_friend_color');
		} else {
			console.log('Phase 6: Retreat-specific columns already removed, skipping.');
			// Still ensure the old view is dropped for recreation below
			await queryRunner.query(`DROP VIEW IF EXISTS "participant_bed_assignments"`);
		}

		// Recreate the view using retreat_participants instead of participants columns
		await queryRunner.query(`DROP VIEW IF EXISTS "participant_bed_assignments"`);
		await queryRunner.query(`
			CREATE VIEW "participant_bed_assignments" AS
			SELECT p.id as participantId,
				p.firstName,
				p.lastName,
				p.retreatId,
				rb.id as retreatBedId,
				rb.roomNumber,
				rb.bedNumber,
				rb.floor,
				rb.type as bedType,
				rb.defaultUsage
			FROM participants p
			INNER JOIN retreat_participants rp
				ON rp."participantId" = p.id
				AND rp."retreatId" = p."retreatId"
			LEFT JOIN retreat_bed rb ON rb.participantId = p.id AND rb.retreatId = p.retreatId
			WHERE rp."isCancelled" = 0
		`);
		console.log('  ✅ Recreated participant_bed_assignments view using retreat_participants');
	}

	// ── DOWN ─────────────────────────────────────────────────────────────
	public async down(queryRunner: QueryRunner): Promise<void> {
		// Re-add the 5 columns to participants
		const cols: Array<{ name: string }> = await queryRunner.query(`PRAGMA table_info("participants")`);
		const colNames = cols.map((c) => c.name);

		if (!colNames.includes('type')) {
			await queryRunner.query(`ALTER TABLE "participants" ADD COLUMN "type" VARCHAR DEFAULT NULL`);
		}
		if (!colNames.includes('isCancelled')) {
			await queryRunner.query(`ALTER TABLE "participants" ADD COLUMN "isCancelled" BOOLEAN DEFAULT 0`);
		}
		if (!colNames.includes('tableId')) {
			await queryRunner.query(`ALTER TABLE "participants" ADD COLUMN "tableId" VARCHAR(36) DEFAULT NULL`);
		}
		if (!colNames.includes('id_on_retreat')) {
			await queryRunner.query(`ALTER TABLE "participants" ADD COLUMN "id_on_retreat" INTEGER DEFAULT NULL`);
		}
		if (!colNames.includes('family_friend_color')) {
			await queryRunner.query(`ALTER TABLE "participants" ADD COLUMN "family_friend_color" VARCHAR(20) DEFAULT NULL`);
		}

		// Backfill from retreat_participants
		await queryRunner.query(`
			UPDATE "participants" SET
				"type" = (SELECT rp."type" FROM "retreat_participants" rp WHERE rp."participantId" = "participants"."id" AND rp."retreatId" = "participants"."retreatId" LIMIT 1),
				"isCancelled" = (SELECT rp."isCancelled" FROM "retreat_participants" rp WHERE rp."participantId" = "participants"."id" AND rp."retreatId" = "participants"."retreatId" LIMIT 1),
				"tableId" = (SELECT rp."tableId" FROM "retreat_participants" rp WHERE rp."participantId" = "participants"."id" AND rp."retreatId" = "participants"."retreatId" LIMIT 1),
				"id_on_retreat" = (SELECT rp."idOnRetreat" FROM "retreat_participants" rp WHERE rp."participantId" = "participants"."id" AND rp."retreatId" = "participants"."retreatId" LIMIT 1),
				"family_friend_color" = (SELECT rp."familyFriendColor" FROM "retreat_participants" rp WHERE rp."participantId" = "participants"."id" AND rp."retreatId" = "participants"."retreatId" LIMIT 1)
			WHERE "retreatId" IS NOT NULL
		`);

		// Recreate original view referencing participants.isCancelled
		await queryRunner.query(`DROP VIEW IF EXISTS "participant_bed_assignments"`);
		await queryRunner.query(`
			CREATE VIEW "participant_bed_assignments" AS
			SELECT p.id as participantId,
				p.firstName,
				p.lastName,
				p.retreatId,
				rb.id as retreatBedId,
				rb.roomNumber,
				rb.bedNumber,
				rb.floor,
				rb.type as bedType,
				rb.defaultUsage
			FROM participants p
			LEFT JOIN retreat_bed rb ON rb.participantId = p.id
			WHERE p.isCancelled = 0
		`);

		// Rename retreat_participants → participant_history
		const hasRP = await this.tableExists(queryRunner, 'retreat_participants');
		if (hasRP) {
			await queryRunner.query(`DROP INDEX IF EXISTS "IDX_retreat_participants_userId"`);
			await queryRunner.query(`DROP INDEX IF EXISTS "IDX_retreat_participants_retreatId"`);
			await queryRunner.query(`DROP INDEX IF EXISTS "IDX_retreat_participants_participantId"`);

			await queryRunner.query(`ALTER TABLE "retreat_participants" RENAME TO "participant_history"`);

			await queryRunner.query(`CREATE INDEX "IDX_participant_history_userId" ON "participant_history" ("userId")`);
			await queryRunner.query(`CREATE INDEX "IDX_participant_history_retreatId" ON "participant_history" ("retreatId")`);
			await queryRunner.query(`CREATE INDEX "IDX_participant_history_participantId" ON "participant_history" ("participantId")`);
		}

		// Restore old global unique index on retreat_bed
		await queryRunner.query(`DROP INDEX IF EXISTS idx_retreat_bed_participant_unique`);
		await queryRunner.query(`
			CREATE UNIQUE INDEX idx_retreat_bed_participant_unique
			ON retreat_bed (participantId)
			WHERE participantId IS NOT NULL
		`);
	}

	// ── Helper: create the retreat_participants table schema ────────────
	private async createRetreatParticipantsTable(qr: QueryRunner, name: string): Promise<void> {
		await qr.query(`
			CREATE TABLE "${name}" (
				"id" varchar PRIMARY KEY NOT NULL,
				"userId" varchar,
				"participantId" varchar,
				"retreatId" varchar NOT NULL,
				"roleInRetreat" varchar NOT NULL CHECK("roleInRetreat" IN ('walker', 'server', 'leader', 'coordinator', 'charlista')),
				"isPrimaryRetreat" boolean DEFAULT false NOT NULL,
				"notes" text,
				"metadata" json,
				"createdAt" datetime DEFAULT (datetime('now')) NOT NULL,
				"type" varchar,
				"isCancelled" boolean DEFAULT 0,
				"tableId" varchar,
				"idOnRetreat" integer,
				"familyFriendColor" varchar(20),
				FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE,
				FOREIGN KEY ("participantId") REFERENCES "participants"("id") ON DELETE SET NULL,
				FOREIGN KEY ("retreatId") REFERENCES "retreat"("id") ON DELETE CASCADE,
				FOREIGN KEY ("tableId") REFERENCES "tables"("id") ON DELETE SET NULL
			)
		`);
	}
}
