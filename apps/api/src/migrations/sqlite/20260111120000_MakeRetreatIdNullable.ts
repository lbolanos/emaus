import { MigrationInterface, QueryRunner } from 'typeorm';

export class MakeRetreatIdNullable20260111120000 implements MigrationInterface {
	name = 'MakeRetreatIdNullable';
	timestamp = '20260111120000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		// SQLite doesn't support ALTER COLUMN directly, need to recreate table
		// 0. Disable foreign key constraints temporarily
		await queryRunner.query(`PRAGMA foreign_keys = OFF`);

		// 1. Drop dependent views
		await queryRunner.query(`DROP VIEW IF EXISTS participant_bed_assignments`);

		// 2. Create new table with nullable retreatId
		await queryRunner.query(`
			CREATE TABLE "participants_new" (
				"id" VARCHAR(36) PRIMARY KEY NOT NULL,
				"id_on_retreat" INTEGER NOT NULL,
				"type" VARCHAR NOT NULL,
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
				"family_friend_color" VARCHAR(20),
				"pickupLocation" VARCHAR,
				"arrivesOnOwn" BOOLEAN,
				"isScholarship" BOOLEAN NOT NULL DEFAULT 0,
				"palancasCoordinator" VARCHAR,
				"palancasRequested" BOOLEAN,
				"palancasReceived" TEXT,
				"palancasNotes" TEXT,
				"requestsSingleRoom" BOOLEAN,
				"isCancelled" BOOLEAN NOT NULL DEFAULT 0,
				"notes" TEXT,
				"registrationDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
				"lastUpdatedDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
				"retreatId" VARCHAR(36) NULL,
				"tableId" VARCHAR(36) NULL,
				FOREIGN KEY ("retreatId") REFERENCES "retreat" ("id") ON DELETE CASCADE,
				FOREIGN KEY ("tableId") REFERENCES "tables" ("id") ON DELETE SET NULL
			)
		`);

		// 3. Copy data explicitly listing all columns (no SELECT * to avoid relation columns)
		await queryRunner.query(`
			INSERT INTO "participants_new" (
				"id", "id_on_retreat", "type", "firstName", "lastName", "nickname", "birthDate", "maritalStatus",
				"street", "houseNumber", "postalCode", "neighborhood", "city", "state", "country", "parish",
				"homePhone", "workPhone", "cellPhone", "email", "occupation", "snores", "hasMedication",
				"medicationDetails", "medicationSchedule", "hasDietaryRestrictions", "dietaryRestrictionsDetails",
				"disabilitySupport", "sacraments", "emergencyContact1Name", "emergencyContact1Relation",
				"emergencyContact1HomePhone", "emergencyContact1WorkPhone", "emergencyContact1CellPhone",
				"emergencyContact1Email", "emergencyContact2Name", "emergencyContact2Relation",
				"emergencyContact2HomePhone", "emergencyContact2WorkPhone", "emergencyContact2CellPhone",
				"emergencyContact2Email", "tshirtSize", "needsWhiteShirt", "needsBlueShirt", "needsJacket",
				"invitedBy", "isInvitedByEmausMember", "inviterHomePhone", "inviterWorkPhone",
				"inviterCellPhone", "inviterEmail", "family_friend_color", "pickupLocation", "arrivesOnOwn",
				"isScholarship", "palancasCoordinator", "palancasRequested", "palancasReceived",
				"palancasNotes", "requestsSingleRoom", "isCancelled", "notes", "registrationDate",
				"lastUpdatedDate", "retreatId", "tableId"
			)
			SELECT
				"id", "id_on_retreat", "type", "firstName", "lastName", "nickname", "birthDate", "maritalStatus",
				"street", "houseNumber", "postalCode", "neighborhood", "city", "state", "country", "parish",
				"homePhone", "workPhone", "cellPhone", "email", "occupation", "snores", "hasMedication",
				"medicationDetails", "medicationSchedule", "hasDietaryRestrictions", "dietaryRestrictionsDetails",
				"disabilitySupport", "sacraments", "emergencyContact1Name", "emergencyContact1Relation",
				"emergencyContact1HomePhone", "emergencyContact1WorkPhone", "emergencyContact1CellPhone",
				"emergencyContact1Email", "emergencyContact2Name", "emergencyContact2Relation",
				"emergencyContact2HomePhone", "emergencyContact2WorkPhone", "emergencyContact2CellPhone",
				"emergencyContact2Email", "tshirtSize", "needsWhiteShirt", "needsBlueShirt", "needsJacket",
				"invitedBy", "isInvitedByEmausMember", "inviterHomePhone", "inviterWorkPhone",
				"inviterCellPhone", "inviterEmail", "family_friend_color", "pickupLocation", "arrivesOnOwn",
				"isScholarship", "palancasCoordinator", "palancasRequested", "palancasReceived",
				"palancasNotes", "requestsSingleRoom", "isCancelled", "notes", "registrationDate",
				"lastUpdatedDate", "retreatId", "tableId"
			FROM "participants"
		`);

		// 3. Drop old table
		await queryRunner.query(`DROP TABLE "participants"`);

		// 4. Rename new table to original name
		await queryRunner.query(`ALTER TABLE "participants_new" RENAME TO "participants"`);

		// 5. Recreate indexes
		await queryRunner.query(`CREATE INDEX "IDX_participants_retreatId" ON "participants" ("retreatId")`);
		await queryRunner.query(`CREATE INDEX "IDX_participants_tableId" ON "participants" ("tableId")`);

