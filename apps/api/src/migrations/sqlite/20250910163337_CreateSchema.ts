import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateSchema20250910163337 implements MigrationInterface {
	name = 'CreateSchema';
	timestamp = '20250910163337';

	public async up(queryRunner: QueryRunner): Promise<void> {
		// Create users table
		await queryRunner.query(`
			CREATE TABLE IF NOT EXISTS "users" (
				"id" VARCHAR(36) PRIMARY KEY NOT NULL,
				"googleId" VARCHAR(255) UNIQUE,
				"email" VARCHAR(255) NOT NULL UNIQUE,
				"displayName" VARCHAR(255) NOT NULL,
				"photo" VARCHAR(500),
				"password" VARCHAR(255),
				"createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
				"updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
			)
		`);

		// Create houses table
		await queryRunner.query(`
			CREATE TABLE IF NOT EXISTS "house" (
				"id" VARCHAR(36) PRIMARY KEY NOT NULL,
				"name" VARCHAR(255) NOT NULL,
				"address1" VARCHAR(255) NOT NULL,
				"address2" VARCHAR(255),
				"city" VARCHAR(255) NOT NULL,
				"state" VARCHAR(255) NOT NULL,
				"zipCode" VARCHAR(255) NOT NULL,
				"country" VARCHAR(255) NOT NULL,
				"capacity" INTEGER NOT NULL,
				"latitude" REAL,
				"longitude" REAL,
				"googleMapsUrl" VARCHAR(500),
				"notes" TEXT
			)
		`);

		// Create beds table
		await queryRunner.query(`
			CREATE TABLE IF NOT EXISTS "bed" (
				"id" VARCHAR(36) PRIMARY KEY NOT NULL,
				"roomNumber" VARCHAR(255) NOT NULL,
				"bedNumber" VARCHAR(255) NOT NULL,
				"floor" INTEGER,
				"type" TEXT NOT NULL DEFAULT ('normal') CHECK ("type" IN ('normal', 'litera', 'colchon')),
				"defaultUsage" TEXT NOT NULL DEFAULT ('caminante') CHECK ("defaultUsage" IN ('caminante', 'servidor')),
				"houseId" VARCHAR(36) NOT NULL,
				FOREIGN KEY ("houseId") REFERENCES "house" ("id") ON DELETE CASCADE
			)
		`);

		// Create retreats table
		await queryRunner.query(`
			CREATE TABLE IF NOT EXISTS "retreat" (
				"id" VARCHAR(36) PRIMARY KEY NOT NULL,
				"parish" VARCHAR(255) NOT NULL,
				"startDate" DATE NOT NULL,
				"endDate" DATE NOT NULL,
				"houseId" VARCHAR(36) NOT NULL,
				"openingNotes" TEXT,
				"closingNotes" TEXT,
				"thingsToBringNotes" TEXT,
				"cost" VARCHAR(255),
				"paymentInfo" TEXT,
				"paymentMethods" TEXT,
				"max_walkers" INTEGER,
				"max_servers" INTEGER,
				FOREIGN KEY ("houseId") REFERENCES "house" ("id") ON DELETE RESTRICT
			)
		`);

		// Create participants table (without foreign keys that reference tables not created yet)
		await queryRunner.query(`
			CREATE TABLE IF NOT EXISTS "participants" (
				"id" VARCHAR(36) PRIMARY KEY NOT NULL,
				"id_on_retreat" INTEGER NOT NULL,
				"type" VARCHAR(255) NOT NULL CHECK ("type" IN ('walker', 'server', 'waiting')),
				"firstName" VARCHAR(255) NOT NULL,
				"lastName" VARCHAR(255) NOT NULL,
				"nickname" VARCHAR(255),
				"birthDate" DATE NOT NULL,
				"maritalStatus" VARCHAR(255) NOT NULL CHECK ("maritalStatus" IN ('S', 'C', 'D', 'V', 'O')),
				"street" VARCHAR(255) NOT NULL,
				"houseNumber" VARCHAR(255) NOT NULL,
				"postalCode" VARCHAR(255) NOT NULL,
				"neighborhood" VARCHAR(255) NOT NULL,
				"city" VARCHAR(255) NOT NULL,
				"state" VARCHAR(255) NOT NULL,
				"country" VARCHAR(255) NOT NULL,
				"parish" VARCHAR(255),
				"homePhone" VARCHAR(255),
				"workPhone" VARCHAR(255),
				"cellPhone" VARCHAR(255) NOT NULL,
				"email" VARCHAR(255) NOT NULL,
				"occupation" VARCHAR(255) NOT NULL,
				"snores" BOOLEAN NOT NULL DEFAULT (0),
				"hasMedication" BOOLEAN NOT NULL DEFAULT (0),
				"medicationDetails" TEXT,
				"medicationSchedule" VARCHAR(255),
				"hasDietaryRestrictions" BOOLEAN NOT NULL DEFAULT (0),
				"dietaryRestrictionsDetails" TEXT,
				"sacraments" TEXT,
				"emergencyContact1Name" VARCHAR(255) NOT NULL,
				"emergencyContact1Relation" VARCHAR(255) NOT NULL,
				"emergencyContact1HomePhone" VARCHAR(255),
				"emergencyContact1WorkPhone" VARCHAR(255),
				"emergencyContact1CellPhone" VARCHAR(255) NOT NULL,
				"emergencyContact1Email" VARCHAR(255),
				"emergencyContact2Name" VARCHAR(255),
				"emergencyContact2Relation" VARCHAR(255),
				"emergencyContact2HomePhone" VARCHAR(255),
				"emergencyContact2WorkPhone" VARCHAR(255),
				"emergencyContact2CellPhone" VARCHAR(255),
				"emergencyContact2Email" VARCHAR(255),
				"tshirtSize" VARCHAR(255) CHECK ("tshirtSize" IN ('S', 'M', 'G', 'X', '2')),
				"needsWhiteShirt" BOOLEAN,
				"needsBlueShirt" BOOLEAN,
				"needsJacket" BOOLEAN,
				"invitedBy" VARCHAR(255),
				"isInvitedByEmausMember" BOOLEAN,
				"inviterHomePhone" VARCHAR(255),
				"inviterWorkPhone" VARCHAR(255),
				"inviterCellPhone" VARCHAR(255),
				"inviterEmail" VARCHAR(255),
				"family_friend_color" VARCHAR(20),
				"pickupLocation" VARCHAR(255),
				"arrivesOnOwn" BOOLEAN,
				"paymentDate" DATE,
				"paymentAmount" DECIMAL(10,2),
				"isScholarship" BOOLEAN NOT NULL DEFAULT (0),
				"palancasCoordinator" VARCHAR(255),
				"palancasRequested" BOOLEAN,
				"palancasReceived" TEXT,
				"palancasNotes" TEXT,
				"requestsSingleRoom" BOOLEAN,
				"isCancelled" BOOLEAN NOT NULL DEFAULT (0),
				"notes" TEXT,
				"registrationDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
				"lastUpdatedDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
				"retreatId" VARCHAR(36) NOT NULL,
				"tableId" VARCHAR(36),
				"retreatBedId" VARCHAR(36),
				FOREIGN KEY ("retreatId") REFERENCES "retreat" ("id") ON DELETE CASCADE
			)
		`);

		// Create tables table (without foreign keys that reference participants table)
		await queryRunner.query(`
			CREATE TABLE IF NOT EXISTS "tables" (
				"id" VARCHAR(36) PRIMARY KEY NOT NULL,
				"name" VARCHAR(255) NOT NULL,
				"retreatId" VARCHAR(36) NOT NULL,
				"liderId" VARCHAR(36),
				"colider1Id" VARCHAR(36),
				"colider2Id" VARCHAR(36),
				FOREIGN KEY ("retreatId") REFERENCES "retreat" ("id") ON DELETE CASCADE
			)
		`);

		// Create retreat_bed table
		await queryRunner.query(`
			CREATE TABLE IF NOT EXISTS "retreat_bed" (
				"id" VARCHAR(36) PRIMARY KEY NOT NULL,
				"roomNumber" VARCHAR(255) NOT NULL,
				"bedNumber" VARCHAR(255) NOT NULL,
				"floor" INTEGER,
				"type" TEXT NOT NULL CHECK ("type" IN ('normal', 'litera', 'colchon')),
				"defaultUsage" TEXT NOT NULL CHECK ("defaultUsage" IN ('caminante', 'servidor')),
				"retreatId" VARCHAR(36) NOT NULL,
				"participantId" VARCHAR(36),
				FOREIGN KEY ("retreatId") REFERENCES "retreat" ("id") ON DELETE CASCADE,
				FOREIGN KEY ("participantId") REFERENCES "participants" ("id") ON DELETE SET NULL
			)
		`);

		// Create retreat_charges table (without foreign key that references participants table)
		await queryRunner.query(`
			CREATE TABLE IF NOT EXISTS "retreat_charges" (
				"id" VARCHAR(36) PRIMARY KEY NOT NULL,
				"name" VARCHAR(255) NOT NULL,
				"description" TEXT,
				"retreatId" VARCHAR(36) NOT NULL,
				"participantId" VARCHAR(36),
				FOREIGN KEY ("retreatId") REFERENCES "retreat" ("id") ON DELETE CASCADE
			)
		`);

		// Create message_templates table
		await queryRunner.query(`
			CREATE TABLE IF NOT EXISTS "message_templates" (
				"id" VARCHAR(36) PRIMARY KEY NOT NULL,
				"name" VARCHAR(255) NOT NULL,
				"type" VARCHAR(255) NOT NULL CHECK ("type" IN ('WALKER_WELCOME', 'SERVER_WELCOME', 'EMERGENCY_CONTACT_VALIDATION', 'PALANCA_REQUEST', 'PALANCA_REMINDER', 'GENERAL', 'PRE_RETREAT_REMINDER', 'PAYMENT_REMINDER', 'POST_RETREAT_MESSAGE', 'CANCELLATION_CONFIRMATION')),
				"message" TEXT NOT NULL,
				"retreatId" VARCHAR(36) NOT NULL,
				"createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
				"updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
				FOREIGN KEY ("retreatId") REFERENCES "retreat" ("id") ON DELETE CASCADE
			)
		`);

		// Create inventory_category table
		await queryRunner.query(`
			CREATE TABLE IF NOT EXISTS "inventory_category" (
				"id" VARCHAR(36) PRIMARY KEY NOT NULL,
				"name" VARCHAR(255) NOT NULL,
				"description" TEXT,
				"isActive" BOOLEAN NOT NULL DEFAULT (1),
				"createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
				"updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
			)
		`);

		// Create inventory_team table
		await queryRunner.query(`
			CREATE TABLE IF NOT EXISTS "inventory_team" (
				"id" VARCHAR(36) PRIMARY KEY NOT NULL,
				"name" VARCHAR(255) NOT NULL,
				"description" TEXT,
				"isActive" BOOLEAN NOT NULL DEFAULT (1),
				"createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
				"updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
			)
		`);

		// Create inventory_item table
		await queryRunner.query(`
			CREATE TABLE IF NOT EXISTS "inventory_item" (
				"id" VARCHAR(36) PRIMARY KEY NOT NULL,
				"name" VARCHAR(255) NOT NULL,
				"description" TEXT,
				"categoryId" VARCHAR(36) NOT NULL,
				"teamId" VARCHAR(36) NOT NULL,
				"ratio" DECIMAL(5,2) NOT NULL DEFAULT (1.0),
				"requiredQuantity" DECIMAL(10,2),
				"unit" VARCHAR(255) NOT NULL,
				"isCalculated" BOOLEAN NOT NULL DEFAULT (0),
				"calculationType" VARCHAR(255),
				"tshirtSize" VARCHAR(255),
				"isActive" BOOLEAN NOT NULL DEFAULT (1),
				"createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
				"updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
				FOREIGN KEY ("categoryId") REFERENCES "inventory_category" ("id") ON DELETE RESTRICT,
				FOREIGN KEY ("teamId") REFERENCES "inventory_team" ("id") ON DELETE RESTRICT
			)
		`);

		// Create retreat_inventory table
		await queryRunner.query(`
			CREATE TABLE IF NOT EXISTS "retreat_inventory" (
				"id" VARCHAR(36) PRIMARY KEY NOT NULL,
				"retreatId" VARCHAR(36) NOT NULL,
				"inventoryItemId" VARCHAR(36) NOT NULL,
				"requiredQuantity" DECIMAL(10,2) NOT NULL DEFAULT (0),
				"currentQuantity" DECIMAL(10,2) NOT NULL DEFAULT (0),
				"isSufficient" BOOLEAN NOT NULL DEFAULT (0),
				"notes" TEXT,
				"createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
				"updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
				FOREIGN KEY ("retreatId") REFERENCES "retreat" ("id") ON DELETE CASCADE,
				FOREIGN KEY ("inventoryItemId") REFERENCES "inventory_item" ("id") ON DELETE CASCADE
			)
		`);

		// Note: Foreign keys for circular dependencies are handled at the application level
		// SQLite doesn't support adding foreign keys with ALTER TABLE

		// Create indexes for better performance
		await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_users_email" ON "users" ("email")`);
		await queryRunner.query(
			`CREATE INDEX IF NOT EXISTS "idx_users_googleId" ON "users" ("googleId")`,
		);
		await queryRunner.query(
			`CREATE INDEX IF NOT EXISTS "idx_participants_retreatId" ON "participants" ("retreatId")`,
		);
		await queryRunner.query(
			`CREATE INDEX IF NOT EXISTS "idx_participants_tableId" ON "participants" ("tableId")`,
		);
		await queryRunner.query(
			`CREATE INDEX IF NOT EXISTS "idx_participants_retreatBedId" ON "participants" ("retreatBedId")`,
		);
		await queryRunner.query(
			`CREATE INDEX IF NOT EXISTS "idx_tables_retreatId" ON "tables" ("retreatId")`,
		);
		await queryRunner.query(
			`CREATE INDEX IF NOT EXISTS "idx_retreat_bed_retreatId" ON "retreat_bed" ("retreatId")`,
		);
		await queryRunner.query(
			`CREATE INDEX IF NOT EXISTS "idx_retreat_bed_participantId" ON "retreat_bed" ("participantId")`,
		);
		await queryRunner.query(
			`CREATE INDEX IF NOT EXISTS "idx_retreat_charges_retreatId" ON "retreat_charges" ("retreatId")`,
		);
		await queryRunner.query(
			`CREATE INDEX IF NOT EXISTS "idx_retreat_charges_participantId" ON "retreat_charges" ("participantId")`,
		);
		await queryRunner.query(
			`CREATE INDEX IF NOT EXISTS "idx_message_templates_retreatId" ON "message_templates" ("retreatId")`,
		);
		await queryRunner.query(
			`CREATE INDEX IF NOT EXISTS "idx_inventory_item_categoryId" ON "inventory_item" ("categoryId")`,
		);
		await queryRunner.query(
			`CREATE INDEX IF NOT EXISTS "idx_inventory_item_teamId" ON "inventory_item" ("teamId")`,
		);
		await queryRunner.query(
			`CREATE INDEX IF NOT EXISTS "idx_retreat_inventory_retreatId" ON "retreat_inventory" ("retreatId")`,
		);
		await queryRunner.query(
			`CREATE INDEX IF NOT EXISTS "idx_retreat_inventory_inventoryItemId" ON "retreat_inventory" ("inventoryItemId")`,
		);
		// Create indexes for foreign keys that couldn't be added as constraints
		await queryRunner.query(
			`CREATE INDEX IF NOT EXISTS "idx_participants_tableId" ON "participants" ("tableId")`,
		);
		await queryRunner.query(
			`CREATE INDEX IF NOT EXISTS "idx_participants_retreatBedId" ON "participants" ("retreatBedId")`,
		);
		await queryRunner.query(
			`CREATE INDEX IF NOT EXISTS "idx_tables_liderId" ON "tables" ("liderId")`,
		);
		await queryRunner.query(
			`CREATE INDEX IF NOT EXISTS "idx_tables_colider1Id" ON "tables" ("colider1Id")`,
		);
		await queryRunner.query(
			`CREATE INDEX IF NOT EXISTS "idx_tables_colider2Id" ON "tables" ("colider2Id")`,
		);
		await queryRunner.query(
			`CREATE INDEX IF NOT EXISTS "idx_retreat_charges_participantId" ON "retreat_charges" ("participantId")`,
		);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		// Drop indexes first
		await queryRunner.query(`DROP INDEX IF EXISTS "idx_retreat_inventory_inventoryItemId"`);
		await queryRunner.query(`DROP INDEX IF EXISTS "idx_retreat_inventory_retreatId"`);
		await queryRunner.query(`DROP INDEX IF EXISTS "idx_inventory_item_teamId"`);
		await queryRunner.query(`DROP INDEX IF EXISTS "idx_inventory_item_categoryId"`);
		await queryRunner.query(`DROP INDEX IF EXISTS "idx_message_templates_retreatId"`);
		await queryRunner.query(`DROP INDEX IF EXISTS "idx_retreat_charges_participantId"`);
		await queryRunner.query(`DROP INDEX IF EXISTS "idx_retreat_charges_retreatId"`);
		await queryRunner.query(`DROP INDEX IF EXISTS "idx_retreat_bed_participantId"`);
		await queryRunner.query(`DROP INDEX IF EXISTS "idx_retreat_bed_retreatId"`);
		await queryRunner.query(`DROP INDEX IF EXISTS "idx_tables_retreatId"`);
		await queryRunner.query(`DROP INDEX IF EXISTS "idx_participants_retreatBedId"`);
		await queryRunner.query(`DROP INDEX IF EXISTS "idx_participants_tableId"`);
		await queryRunner.query(`DROP INDEX IF EXISTS "idx_participants_retreatId"`);
		await queryRunner.query(`DROP INDEX IF EXISTS "idx_users_googleId"`);
		await queryRunner.query(`DROP INDEX IF EXISTS "idx_users_email"`);

		// Drop tables in reverse order to respect foreign key constraints
		await queryRunner.query(`DROP TABLE IF EXISTS "retreat_inventory"`);
		await queryRunner.query(`DROP TABLE IF EXISTS "inventory_item"`);
		await queryRunner.query(`DROP TABLE IF EXISTS "inventory_team"`);
		await queryRunner.query(`DROP TABLE IF EXISTS "inventory_category"`);
		await queryRunner.query(`DROP TABLE IF EXISTS "message_templates"`);
		await queryRunner.query(`DROP TABLE IF EXISTS "retreat_charges"`);
		await queryRunner.query(`DROP TABLE IF EXISTS "retreat_bed"`);
		await queryRunner.query(`DROP TABLE IF EXISTS "tables"`);
		await queryRunner.query(`DROP TABLE IF EXISTS "participants"`);
		await queryRunner.query(`DROP TABLE IF EXISTS "retreat"`);
		await queryRunner.query(`DROP TABLE IF EXISTS "bed"`);
		await queryRunner.query(`DROP TABLE IF EXISTS "house"`);
		await queryRunner.query(`DROP TABLE IF EXISTS "users"`);
	}
}
