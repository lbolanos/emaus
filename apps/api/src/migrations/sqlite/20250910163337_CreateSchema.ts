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
				"isPending" BOOLEAN DEFAULT 0,
				"invitationToken" VARCHAR(255),
				"invitationExpiresAt" DATETIME,
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

		// Create participants table (with correct shirt field types)
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
				"needsWhiteShirt" VARCHAR(10),
				"needsBlueShirt" VARCHAR(10),
				"needsJacket" VARCHAR(10),
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

		// Create retreat_responsibilities table (participant roles and responsibilities)
		await queryRunner.query(`
			CREATE TABLE IF NOT EXISTS "retreat_responsibilities" (
				"id" VARCHAR(36) PRIMARY KEY NOT NULL,
				"name" VARCHAR(255) NOT NULL,
				"description" TEXT,
				"responsabilityType" VARCHAR(50) NOT NULL DEFAULT 'otro' CHECK ("responsabilityType" IN ('lider', 'colider', 'servidor', 'musica', 'oracion', 'limpieza', 'cocina', 'otro')),
				"isLeadership" BOOLEAN NOT NULL DEFAULT 0,
				"priority" INTEGER NOT NULL DEFAULT 0,
				"isActive" BOOLEAN NOT NULL DEFAULT 1,
				"retreatId" VARCHAR(36) NOT NULL,
				"participantId" VARCHAR(36),
				"createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
				"updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
				FOREIGN KEY ("retreatId") REFERENCES "retreat" ("id") ON DELETE CASCADE,
				FOREIGN KEY ("participantId") REFERENCES "participants" ("id") ON DELETE SET NULL
			)
		`);

		// Create message_templates table
		await queryRunner.query(`
			CREATE TABLE IF NOT EXISTS "message_templates" (
				"id" VARCHAR(36) PRIMARY KEY NOT NULL,
				"name" VARCHAR(255) NOT NULL,
				"type" VARCHAR(255) NOT NULL CHECK ("type" IN ('WALKER_WELCOME', 'SERVER_WELCOME', 'EMERGENCY_CONTACT_VALIDATION', 'PALANCA_REQUEST', 'PALANCA_REMINDER', 'GENERAL', 'PRE_RETREAT_REMINDER', 'PAYMENT_REMINDER', 'POST_RETREAT_MESSAGE', 'CANCELLATION_CONFIRMATION', 'USER_INVITATION', 'PASSWORD_RESET', 'RETREAT_SHARED_NOTIFICATION')),
				"message" TEXT NOT NULL,
				"retreatId" VARCHAR(36) NOT NULL,
				"createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
				"updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
				FOREIGN KEY ("retreatId") REFERENCES "retreat" ("id") ON DELETE CASCADE
			)
		`);

		// Create global_message_templates table
		await queryRunner.query(`
			CREATE TABLE IF NOT EXISTS "global_message_templates" (
				"id" VARCHAR(36) PRIMARY KEY NOT NULL,
				"name" VARCHAR(255) NOT NULL,
				"type" VARCHAR(255) NOT NULL CHECK ("type" IN ('WALKER_WELCOME', 'SERVER_WELCOME', 'EMERGENCY_CONTACT_VALIDATION', 'PALANCA_REQUEST', 'PALANCA_REMINDER', 'GENERAL', 'PRE_RETREAT_REMINDER', 'PAYMENT_REMINDER', 'POST_RETREAT_MESSAGE', 'CANCELLATION_CONFIRMATION', 'USER_INVITATION', 'PASSWORD_RESET', 'RETREAT_SHARED_NOTIFICATION', 'BIRTHDAY_MESSAGE')),
				"message" TEXT NOT NULL,
				"isActive" BOOLEAN NOT NULL DEFAULT (1),
				"createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
				"updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
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

		// Create permissions table
		await queryRunner.query(`
			CREATE TABLE IF NOT EXISTS "permissions" (
				"id" INTEGER PRIMARY KEY AUTOINCREMENT,
				"resource" VARCHAR(255) NOT NULL,
				"operation" VARCHAR(255) NOT NULL,
				"description" TEXT,
				"createdAt" DATETIME NOT NULL DEFAULT (datetime('now')),
				"updatedAt" DATETIME NOT NULL DEFAULT (datetime('now')),
				UNIQUE("resource", "operation")
			);
		`);

		// Create roles table
		await queryRunner.query(`
			CREATE TABLE IF NOT EXISTS "roles" (
				"id" INTEGER PRIMARY KEY AUTOINCREMENT,
				"name" VARCHAR(255) NOT NULL UNIQUE,
				"description" TEXT,
				"createdAt" DATETIME NOT NULL DEFAULT (datetime('now')),
				"updatedAt" DATETIME NOT NULL DEFAULT (datetime('now'))
			);
		`);

		// Create role_permissions table
		await queryRunner.query(`
			CREATE TABLE IF NOT EXISTS "role_permissions" (
				"id" INTEGER PRIMARY KEY AUTOINCREMENT,
				"roleId" INTEGER NOT NULL,
				"permissionId" INTEGER NOT NULL,
				"createdAt" DATETIME NOT NULL DEFAULT (datetime('now')),
				FOREIGN KEY("roleId") REFERENCES "roles"("id") ON DELETE CASCADE,
				FOREIGN KEY("permissionId") REFERENCES "permissions"("id") ON DELETE CASCADE,
				UNIQUE("roleId", "permissionId")
			);
		`);

		// Create user_roles table
		await queryRunner.query(`
			CREATE TABLE IF NOT EXISTS "user_roles" (
				"id" INTEGER PRIMARY KEY AUTOINCREMENT,
				"userId" VARCHAR NOT NULL,
				"roleId" INTEGER NOT NULL,
				"createdAt" DATETIME NOT NULL DEFAULT (datetime('now')),
				FOREIGN KEY("userId") REFERENCES "users"("id") ON DELETE CASCADE,
				FOREIGN KEY("roleId") REFERENCES "roles"("id") ON DELETE CASCADE,
				UNIQUE("userId", "roleId")
			);
		`);

		// Create user_retreats table
		await queryRunner.query(`
			CREATE TABLE IF NOT EXISTS "user_retreats" (
				"id" INTEGER PRIMARY KEY AUTOINCREMENT,
				"userId" VARCHAR NOT NULL,
				"retreatId" VARCHAR NOT NULL,
				"roleId" INTEGER NOT NULL,
				"invitedBy" VARCHAR(36),
				"invitedAt" DATETIME,
				"expiresAt" DATETIME,
				"status" VARCHAR(50) DEFAULT ('active') CHECK ("status" IN ('pending', 'active', 'expired', 'revoked')),
				"permissionsOverride" TEXT,
				"invitationToken" VARCHAR(255),
				"updatedAt" DATETIME NOT NULL DEFAULT (datetime('now')),
				"createdAt" DATETIME NOT NULL DEFAULT (datetime('now')),
				FOREIGN KEY("userId") REFERENCES "users"("id") ON DELETE CASCADE,
				FOREIGN KEY("retreatId") REFERENCES "retreat"("id") ON DELETE CASCADE,
				FOREIGN KEY("roleId") REFERENCES "roles"("id") ON DELETE CASCADE,
				FOREIGN KEY("invitedBy") REFERENCES "users"("id") ON DELETE SET NULL,
				UNIQUE("userId", "retreatId", "roleId")
			);
		`);

		// Add retreat management columns
		await queryRunner.query(`ALTER TABLE "retreat" ADD COLUMN "createdBy" VARCHAR(36)`);
		await queryRunner.query(`ALTER TABLE "retreat" ADD COLUMN "isPublic" BOOLEAN DEFAULT 0`);
		await queryRunner.query(
			`ALTER TABLE "retreat" ADD COLUMN "roleInvitationEnabled" BOOLEAN DEFAULT 0`,
		);
		await queryRunner.query(
			`ALTER TABLE "retreat" ADD FOREIGN KEY("createdBy") REFERENCES "users"("id") ON DELETE SET NULL`,
		);

		// Create audit_logs table
		await queryRunner.query(`
			CREATE TABLE IF NOT EXISTS "audit_logs" (
				"id" VARCHAR(36) PRIMARY KEY NOT NULL,
				"actionType" VARCHAR(255) NOT NULL,
				"resourceType" VARCHAR(255) NOT NULL,
				"resourceId" VARCHAR(36) NOT NULL,
				"userId" VARCHAR(36),
				"targetUserId" VARCHAR(36),
				"retreatId" VARCHAR(36),
				"description" TEXT,
				"oldValues" TEXT,
				"newValues" TEXT,
				"ipAddress" VARCHAR(255),
				"userAgent" VARCHAR(255),
				"createdAt" DATETIME NOT NULL DEFAULT (datetime('now')),
				FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL,
				FOREIGN KEY ("targetUserId") REFERENCES "users"("id") ON DELETE SET NULL,
				FOREIGN KEY ("retreatId") REFERENCES "retreat"("id") ON DELETE SET NULL
			)
		`);

		// Create role_requests table
		await queryRunner.query(`
			CREATE TABLE IF NOT EXISTS "role_requests" (
				"id" VARCHAR(36) PRIMARY KEY NOT NULL,
				"user_id" VARCHAR(36) NOT NULL,
				"retreat_id" VARCHAR(36) NOT NULL,
				"requested_role_id" INTEGER NOT NULL,
				"requested_role" VARCHAR(255) NOT NULL,
				"message" TEXT,
				"status" VARCHAR(20) DEFAULT ('pending') CHECK ("status" IN ('pending', 'approved', 'rejected')),
				"requested_at" DATETIME NOT NULL DEFAULT (datetime('now')),
				"approved_at" DATETIME,
				"rejected_at" DATETIME,
				"approved_by" VARCHAR(36),
				"rejected_by" VARCHAR(36),
				"rejection_reason" TEXT,
				FOREIGN KEY("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
				FOREIGN KEY("retreat_id") REFERENCES "retreat"("id") ON DELETE CASCADE,
				FOREIGN KEY("requested_role_id") REFERENCES "roles"("id") ON DELETE CASCADE,
				FOREIGN KEY("approved_by") REFERENCES "users"("id") ON DELETE SET NULL,
				FOREIGN KEY("rejected_by") REFERENCES "users"("id") ON DELETE SET NULL,
				UNIQUE("user_id", "retreat_id", "status")
			)
		`);

		// Create permission_delegations table
		await queryRunner.query(`
			CREATE TABLE IF NOT EXISTS "permission_delegations" (
				"id" VARCHAR(36) PRIMARY KEY NOT NULL,
				"from_user_id" VARCHAR(36) NOT NULL,
				"to_user_id" VARCHAR(36) NOT NULL,
				"retreat_id" VARCHAR(36) NOT NULL,
				"permissions" TEXT NOT NULL,
				"expires_at" DATETIME NOT NULL,
				"created_at" DATETIME NOT NULL DEFAULT (datetime('now')),
				"revoked_at" DATETIME,
				"revoked_by" VARCHAR(36),
				"status" VARCHAR(50) NOT NULL DEFAULT 'active',
				FOREIGN KEY ("from_user_id") REFERENCES "users"("id") ON DELETE CASCADE,
				FOREIGN KEY ("to_user_id") REFERENCES "users"("id") ON DELETE CASCADE,
				FOREIGN KEY ("retreat_id") REFERENCES "retreat"("id") ON DELETE CASCADE,
				FOREIGN KEY ("revoked_by") REFERENCES "users"("id") ON DELETE SET NULL
			)
		`);

		// Create permission_override_logs table
		await queryRunner.query(`
			CREATE TABLE IF NOT EXISTS "permission_override_logs" (
				"id" VARCHAR(36) PRIMARY KEY NOT NULL,
				"user_id" VARCHAR(36) NOT NULL,
				"retreat_id" VARCHAR(36) NOT NULL,
				"overrides" TEXT NOT NULL,
				"set_by" VARCHAR(36) NOT NULL,
				"reason" TEXT,
				"created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
				FOREIGN KEY("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
				FOREIGN KEY("retreat_id") REFERENCES "retreat"("id") ON DELETE CASCADE,
				FOREIGN KEY("set_by") REFERENCES "users"("id") ON DELETE CASCADE
			)
		`);

		// Create payments table
		await queryRunner.query(`
			CREATE TABLE IF NOT EXISTS "payments" (
				"id" VARCHAR(36) PRIMARY KEY NOT NULL,
				"participantId" VARCHAR(36) NOT NULL,
				"retreatId" VARCHAR(36) NOT NULL,
				"amount" DECIMAL(10,2) NOT NULL,
				"paymentDate" DATE NOT NULL,
				"paymentMethod" VARCHAR(50) NOT NULL CHECK ("paymentMethod" IN ('cash', 'transfer', 'check', 'card', 'other')),
				"referenceNumber" VARCHAR(100),
				"notes" TEXT,
				"recordedBy" VARCHAR(36) NOT NULL,
				"createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
				"updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
				FOREIGN KEY ("participantId") REFERENCES "participants" ("id") ON DELETE CASCADE,
				FOREIGN KEY ("retreatId") REFERENCES "retreat" ("id") ON DELETE CASCADE,
				FOREIGN KEY ("recordedBy") REFERENCES "users" ("id") ON DELETE SET NULL
			)
		`);

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
			`CREATE INDEX IF NOT EXISTS "idx_retreat_responsibilities_retreatId" ON "retreat_responsibilities" ("retreatId")`,
		);
		await queryRunner.query(
			`CREATE INDEX IF NOT EXISTS "idx_retreat_responsibilities_participantId" ON "retreat_responsibilities" ("participantId")`,
		);
		await queryRunner.query(
			`CREATE INDEX IF NOT EXISTS "idx_retreat_responsibilities_responsabilityType" ON "retreat_responsibilities" ("responsabilityType")`,
		);
		await queryRunner.query(
			`CREATE INDEX IF NOT EXISTS "idx_retreat_responsibilities_isActive" ON "retreat_responsibilities" ("isActive")`,
		);
		await queryRunner.query(
			`CREATE INDEX IF NOT EXISTS "idx_retreat_responsibilities_priority" ON "retreat_responsibilities" ("priority")`,
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
			`CREATE INDEX IF NOT EXISTS "idx_retreat_responsibilities_participantId" ON "retreat_responsibilities" ("participantId")`,
		);

		// Add indexes for RBAC tables
		await queryRunner.query(
			`CREATE INDEX IF NOT EXISTS "idx_retreat_createdBy" ON "retreat" ("createdBy")`,
		);
		await queryRunner.query(
			`CREATE INDEX IF NOT EXISTS "idx_retreat_isPublic" ON "retreat" ("isPublic")`,
		);
		await queryRunner.query(
			`CREATE INDEX IF NOT EXISTS "idx_user_retreats_invitedBy" ON "user_retreats" ("invitedBy")`,
		);
		await queryRunner.query(
			`CREATE INDEX IF NOT EXISTS "idx_user_retreats_status" ON "user_retreats" ("status")`,
		);
		await queryRunner.query(
			`CREATE INDEX IF NOT EXISTS "idx_user_retreats_expiresAt" ON "user_retreats" ("expiresAt")`,
		);
		await queryRunner.query(
			`CREATE INDEX IF NOT EXISTS "IDX_audit_logs_action_type" ON "audit_logs"("actionType")`,
		);
		await queryRunner.query(
			`CREATE INDEX IF NOT EXISTS "IDX_audit_logs_resource_type" ON "audit_logs"("resourceType")`,
		);
		await queryRunner.query(
			`CREATE INDEX IF NOT EXISTS "IDX_audit_logs_user_id" ON "audit_logs"("userId")`,
		);
		await queryRunner.query(
			`CREATE INDEX IF NOT EXISTS "IDX_audit_logs_target_user_id" ON "audit_logs"("targetUserId")`,
		);
		await queryRunner.query(
			`CREATE INDEX IF NOT EXISTS "IDX_audit_logs_retreat_id" ON "audit_logs"("retreatId")`,
		);
		await queryRunner.query(
			`CREATE INDEX IF NOT EXISTS "IDX_audit_logs_created_at" ON "audit_logs"("createdAt")`,
		);
		await queryRunner.query(
			`CREATE INDEX IF NOT EXISTS "IDX_audit_logs_action_resource" ON "audit_logs"("actionType", "resourceType")`,
		);
		await queryRunner.query(
			`CREATE INDEX IF NOT EXISTS "idx_role_requests_user_id" ON "role_requests" ("user_id")`,
		);
		await queryRunner.query(
			`CREATE INDEX IF NOT EXISTS "idx_role_requests_retreat_id" ON "role_requests" ("retreat_id")`,
		);
		await queryRunner.query(
			`CREATE INDEX IF NOT EXISTS "idx_role_requests_status" ON "role_requests" ("status")`,
		);
		await queryRunner.query(
			`CREATE INDEX IF NOT EXISTS "idx_role_requests_requested_at" ON "role_requests" ("requested_at")`,
		);
		await queryRunner.query(
			`CREATE INDEX IF NOT EXISTS "IDX_permission_delegations_from_user" ON "permission_delegations"("from_user_id")`,
		);
		await queryRunner.query(
			`CREATE INDEX IF NOT EXISTS "IDX_permission_delegations_to_user" ON "permission_delegations"("to_user_id")`,
		);
		await queryRunner.query(
			`CREATE INDEX IF NOT EXISTS "IDX_permission_delegations_retreat" ON "permission_delegations"("retreat_id")`,
		);
		await queryRunner.query(
			`CREATE INDEX IF NOT EXISTS "IDX_permission_delegations_expires_at" ON "permission_delegations"("expires_at")`,
		);
		await queryRunner.query(
			`CREATE INDEX IF NOT EXISTS "IDX_permission_delegations_status" ON "permission_delegations"("status")`,
		);
		await queryRunner.query(
			`CREATE INDEX IF NOT EXISTS "idx_permission_override_logs_user_id" ON "permission_override_logs"("user_id")`,
		);
		await queryRunner.query(
			`CREATE INDEX IF NOT EXISTS "idx_permission_override_logs_retreat_id" ON "permission_override_logs"("retreat_id")`,
		);
		await queryRunner.query(
			`CREATE INDEX IF NOT EXISTS "idx_permission_override_logs_set_by" ON "permission_override_logs"("set_by")`,
		);
		await queryRunner.query(
			`CREATE INDEX IF NOT EXISTS "idx_permission_override_logs_created_at" ON "permission_override_logs"("created_at")`,
		);

		// Add indexes for payments table
		await queryRunner.query(
			`CREATE INDEX IF NOT EXISTS "idx_payments_participantId" ON "payments"("participantId")`,
		);
		await queryRunner.query(
			`CREATE INDEX IF NOT EXISTS "idx_payments_retreatId" ON "payments"("retreatId")`,
		);
		await queryRunner.query(
			`CREATE INDEX IF NOT EXISTS "idx_payments_paymentDate" ON "payments"("paymentDate")`,
		);
		await queryRunner.query(
			`CREATE INDEX IF NOT EXISTS "idx_payments_recordedBy" ON "payments"("recordedBy")`,
		);

		// Insert default permissions
		await queryRunner.query(`
			INSERT INTO "permissions" ("resource", "operation", "description") VALUES
			('house', 'create', 'Create new houses'),
			('house', 'read', 'Read/view houses'),
			('house', 'update', 'Update existing houses'),
			('house', 'delete', 'Delete houses'),
			('house', 'list', 'List houses'),
			('inventoryItem', 'create', 'Create new inventory items'),
			('inventoryItem', 'read', 'Read/view inventory items'),
			('inventoryItem', 'update', 'Update existing inventory items'),
			('inventoryItem', 'delete', 'Delete inventory items'),
			('inventoryItem', 'list', 'List inventory items'),
			('retreat', 'create', 'Create new retreats'),
			('retreat', 'read', 'Read/view retreats'),
			('retreat', 'update', 'Update existing retreats'),
			('retreat', 'delete', 'Delete retreats'),
			('retreat', 'list', 'List retreats'),
			('participant', 'create', 'Create new participants'),
			('participant', 'read', 'Read/view participants'),
			('participant', 'update', 'Update existing participants'),
			('participant', 'delete', 'Delete participants'),
			('participant', 'list', 'List participants'),
			('user', 'create', 'Create new users'),
			('user', 'read', 'Read/view users'),
			('user', 'update', 'Update existing users'),
			('user', 'delete', 'Delete users'),
			('user', 'list', 'List users'),
			('table', 'create', 'Create new tables'),
			('table', 'read', 'Read/view tables'),
			('table', 'update', 'Update existing tables'),
			('table', 'delete', 'Delete tables'),
			('table', 'list', 'List tables'),
			('payment', 'create', 'Create new payments'),
			('payment', 'read', 'Read/view payments'),
			('payment', 'update', 'Update existing payments'),
			('payment', 'delete', 'Delete payments'),
			('payment', 'list', 'List payments'),
			('globalMessageTemplate', 'create', 'Create new global message templates'),
			('globalMessageTemplate', 'read', 'Read/view global message templates'),
			('globalMessageTemplate', 'update', 'Update existing global message templates'),
			('globalMessageTemplate', 'delete', 'Delete global message templates'),
			('globalMessageTemplate', 'list', 'List global message templates');
		`);

		// Insert default roles
		await queryRunner.query(`
			INSERT INTO "roles" ("name", "description") VALUES
			('superadmin', 'Super administrator with full system access'),
			('admin', 'Retreat administrator with management permissions'),
			('servidor', 'Server with read-only access'),
			('tesorero', 'Treasurer with financial management permissions'),
			('logística', 'Logistics coordinator with logistics permissions'),
			('palancas', 'Operations manager with operations permissions');
		`);

		// Get role IDs for easier reference
		const rolesResult = await queryRunner.query(`SELECT id, name FROM "roles"`);
		const permissionsResult = await queryRunner.query(
			`SELECT id, resource, operation FROM "permissions"`,
		);

		const roles: { [key: string]: number } = {};
		rolesResult.forEach((role: any) => {
			roles[role.name] = role.id;
		});

		const permissions: { [key: string]: number } = {};
		permissionsResult.forEach((permission: any) => {
			permissions[`${permission.resource}:${permission.operation}`] = permission.id;
		});

		// Superadmin permissions - all permissions
		const allPermissionIds = permissionsResult.map((p: any) => p.id);
		for (const permissionId of allPermissionIds) {
			await queryRunner.query(
				`INSERT INTO "role_permissions" ("roleId", "permissionId") VALUES (?, ?)`,
				[roles.superadmin, permissionId],
			);
		}

		// Admin permissions - no delete for house and inventoryItem
		const adminPermissions = [
			'house:create',
			'house:read',
			'house:update',
			'house:list',
			'inventoryItem:create',
			'inventoryItem:read',
			'inventoryItem:update',
			'inventoryItem:list',
			'retreat:create',
			'retreat:read',
			'retreat:update',
			'retreat:list',
			'participant:create',
			'participant:read',
			'participant:update',
			'participant:delete',
			'participant:list',
			'user:read',
			'user:list',
			'table:create',
			'table:read',
			'table:update',
			'table:delete',
			'table:list',
			'payment:create',
			'payment:read',
			'payment:update',
			'payment:delete',
			'payment:list',
		];

		for (const perm of adminPermissions) {
			if (permissions[perm]) {
				await queryRunner.query(
					`INSERT INTO "role_permissions" ("roleId", "permissionId") VALUES (?, ?)`,
					[roles.admin, permissions[perm]],
				);
			}
		}

		// Servidor permissions - read-only for house and inventoryItem, read for others
		const servidorPermissions = [
			'house:read',
			'house:list',
			'inventoryItem:read',
			'inventoryItem:list',
			'retreat:read',
			'participant:read',
			'user:read',
			'table:read',
			'payment:read',
		];

		for (const perm of servidorPermissions) {
			if (permissions[perm]) {
				await queryRunner.query(
					`INSERT INTO "role_permissions" ("roleId", "permissionId") VALUES (?, ?)`,
					[roles.servidor, permissions[perm]],
				);
			}
		}

		// Tesorero permissions - financial focus
		const tesoreroPermissions = [
			'retreat:read',
			'participant:read',
			'user:read',
			'payment:create',
			'payment:read',
			'payment:update',
			'payment:delete',
			'payment:list',
		];

		for (const perm of tesoreroPermissions) {
			if (permissions[perm]) {
				await queryRunner.query(
					`INSERT INTO "role_permissions" ("roleId", "permissionId") VALUES (?, ?)`,
					[roles.tesorero, permissions[perm]],
				);
			}
		}

		// Logística permissions - logistics focus
		const logisticaPermissions = [
			'house:read',
			'house:list',
			'inventoryItem:read',
			'inventoryItem:list',
			'retreat:read',
			'participant:create',
			'participant:read',
			'participant:update',
			'participant:delete',
			'participant:list',
			'user:read',
			'table:create',
			'table:read',
			'table:update',
			'table:delete',
			'table:list',
		];

		for (const perm of logisticaPermissions) {
			if (permissions[perm]) {
				await queryRunner.query(
					`INSERT INTO "role_permissions" ("roleId", "permissionId") VALUES (?, ?)`,
					[roles.logística, permissions[perm]],
				);
			}
		}

		// Palancas permissions - operations focus
		const palancasPermissions = [
			'house:read',
			'house:list',
			'inventoryItem:read',
			'inventoryItem:list',
			'retreat:read',
			'participant:create',
			'participant:read',
			'participant:update',
			'participant:delete',
			'participant:list',
			'user:read',
			'payment:create',
			'payment:read',
			'payment:update',
			'payment:delete',
			'payment:list',
		];

		for (const perm of palancasPermissions) {
			if (permissions[perm]) {
				await queryRunner.query(
					`INSERT INTO "role_permissions" ("roleId", "permissionId") VALUES (?, ?)`,
					[roles.palancas, permissions[perm]],
				);
			}
		}

		// Update existing master user to have superadmin role
		const masterEmail = process.env.SEED_MASTER_USER_EMAIL || 'admin@example.com';
		const userResult = await queryRunner.query(`SELECT id FROM "users" WHERE email = ? LIMIT 1`, [
			masterEmail,
		]);

		if (userResult.length > 0) {
			const userId = userResult[0].id;
			await queryRunner.query(`INSERT INTO "user_roles" ("userId", "roleId") VALUES (?, ?)`, [
				userId,
				roles.superadmin,
			]);
		}

		// Insert default global message templates
		await queryRunner.query(`
			INSERT INTO "global_message_templates" ("id", "name", "type", "message", "isActive", "createdAt", "updatedAt") VALUES
			(uuid(), 'Bienvenida Caminante', 'WALKER_WELCOME', '¡Hola, **{participant.nickname}**!

Con mucho gusto confirmamos tu lugar para la experiencia de fin de semana. Todo el equipo organizador está preparando los detalles para recibirte.

**Datos importantes para tu llegada:**
* **Fecha de encuentro:** {retreat.startDate}
* **Hora de llegada:** {participant.hora_llegada}

Te pedimos ser puntual para facilitar el registro de todos. ¡Estamos muy contentos de que participes! Nos vemos pronto.', 1, datetime('now'), datetime('now')),

			(uuid(), 'Bienvenida Servidor', 'SERVER_WELCOME', '¡Hermano/a **{participant.nickname}**! ✝️

¡Gracias por tu "sí" generoso al Señor! Es una verdadera bendición contar contigo en el equipo para preparar el camino a nuestros hermanos caminantes. Tu servicio y tu oración son el corazón de este retiro.

**Información clave para tu servicio:**
* **Fecha de inicio de misión:** {retreat.startDate}
* **Hora de llegada:** {participant.hora_llegada}

Que el Señor te ilumine y fortalezca en esta hermosa misión que te encomienda. ¡Unidos en oración y servicio!

¡Cristo ha resucitado!', 1, datetime('now'), datetime('now')),

			(uuid(), 'Validación Contacto de Emergencia', 'EMERGENCY_CONTACT_VALIDATION', 'Hola **{participant.nickname}**, esperamos que estés muy bien.

Estamos preparando todos los detalles para que tu fin de semana sea seguro. Para ello, necesitamos validar un dato importante.

**Contacto de Emergencia Registrado:**
* **Nombre:** {participant.emergencyContact1Name}
* **Teléfono:** {participant.emergencyContact1CellPhone}

Por favor, ayúdanos respondiendo a este mensaje con la palabra **CONFIRMADO** si los datos son correctos. Si hay algún error, simplemente envíanos la información correcta.

¡Muchas gracias por tu ayuda!', 1, datetime('now'), datetime('now')),

			(uuid(), 'Solicitud de Palanca', 'PALANCA_REQUEST', '¡Hola, hermano/a **{participant.nickname}**! ✨

Te invitamos a ser parte del motor espiritual de este retiro. Tu **palanca** es mucho más que una carta: es una oración hecha palabra, un tesoro de amor y ánimo para un caminante que la recibirá como un regalo del cielo en el momento justo.

El Señor quiere usar tus manos para escribir un mensaje que toque un corazón.

* **Fecha límite para enviar tu palanca:** {retreat.fecha_limite_palanca}

Que el Espíritu Santo inspire cada una de tus palabras. ¡Contamos contigo y con tu oración!', 1, datetime('now'), datetime('now')),

			(uuid(), 'Recordatorio de Palanca', 'PALANCA_REMINDER', '¡Paz y Bien, **{participant.nickname}**! 🙏

Este es un recordatorio amistoso y lleno de cariño. Un caminante está esperando esas palabras de aliento que el Señor ha puesto en tu corazón; esa oración que solo tú puedes escribirle. ¡No dejes pasar la oportunidad de ser luz en su camino!

* **La fecha límite para enviar tu palanca es el:** {retreat.startDate}

Gracias por tu generosidad y por sostener este retiro con tu oración.', 1, datetime('now'), datetime('now')),

			(uuid(), 'Mensaje General', 'GENERAL', 'Hola **{participant.nickname}**, te escribimos de parte del equipo del Retiro de Emaús.

{custom_message}

Que tengas un día muy bendecido. Te tenemos presente en nuestras oraciones.

Un abrazo en Cristo Resucitado.', 1, datetime('now'), datetime('now')),

			(uuid(), 'Recordatorio Pre-Retiro', 'PRE_RETREAT_REMINDER', '¡Hola, **{participant.nickname}**!

¡Ya falta muy poco para el inicio de la experiencia! Estamos preparando los últimos detalles para recibirte.

Te recordamos algunos puntos importantes:
* **Fecha:** {retreat.startDate}
* **Hora de llegada:** {participant.hora_llegada}
* **Lugar de encuentro:** {participant.pickupLocation}

**Sugerencias sobre qué llevar:**
{retreat.thingsToBringNotes}

Ven con la mente abierta y sin expectativas, ¡prepárate para un fin de semana diferente!

Un saludo.', 1, datetime('now'), datetime('now')),

			(uuid(), 'Recordatorio de Pago', 'PAYMENT_REMINDER', 'Hola **{participant.nickname}**, ¿cómo estás?

Te escribimos del equipo de organización. Para poder cerrar los detalles administrativos, te recordamos que está pendiente tu aporte de **{retreat.cost}**.

Aquí te dejamos la información para realizarlo:
{retreat.paymentInfo}

Si ya lo realizaste, por favor ignora este mensaje. Si tienes alguna dificultad, no dudes en contactarnos con toda confianza. ¡Tu presencia es lo más importante!

Saludos.', 1, datetime('now'), datetime('now')),

			(uuid(), 'Mensaje Post-Retiro (Cuarto Día)', 'POST_RETREAT_MESSAGE', '¡Bienvenido a tu Cuarto Día, **{participant.nickname}**! 🎉

¡Cristo ha resucitado! ¡En verdad ha resucitado!

El retiro ha terminado, pero tu verdadero camino apenas comienza. Jesús resucitado camina contigo, no lo olvides nunca. La comunidad de Emaús está aquí para apoyarte.

Te esperamos en nuestras reuniones de perseverancia para seguir creciendo juntos en la fe. La próxima es el **{retreat.next_meeting_date}**.

¡Ánimo, peregrino! Un fuerte abrazo.', 1, datetime('now'), datetime('now')),

			(uuid(), 'Confirmación de Cancelación', 'CANCELLATION_CONFIRMATION', 'Hola, **{participant.nickname}**.

Hemos recibido tu notificación de cancelación. Lamentamos que no puedas acompañarnos en esta ocasión y esperamos que te encuentres bien.

Las puertas siempre estarán abiertas para cuando sea el momento adecuado para ti. Te enviamos nuestros mejores deseos.

Un saludo cordial.', 1, datetime('now'), datetime('now')),

			(uuid(), 'Invitación de Usuario', 'USER_INVITATION', '<h2>Bienvenido/a al Retiro de Emaús</h2>

<p>Hola <strong>{user.name}</strong>,</p>

<p><strong>{inviterName}</strong> te ha invitado a unirte al retiro <strong>{retreat.name}</strong>.</p>

<p><strong>Detalles del retiro:</strong></p>
<ul>
<li><strong>Fecha:</strong> {retreat.startDate}</li>
<li><strong>Parroquia:</strong> {retreat.name}</li>
</ul>

<p>Para comenzar, por favor <a href="{shareLink}">haz clic aquí para aceptar la invitación</a> y crear tu cuenta.</p>

<p>Si tienes alguna pregunta, no dudes en contactarnos.</p>

<p>¡Esperamos contar con tu presencia!</p>

<p>Atentamente,<br>Equipo de Emaús</p>', 1, datetime('now'), datetime('now')),

			(uuid(), 'Restablecimiento de Contraseña', 'PASSWORD_RESET', '<h2>Restablecimiento de Contraseña</h2>

<p>Hola <strong>{user.name}</strong>,</p>

<p>Hemos recibido una solicitud para restablecer la contraseña de tu cuenta.</p>

<p>Para continuar con el proceso, por favor <a href="{resetToken}">haz clic aquí</a> o copia y pega el siguiente enlace en tu navegador:</p>

<p><a href="{resetToken}">{resetToken}</a></p>

<p>Si no solicitaste este cambio, puedes ignorar este mensaje. Tu contraseña actual permanecerá sin cambios.</p>

<p>El enlace expirará en 1 hora por seguridad.</p>

<p>Atentamente,<br>Equipo de Emaús</p>', 1, datetime('now'), datetime('now')),

			(uuid(), 'Notificación de Retiro Compartido', 'RETREAT_SHARED_NOTIFICATION', '<h2>Retiro Compartido Contigo</h2>

<p>Hola <strong>{user.name}</strong>,</p>

<p><strong>{inviterName}</strong> ha compartido contigo el retiro <strong>{retreat.name}</strong>.</p>

<p><strong>Detalles del retiro:</strong></p>
<ul>
<li><strong>Fecha:</strong> {retreat.startDate}</li>
<li><strong>Parroquia:</strong> {retreat.name}</li>
</ul>

<p>Puedes acceder al retiro utilizando el siguiente enlace: <a href="{shareLink}">{shareLink}</a></p>

<p>Si tienes alguna pregunta sobre el retiro, por favor contacta a {inviterName}.</p>

<p>¡Esperamos que disfrutes esta experiencia!</p>

<p>Atentamente,<br>Equipo de Emaús</p>', 1, datetime('now'), datetime('now')),

			(uuid(), 'Mensaje de Cumpleaños', 'BIRTHDAY_MESSAGE', '¡Feliz cumpleaños, **{participant.nickname}**! 🎂🎉

Que este día tan especial esté lleno de alegría, bendiciones y momentos inolvidables junto a tus seres queridos.

Que Dios te conceda muchos años más de vida, salud y felicidad. Que cada nuevo año que comiences esté lleno de sueños cumplidos y metas alcanzadas.

La comunidad de Emaús te envía nuestros mejores deseos en tu cumpleaños. ¡Que tengas un día maravilloso!

Un abrazo fuerte y ¡feliz cumpleaños!', 1, datetime('now'), datetime('now'));
		`);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		// Drop indexes first
		await queryRunner.query(`DROP INDEX IF EXISTS "idx_retreat_inventory_inventoryItemId"`);
		await queryRunner.query(`DROP INDEX IF EXISTS "idx_retreat_inventory_retreatId"`);
		await queryRunner.query(`DROP INDEX IF EXISTS "idx_inventory_item_teamId"`);
		await queryRunner.query(`DROP INDEX IF EXISTS "idx_inventory_item_categoryId"`);
		await queryRunner.query(`DROP INDEX IF EXISTS "idx_message_templates_retreatId"`);
		await queryRunner.query(`DROP INDEX IF EXISTS "idx_retreat_responsibilities_participantId"`);
		await queryRunner.query(`DROP INDEX IF EXISTS "idx_retreat_responsibilities_retreatId"`);
		await queryRunner.query(`DROP INDEX IF EXISTS "idx_retreat_bed_participantId"`);
		await queryRunner.query(`DROP INDEX IF EXISTS "idx_retreat_bed_retreatId"`);
		await queryRunner.query(`DROP INDEX IF EXISTS "idx_tables_retreatId"`);
		await queryRunner.query(`DROP INDEX IF EXISTS "idx_participants_retreatBedId"`);
		await queryRunner.query(`DROP INDEX IF EXISTS "idx_participants_tableId"`);
		await queryRunner.query(`DROP INDEX IF EXISTS "idx_participants_retreatId"`);
		await queryRunner.query(`DROP INDEX IF EXISTS "idx_users_googleId"`);
		await queryRunner.query(`DROP INDEX IF EXISTS "idx_users_email"`);

		// Drop indexes for RBAC tables first
		await queryRunner.query(`DROP INDEX IF EXISTS "idx_permission_override_logs_created_at"`);
		await queryRunner.query(`DROP INDEX IF EXISTS "idx_permission_override_logs_set_by"`);
		await queryRunner.query(`DROP INDEX IF EXISTS "idx_permission_override_logs_retreat_id"`);
		await queryRunner.query(`DROP INDEX IF EXISTS "idx_permission_override_logs_user_id"`);
		await queryRunner.query(`DROP INDEX IF EXISTS "IDX_permission_delegations_status"`);
		await queryRunner.query(`DROP INDEX IF EXISTS "IDX_permission_delegations_expires_at"`);
		await queryRunner.query(`DROP INDEX IF EXISTS "IDX_permission_delegations_retreat"`);
		await queryRunner.query(`DROP INDEX IF EXISTS "IDX_permission_delegations_to_user"`);
		await queryRunner.query(`DROP INDEX IF EXISTS "IDX_permission_delegations_from_user"`);
		await queryRunner.query(`DROP INDEX IF EXISTS "idx_role_requests_requested_at"`);
		await queryRunner.query(`DROP INDEX IF EXISTS "idx_role_requests_status"`);
		await queryRunner.query(`DROP INDEX IF EXISTS "idx_role_requests_retreat_id"`);
		await queryRunner.query(`DROP INDEX IF EXISTS "idx_role_requests_user_id"`);
		await queryRunner.query(`DROP INDEX IF EXISTS "IDX_audit_logs_action_resource"`);
		await queryRunner.query(`DROP INDEX IF EXISTS "IDX_audit_logs_created_at"`);
		await queryRunner.query(`DROP INDEX IF EXISTS "IDX_audit_logs_retreat_id"`);
		await queryRunner.query(`DROP INDEX IF EXISTS "IDX_audit_logs_target_user_id"`);
		await queryRunner.query(`DROP INDEX IF EXISTS "IDX_audit_logs_user_id"`);
		await queryRunner.query(`DROP INDEX IF EXISTS "IDX_audit_logs_resource_type"`);
		await queryRunner.query(`DROP INDEX IF EXISTS "IDX_audit_logs_action_type"`);
		await queryRunner.query(`DROP INDEX IF EXISTS "idx_user_retreats_expiresAt"`);
		await queryRunner.query(`DROP INDEX IF EXISTS "idx_user_retreats_status"`);
		await queryRunner.query(`DROP INDEX IF EXISTS "idx_user_retreats_invitedBy"`);
		await queryRunner.query(`DROP INDEX IF EXISTS "idx_retreat_isPublic"`);
		await queryRunner.query(`DROP INDEX IF EXISTS "idx_retreat_createdBy"`);

		// Drop indexes for payments table first
		await queryRunner.query(`DROP INDEX IF EXISTS "idx_payments_recordedBy"`);
		await queryRunner.query(`DROP INDEX IF EXISTS "idx_payments_paymentDate"`);
		await queryRunner.query(`DROP INDEX IF EXISTS "idx_payments_retreatId"`);
		await queryRunner.query(`DROP INDEX IF EXISTS "idx_payments_participantId"`);

		// Drop tables in reverse order to respect foreign key constraints
		await queryRunner.query(`DROP TABLE IF EXISTS "payments"`);
		await queryRunner.query(`DROP TABLE IF EXISTS "permission_override_logs"`);
		await queryRunner.query(`DROP TABLE IF EXISTS "permission_delegations"`);
		await queryRunner.query(`DROP TABLE IF EXISTS "role_requests"`);
		await queryRunner.query(`DROP TABLE IF EXISTS "audit_logs"`);
		await queryRunner.query(`DROP TABLE IF EXISTS "user_retreats"`);
		await queryRunner.query(`DROP TABLE IF EXISTS "user_roles"`);
		await queryRunner.query(`DROP TABLE IF EXISTS "role_permissions"`);
		await queryRunner.query(`DROP TABLE IF EXISTS "roles"`);
		await queryRunner.query(`DROP TABLE IF EXISTS "permissions"`);
		await queryRunner.query(`DROP TABLE IF EXISTS "retreat_inventory"`);
		await queryRunner.query(`DROP TABLE IF EXISTS "inventory_item"`);
		await queryRunner.query(`DROP TABLE IF EXISTS "inventory_team"`);
		await queryRunner.query(`DROP TABLE IF EXISTS "inventory_category"`);
		await queryRunner.query(`DROP TABLE IF EXISTS "message_templates"`);
		await queryRunner.query(`DROP TABLE IF EXISTS "retreat_responsibilities"`);
		await queryRunner.query(`DROP TABLE IF EXISTS "retreat_bed"`);
		await queryRunner.query(`DROP TABLE IF EXISTS "tables"`);
		await queryRunner.query(`DROP TABLE IF EXISTS "participants"`);
		await queryRunner.query(`DROP TABLE IF EXISTS "retreat"`);
		await queryRunner.query(`DROP TABLE IF EXISTS "bed"`);
		await queryRunner.query(`DROP TABLE IF EXISTS "house"`);
		await queryRunner.query(`DROP TABLE IF EXISTS "users"`);
	}
}