		// 6. Recreate dependent views
		await queryRunner.query(`
			CREATE VIEW participant_bed_assignments AS
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

		// 7. Re-enable foreign key constraints
		await queryRunner.query(`PRAGMA foreign_keys = ON`);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		// Revert: make retreatId NOT NULL again
		// 0. Disable foreign key constraints temporarily
		await queryRunner.query(`PRAGMA foreign_keys = OFF`);

		// 1. Drop dependent views
		await queryRunner.query(`DROP VIEW IF EXISTS participant_bed_assignments`);

		// 1. Create new table with non-nullable retreatId
		await queryRunner.query(`
			CREATE TABLE "participants_new" (
				"id" VARCHAR(36) PRIMARY KEY NOT NULL,
				"id_on_retreat" INTEGER NOT NULL,
				"type" VARCHAR NOT NULL,
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
				"family_friend_color" VARCHAR(20),
				"pickupLocation" VARCHAR,
				"arrivesOnOwn" BOOLEAN,
				"isScholarship" BOOLEAN NOT NULL DEFAULT 0,
				"palancasCoordinator" VARCHAR,
				"palancasRequested" BOOLEAN,
				"palancasReceived" TEXT,
				"palancasNotes" TEXT,
				"requestsSingleRoom" BOOLEAN,
				"isCancelled" BOOLEAN NOT NULL DEFAULT 0,
				"notes" TEXT,
				"registrationDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
				"lastUpdatedDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
				"retreatId" VARCHAR(36) NOT NULL,
				"tableId" VARCHAR(36) NULL,
				FOREIGN KEY ("retreatId") REFERENCES "retreat" ("id") ON DELETE CASCADE,
				FOREIGN KEY ("tableId") REFERENCES "tables" ("id") ON DELETE SET NULL
			)
		`);

		// 2. Copy only participants with retreatId from old table to new table
		await queryRunner.query(`
			INSERT INTO "participants_new" (
				"id", "id_on_retreat", "type", "firstName", "lastName", "nickname", "birthDate", "maritalStatus",
				"street", "houseNumber", "postalCode", "neighborhood", "city", "state", "country", "parish",
				"homePhone", "workPhone", "cellPhone", "email", "occupation", "snores", "hasMedication",
				"medicationDetails", "medicationSchedule", "hasDietaryRestrictions", "dietaryRestrictionsDetails",
				"disabilitySupport", "sacraments", "emergencyContact1Name", "emergencyContact1Relation",
				"emergencyContact1HomePhone", "emergencyContact1WorkPhone", "emergencyContact1CellPhone",
				"emergencyContact1Email", "emergencyContact2Name", "emergencyContact2Relation",
				"emergencyContact2HomePhone", "emergencyContact2WorkPhone", "emergencyContact2CellPhone",
				"emergencyContact2Email", "tshirtSize", "needsWhiteShirt", "needsBlueShirt", "needsJacket",
				"invitedBy", "isInvitedByEmausMember", "inviterHomePhone", "inviterWorkPhone",
				"inviterCellPhone", "inviterEmail", "family_friend_color", "pickupLocation", "arrivesOnOwn",
				"isScholarship", "palancasCoordinator", "palancasRequested", "palancasReceived",
				"palancasNotes", "requestsSingleRoom", "isCancelled", "notes", "registrationDate",
				"lastUpdatedDate", "retreatId", "tableId"
			)
			SELECT
				"id", "id_on_retreat", "type", "firstName", "lastName", "nickname", "birthDate", "maritalStatus",
				"street", "houseNumber", "postalCode", "neighborhood", "city", "state", "country", "parish",
				"homePhone", "workPhone", "cellPhone", "email", "occupation", "snores", "hasMedication",
				"medicationDetails", "medicationSchedule", "hasDietaryRestrictions", "dietaryRestrictionsDetails",
				"disabilitySupport", "sacraments", "emergencyContact1Name", "emergencyContact1Relation",
				"emergencyContact1HomePhone", "emergencyContact1WorkPhone", "emergencyContact1CellPhone",
				"emergencyContact1Email", "emergencyContact2Name", "emergencyContact2Relation",
				"emergencyContact2HomePhone", "emergencyContact2WorkPhone", "emergencyContact2CellPhone",
				"emergencyContact2Email", "tshirtSize", "needsWhiteShirt", "needsBlueShirt", "needsJacket",
				"invitedBy", "isInvitedByEmausMember", "inviterHomePhone", "inviterWorkPhone",
				"inviterCellPhone", "inviterEmail", "family_friend_color", "pickupLocation", "arrivesOnOwn",
				"isScholarship", "palancasCoordinator", "palancasRequested", "palancasReceived",
				"palancasNotes", "requestsSingleRoom", "isCancelled", "notes", "registrationDate",
				"lastUpdatedDate", "retreatId", "tableId"
			FROM "participants" WHERE "retreatId" IS NOT NULL
		`);

		// 3. Drop old table
		await queryRunner.query(`DROP TABLE "participants"`);

		// 4. Rename new table to original name
		await queryRunner.query(`ALTER TABLE "participants_new" RENAME TO "participants"`);

		// 5. Recreate indexes
		await queryRunner.query(`CREATE INDEX "IDX_participants_retreatId" ON "participants" ("retreatId")`);
		await queryRunner.query(`CREATE INDEX "IDX_participants_tableId" ON "participants" ("tableId")`);

		// 6. Recreate dependent views
		await queryRunner.query(`
			CREATE VIEW participant_bed_assignments AS
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

		// 7. Re-enable foreign key constraints
		await queryRunner.query(`PRAGMA foreign_keys = ON`);
	}
}
