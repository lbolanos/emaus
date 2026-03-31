import { MigrationInterface, QueryRunner } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';

export class CreateSchema20250910163337 implements MigrationInterface {
	name = 'CreateSchema';
	timestamp = '20250910163337';

	public async up(queryRunner: QueryRunner): Promise<void> {
		// Create sessions table for connect-typeorm
		await queryRunner.query(`
			CREATE TABLE IF NOT EXISTS "sessions" (
				"id" VARCHAR(255) PRIMARY KEY NOT NULL,
				"expiredAt" BIGINT NOT NULL,
				"json" TEXT NOT NULL,
				"destroyedAt" DATETIME
			)
		`);
		await queryRunner.query(`CREATE INDEX "IDX_expiredAt" ON "sessions" ("expiredAt")`);

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
				"contactPhones" TEXT,
				"cost" VARCHAR(255),
				"paymentInfo" TEXT,
				"paymentMethods" TEXT,
				"max_walkers" INTEGER,
				"max_servers" INTEGER,
				"createdBy" VARCHAR(36),
				"isPublic" BOOLEAN DEFAULT 0,
				"roleInvitationEnabled" BOOLEAN DEFAULT 0,
				FOREIGN KEY ("houseId") REFERENCES "house" ("id") ON DELETE RESTRICT,
				FOREIGN KEY ("createdBy") REFERENCES "users" ("id") ON DELETE SET NULL
			)
		`);

		// Create participants table (with correct shirt field types)
		await queryRunner.query(`
			CREATE TABLE IF NOT EXISTS "participants" (
				"id" VARCHAR(36) PRIMARY KEY NOT NULL,
				"id_on_retreat" INTEGER NOT NULL,
				"type" VARCHAR(255) NOT NULL CHECK ("type" IN ('walker', 'server', 'waiting','partial_server')),
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
				"type" VARCHAR(255) NOT NULL CHECK ("type" IN ('WALKER_WELCOME', 'SERVER_WELCOME', 'EMERGENCY_CONTACT_VALIDATION', 'PALANCA_REQUEST', 'PALANCA_REMINDER', 'GENERAL', 'PRE_RETREAT_REMINDER', 'PAYMENT_REMINDER', 'POST_RETREAT_MESSAGE', 'CANCELLATION_CONFIRMATION', 'USER_INVITATION', 'PASSWORD_RESET', 'RETREAT_SHARED_NOTIFICATION', 'BIRTHDAY_MESSAGE')),
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
				"type" VARCHAR(255) NOT NULL CHECK ("type" IN ('WALKER_WELCOME', 'SERVER_WELCOME', 'EMERGENCY_CONTACT_VALIDATION', 'PALANCA_REQUEST', 'PALANCA_REMINDER', 'GENERAL', 'PRE_RETREAT_REMINDER', 'PAYMENT_REMINDER', 'POST_RETREAT_MESSAGE', 'CANCELLATION_CONFIRMATION', 'USER_INVITATION', 'PASSWORD_RESET', 'RETREAT_SHARED_NOTIFICATION', 'BIRTHDAY_MESSAGE', 'SYS_PASSWORD_RESET', 'SYS_USER_INVITATION', 'SYS_REGISTRATION_CONFIRMATION', 'SYS_EMAIL_VERIFICATION', 'SYS_ACCOUNT_LOCKED', 'SYS_ACCOUNT_UNLOCKED', 'SYS_ROLE_REQUESTED', 'SYS_ROLE_APPROVED', 'SYS_ROLE_REJECTED')),
				"message" TEXT NOT NULL,
				"isActive" BOOLEAN NOT NULL DEFAULT (1),
				"createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
				"updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
			)
		`);

		// Create participant_communications table
		await queryRunner.query(`
			CREATE TABLE IF NOT EXISTS "participant_communications" (
				"id" VARCHAR(36) PRIMARY KEY NOT NULL,
				"participantId" VARCHAR(36) NOT NULL,
				"retreatId" VARCHAR(36) NOT NULL,
				"messageType" VARCHAR(20) NOT NULL CHECK ("messageType" IN ('whatsapp', 'email')),
				"recipientContact" VARCHAR(255) NOT NULL,
				"messageContent" TEXT NOT NULL,
				"templateId" VARCHAR(36),
				"templateName" VARCHAR(255),
				"subject" VARCHAR(500),
				"sentAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
				"sentBy" VARCHAR(36),
				FOREIGN KEY ("participantId") REFERENCES "participants" ("id") ON DELETE CASCADE,
				FOREIGN KEY ("retreatId") REFERENCES "retreat" ("id") ON DELETE CASCADE,
				FOREIGN KEY ("templateId") REFERENCES "message_templates" ("id") ON DELETE SET NULL,
				FOREIGN KEY ("sentBy") REFERENCES "users" ("id") ON DELETE SET NULL
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

		// Add indexes for participant_communications table
		await queryRunner.query(
			`CREATE INDEX IF NOT EXISTS "idx_participant_communications_participantId" ON "participant_communications"("participantId")`,
		);
		await queryRunner.query(
			`CREATE INDEX IF NOT EXISTS "idx_participant_communications_retreatId" ON "participant_communications"("retreatId")`,
		);
		await queryRunner.query(
			`CREATE INDEX IF NOT EXISTS "idx_participant_communications_sentAt" ON "participant_communications"("sentAt")`,
		);
		await queryRunner.query(
			`CREATE INDEX IF NOT EXISTS "idx_participant_communications_messageType" ON "participant_communications"("messageType")`,
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
			INSERT OR IGNORE INTO "permissions" ("resource", "operation", "description") VALUES
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
			('retreat', 'invite', 'Invite users to retreat'),
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
			('user', 'manage', 'Manage user roles and retreat assignments'),
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
			('retreatInventory', 'create', 'Create new retreat inventory'),
			('retreatInventory', 'read', 'Read/view retreat inventory'),
			('retreatInventory', 'update', 'Update existing retreat inventory'),
			('retreatInventory', 'delete', 'Delete retreat inventory'),
			('retreatInventory', 'list', 'List retreat inventory'),
			('responsability', 'create', 'Create new responsibilities'),
			('responsability', 'read', 'Read/view responsibilities'),
			('responsability', 'update', 'Update existing responsibilities'),
			('responsability', 'delete', 'Delete responsibilities'),
			('responsability', 'list', 'List responsibilities'),
			('messageTemplate', 'create', 'Create new message templates'),
			('messageTemplate', 'read', 'Read/view message templates'),
			('messageTemplate', 'update', 'Update existing message templates'),
			('messageTemplate', 'delete', 'Delete message templates'),
			('messageTemplate', 'list', 'List message templates'),
			('audit', 'read', 'Read Audit logs'),
			('system', 'admin', 'System administration tasks'),
			('messageTemplate', 'list', 'List message templates'),
			('globalMessageTemplate', 'create', 'Create new global message templates'),
			('globalMessageTemplate', 'read', 'Read/view global message templates'),
			('globalMessageTemplate', 'update', 'Update existing global message templates'),
			('globalMessageTemplate', 'delete', 'Delete global message templates'),
			('globalMessageTemplate', 'list', 'List global message templates');
		`);

		// Insert default roles
		await queryRunner.query(`
			INSERT INTO "roles" ("name", "description") VALUES
			-- Global roles (for user_roles table)
			('superadmin', 'Super administrator with full system access'),
			('region_admin', 'Regional administrator with limited global access'),
			('regular', 'Regular user with read-only access, no delete permissions'),
			-- Retreat roles (for user_retreats table)
			('admin', 'Retreat administrator with retreat management permissions'),
			('treasurer', 'Treasurer with financial management permissions'),
			('logistics', 'Logistics coordinator with inventory and logistics permissions'),
			('communications', 'Communications coordinator with message template permissions'),
			('regular_server', 'Regular server with basic retreat access');
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

		// Superadmin permissions - all permissions (global role)
		const allPermissionIds = permissionsResult.map((p: any) => p.id);
		for (const permissionId of allPermissionIds) {
			await queryRunner.query(
				`INSERT INTO "role_permissions" ("roleId", "permissionId") VALUES (?, ?)`,
				[roles.superadmin, permissionId],
			);
		}

		// Region Admin permissions - global access to InventoryItem, House, global_message_templates (no delete on House)
		const regionAdminPermissions = [
			'house:create',
			'house:read',
			'house:update',
			'house:list',
			'inventoryItem:create',
			'inventoryItem:read',
			'inventoryItem:update',
			'inventoryItem:delete',
			'inventoryItem:list',
			'globalMessageTemplate:create',
			'globalMessageTemplate:read',
			'globalMessageTemplate:update',
			'globalMessageTemplate:delete',
			'globalMessageTemplate:list',
		];

		for (const perm of regionAdminPermissions) {
			if (permissions[perm]) {
				await queryRunner.query(
					`INSERT INTO "role_permissions" ("roleId", "permissionId") VALUES (?, ?)`,
					[roles.region_admin, permissions[perm]],
				);
			}
		}

		// Regular permissions - read-only access, NO delete permissions
		const regularPermissions = [
			'house:read',
			'house:list',
			'inventoryItem:read',
			'inventoryItem:list',
			'globalMessageTemplate:read',
			'globalMessageTemplate:list',
		];

		for (const perm of regularPermissions) {
			if (permissions[perm]) {
				await queryRunner.query(
					`INSERT INTO "role_permissions" ("roleId", "permissionId") VALUES (?, ?)`,
					[roles.regular, permissions[perm]],
				);
			}
		}

		// Admin permissions (retreat role) - full retreat management except user management
		const adminRetreatPermissions = [
			'user:manage',
			'retreat:create',
			'retreat:read',
			'retreat:update',
			'retreat:list',
			'retreat:invite',
			'participant:create',
			'participant:read',
			'participant:update',
			'participant:delete',
			'participant:list',
			'table:create',
			'table:read',
			'table:update',
			'table:delete',
			'table:list',
			'responsability:create',
			'responsability:read',
			'responsability:update',
			'responsability:delete',
			'responsability:list',
			'messageTemplate:create',
			'messageTemplate:read',
			'messageTemplate:update',
			'messageTemplate:delete',
			'messageTemplate:list',
			'payment:create',
			'payment:read',
			'payment:update',
			'payment:delete',
			'payment:list',
			'retreatInventory:create',
			'retreatInventory:read',
			'retreatInventory:update',
			'retreatInventory:delete',
			'retreatInventory:list',
		];

		for (const perm of adminRetreatPermissions) {
			if (permissions[perm]) {
				await queryRunner.query(
					`INSERT INTO "role_permissions" ("roleId", "permissionId") VALUES (?, ?)`,
					[roles.admin, permissions[perm]],
				);
			}
		}

		// Treasurer permissions (retreat role) - financial focus
		const treasurerPermissions = [
			'retreat:create',
			'retreat:read',
			'retreat:update',
			'retreat:list',
			'participant:create',
			'participant:read',
			'participant:update',
			'participant:delete',
			'participant:list',
			'payment:create',
			'payment:read',
			'payment:update',
			'payment:delete',
			'payment:list',
		];

		for (const perm of treasurerPermissions) {
			if (permissions[perm]) {
				await queryRunner.query(
					`INSERT INTO "role_permissions" ("roleId", "permissionId") VALUES (?, ?)`,
					[roles.treasurer, permissions[perm]],
				);
			}
		}

		// Logistics permissions (retreat role) - inventory and logistics focus
		const logisticsPermissions = [
			'retreat:create',
			'retreat:read',
			'retreat:update',
			'retreat:list',
			'retreat:invite',
			'participant:create',
			'participant:read',
			'participant:update',
			'participant:delete',
			'participant:list',
			'table:create',
			'table:read',
			'table:update',
			'table:delete',
			'table:list',
			'responsability:create',
			'responsability:read',
			'responsability:update',
			'responsability:delete',
			'responsability:list',
			'messageTemplate:create',
			'messageTemplate:read',
			'messageTemplate:update',
			'messageTemplate:delete',
			'messageTemplate:list',
			'payment:create',
			'payment:read',
			'payment:update',
			'payment:delete',
			'payment:list',
		];

		for (const perm of logisticsPermissions) {
			if (permissions[perm]) {
				await queryRunner.query(
					`INSERT INTO "role_permissions" ("roleId", "permissionId") VALUES (?, ?)`,
					[roles.logistics, permissions[perm]],
				);
			}
		}

		// Communications permissions (retreat role) - message templates focus
		const communicationsPermissions = [
			'retreat:create',
			'retreat:read',
			//'retreat:update',
			'retreat:list',
			//'retreat:invite',
			'participant:create',
			'participant:read',
			'participant:update',
			'participant:delete',
			'participant:list',
			//'table:create',
			//'table:read',
			//'table:update',
			//'table:delete',
			//'table:list',
			//'responsability:create',
			//'responsability:read',
			//'responsability:update',
			//'responsability:delete',
			//'responsability:list',
			'messageTemplate:create',
			'messageTemplate:read',
			'messageTemplate:update',
			'messageTemplate:delete',
			'messageTemplate:list',
		];

		for (const perm of communicationsPermissions) {
			if (permissions[perm]) {
				await queryRunner.query(
					`INSERT INTO "role_permissions" ("roleId", "permissionId") VALUES (?, ?)`,
					[roles.communications, permissions[perm]],
				);
			}
		}

		// Regular Server permissions (retreat role) - basic read access
		const regularServerPermissions = ['retreat:read', 'participant:read', 'table:read'];

		for (const perm of regularServerPermissions) {
			if (permissions[perm]) {
				await queryRunner.query(
					`INSERT INTO "role_permissions" ("roleId", "permissionId") VALUES (?, ?)`,
					[roles.regular_server, permissions[perm]],
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
			('${uuidv4()}', 'Bienvenida Caminante', 'WALKER_WELCOME', '<p>¡Hola, <strong>{participant.nickname}</strong>!</p><p>Con mucho gusto confirmamos tu lugar para la experiencia de fin de semana. Todo el equipo organizador está preparando los detalles para recibirte.</p><p><strong>Datos importantes para tu llegada:</strong><br>* <strong>Fecha de encuentro:</strong> {retreat.startDate}<br>* <strong>Hora de llegada:</strong> {participant.hora_llegada}</p><p>Te pedimos ser puntual para facilitar el registro de todos. ¡Estamos muy contentos de que participes! Nos vemos pronto.</p>', 1, datetime('now'), datetime('now')),

			('${uuidv4()}', 'Bienvenida Servidor', 'SERVER_WELCOME', '<p>¡Hermano/a <strong>{participant.nickname}</strong>! ✝️</p><p>¡Gracias por tu "sí" generoso al Señor! Es una verdadera bendición contar contigo en el equipo para preparar el camino a nuestros hermanos caminantes. Tu servicio y tu oración son el corazón de este retiro.</p><p><strong>Información clave para tu servicio:</strong><br>* <strong>Fecha de inicio de misión:</strong> {retreat.startDate}<br>* <strong>Hora de llegada:</strong> {participant.hora_llegada}</p><p>Que el Señor te ilumine y fortalezca en esta hermosa misión que te encomienda. ¡Unidos en oración y servicio!</p><p>¡Cristo ha resucitado!</p>', 1, datetime('now'), datetime('now')),

			('${uuidv4()}', 'Validación Contacto de Emergencia', 'EMERGENCY_CONTACT_VALIDATION', '<p>Hola <strong>{participant.nickname}</strong>, esperamos que estés muy bien.</p><p>Estamos preparando todos los detalles para que tu fin de semana sea seguro. Para ello, necesitamos validar un dato importante.</p><p><strong>Contacto de Emergencia Registrado:</strong><br>* <strong>Nombre:</strong> {participant.emergencyContact1Name}<br>* <strong>Teléfono:</strong> {participant.emergencyContact1CellPhone}</p><p>Por favor, ayúdanos respondiendo a este mensaje con la palabra <strong>CONFIRMADO</strong> si los datos son correctos. Si hay algún error, simplemente envíanos la información correcta.</p><p>¡Muchas gracias por tu ayuda!</p>', 1, datetime('now'), datetime('now')),

			('${uuidv4()}', 'Solicitud de Palanca', 'PALANCA_REQUEST', '<p>¡Hola, hermano/a <strong>{participant.nickname}</strong>! ✨</p><p>Te invitamos a ser parte del motor espiritual de este retiro. Tu <strong>palanca</strong> es mucho más que una carta: es una oración hecha palabra, un tesoro de amor y ánimo para un caminante que la recibirá como un regalo del cielo en el momento justo.</p><p>El Señor quiere usar tus manos para escribir un mensaje que toque un corazón.</p><p>* <strong>Fecha límite para enviar tu palanca:</strong> {retreat.fecha_limite_palanca}</p><p>Que el Espíritu Santo inspire cada una de tus palabras. ¡Contamos contigo y con tu oración!</p>', 1, datetime('now'), datetime('now')),

			('${uuidv4()}', 'Recordatorio de Palanca', 'PALANCA_REMINDER', '<p>¡Paz y Bien, <strong>{participant.nickname}</strong>! 🙏</p><p>Este es un recordatorio amistoso y lleno de cariño. Un caminante está esperando esas palabras de aliento que el Señor ha puesto en tu corazón; esa oración que solo tú puedes escribirle. ¡No dejes pasar la oportunidad de ser luz en su camino!</p><p>* <strong>La fecha límite para enviar tu palanca es el:</strong> {retreat.startDate}</p><p>Gracias por tu generosidad y por sostener este retiro con tu oración.</p>', 1, datetime('now'), datetime('now')),

			('${uuidv4()}', 'Mensaje General', 'GENERAL', '<p>Hola <strong>{participant.nickname}</strong>, te escribimos de parte del equipo del Retiro de Emaús.</p><p>{custom_message}</p><p>Que tengas un día muy bendecido. Te tenemos presente en nuestras oraciones.</p><p>Un abrazo en Cristo Resucitado.</p>', 1, datetime('now'), datetime('now')),

			('${uuidv4()}', 'Recordatorio Pre-Retiro', 'PRE_RETREAT_REMINDER', '<p>¡Hola, <strong>{participant.nickname}</strong>!</p><p>¡Ya falta muy poco para el inicio de la experiencia! Estamos preparando los últimos detalles para recibirte.</p><p><strong>Te recordamos algunos puntos importantes:</strong><br>* <strong>Fecha:</strong> {retreat.startDate}<br>* <strong>Hora de llegada:</strong> {participant.hora_llegada}<br>* <strong>Lugar de encuentro:</strong> {participant.pickupLocation}</p><p><strong>Sugerencias sobre qué llevar:</strong><br>{retreat.thingsToBringNotes}</p><p>Ven con la mente abierta y sin expectativas, ¡prepárate para un fin de semana diferente!</p><p>Un saludo.</p>', 1, datetime('now'), datetime('now')),

			('${uuidv4()}', 'Recordatorio de Pago', 'PAYMENT_REMINDER', '<p>Hola <strong>{participant.nickname}</strong>, ¿cómo estás?</p><p>Te escribimos del equipo de organización. Para poder cerrar los detalles administrativos, te recordamos que está pendiente tu aporte de <strong>{retreat.cost}</strong>.</p><p>Aquí te dejamos la información para realizarlo:<br>{retreat.paymentInfo}</p><p>Si ya lo realizaste, por favor ignora este mensaje. Si tienes alguna dificultad, no dudes en contactarnos con toda confianza. ¡Tu presencia es lo más importante!</p><p>Saludos.</p>', 1, datetime('now'), datetime('now')),

			('${uuidv4()}', 'Mensaje Post-Retiro (Cuarto Día)', 'POST_RETREAT_MESSAGE', '<p>¡Bienvenido a tu Cuarto Día, <strong>{participant.nickname}</strong>! 🎉</p><p>¡Cristo ha resucitado! ¡En verdad ha resucitado!</p><p>El retiro ha terminado, pero tu verdadero camino apenas comienza. Jesús resucitado camina contigo, no lo olvides nunca. La comunidad de Emaús está aquí para apoyarte.</p><p>Te esperamos en nuestras reuniones de perseverancia para seguir creciendo juntos en la fe. La próxima es el <strong>{retreat.next_meeting_date}</strong>.</p><p>¡Ánimo, peregrino! Un fuerte abrazo.</p>', 1, datetime('now'), datetime('now')),

			('${uuidv4()}', 'Confirmación de Cancelación', 'CANCELLATION_CONFIRMATION', '<p>Hola, <strong>{participant.nickname}</strong>.</p><p>Hemos recibido tu notificación de cancelación. Lamentamos que no puedas acompañarnos en esta ocasión y esperamos que te encuentres bien.</p><p>Las puertas siempre estarán abiertas para cuando sea el momento adecuado para ti. Te enviamos nuestros mejores deseos.</p><p>Un saludo cordial.</p>', 1, datetime('now'), datetime('now')),

			('${uuidv4()}', 'Invitación de Usuario', 'USER_INVITATION', '<h2>Bienvenido/a al Retiro de Emaús</h2><p>Hola <strong>{user.name}</strong>,</p><p><strong>{inviterName}</strong> te ha invitado a unirte al retiro <strong>{retreat.name}</strong>.</p><p><strong>Detalles del retiro:</strong></p><ul><li><strong>Fecha:</strong> {retreat.startDate}</li><li><strong>Parroquia:</strong> {retreat.name}</li></ul><p>Para comenzar, por favor <a href="{shareLink}">haz clic aquí para aceptar la invitación</a> y crear tu cuenta.</p><p>Si tienes alguna pregunta, no dudes en contactarnos.</p><p>¡Esperamos contar con tu presencia!</p><p>Atentamente,<br>Equipo de Emaús</p>', 1, datetime('now'), datetime('now')),

			('${uuidv4()}', 'Restablecimiento de Contraseña', 'PASSWORD_RESET', '<h2>Restablecimiento de Contraseña</h2><p>Hola <strong>{user.name}</strong>,</p><p>Hemos recibido una solicitud para restablecer la contraseña de tu cuenta.</p><p>Para continuar con el proceso, por favor <a href="{resetToken}">haz clic aquí</a> o copia y pega el siguiente enlace en tu navegador:</p><p><a href="{resetToken}">{resetToken}</a></p><p>Si no solicitaste este cambio, puedes ignorar este mensaje. Tu contraseña actual permanecerá sin cambios.</p><p>El enlace expirará en 1 hora por seguridad.</p><p>Atentamente,<br>Equipo de Emaús</p>', 1, datetime('now'), datetime('now')),

			('${uuidv4()}', 'Notificación de Retiro Compartido', 'RETREAT_SHARED_NOTIFICATION', '<h2>Retiro Compartido Contigo</h2><p>Hola <strong>{user.name}</strong>,</p><p><strong>{inviterName}</strong> ha compartido contigo el retiro <strong>{retreat.name}</strong>.</p><p><strong>Detalles del retiro:</strong></p><ul><li><strong>Fecha:</strong> {retreat.startDate}</li><li><strong>Parroquia:</strong> {retreat.name}</li></ul><p>Puedes acceder al retiro utilizando el siguiente enlace: <a href="{shareLink}">{shareLink}</a></p><p>Si tienes alguna pregunta sobre el retiro, por favor contacta a {inviterName}.</p><p>¡Esperamos que disfrutes esta experiencia!</p><p>Atentamente,<br>Equipo de Emaús</p>', 1, datetime('now'), datetime('now')),

			('${uuidv4()}', 'Mensaje de Cumpleaños', 'BIRTHDAY_MESSAGE', '<p>¡Feliz cumpleaños, <strong>{participant.nickname}</strong>! 🎂🎉</p><p>Que este día tan especial esté lleno de alegría, bendiciones y momentos inolvidables junto a tus seres queridos.</p><p>Que Dios te conceda muchos años más de vida, salud y felicidad. Que cada nuevo año que comiences esté lleno de sueños cumplidos y metas alcanzadas.</p><p>La comunidad de Emaús te envía nuestros mejores deseos en tu cumpleaños. ¡Que tengas un día maravilloso!</p><p>Un abrazo fuerte y ¡feliz cumpleaños!</p>', 1, datetime('now'), datetime('now')),

			('${uuidv4()}', 'Restablecimiento de Contraseña (Sistema)', 'SYS_PASSWORD_RESET', '<h2>Restablecimiento de Contraseña</h2><p>Hola <strong>{user.displayName}</strong>,</p><p>Hemos recibido una solicitud para restablecer la contraseña de tu cuenta en el sistema Emaús.</p><p>Para continuar con el proceso, por favor <a href="{resetUrl}">haz clic aquí</a> o copia y pega el siguiente enlace en tu navegador:</p><p><a href="{resetUrl}">{resetUrl}</a></p><p>Si no solicitaste este cambio, puedes ignorar este mensaje. Tu contraseña actual permanecerá sin cambios.</p><p>El enlace expirará en 1 hora por seguridad.</p><p>Atentamente,<br>Equipo de Emaús</p>', 1, datetime('now'), datetime('now')),

			('${uuidv4()}', 'Invitación de Usuario (Sistema)', 'SYS_USER_INVITATION', '<h2>Bienvenido/a al Sistema Emaús</h2><p>Hola <strong>{user.displayName}</strong>,</p><p><strong>{inviterName}</strong> te ha invitado a unirte al sistema de gestión de retiros Emaús con el rol de <strong>{role.name}</strong>.</p><p>Para comenzar, por favor <a href="{invitationUrl}">haz clic aquí para aceptar la invitación</a> y crear tu cuenta.</p><p>Tu correo electrónico para acceder es: <strong>{user.email}</strong></p><p>Si tienes alguna pregunta, no dudes en contactarnos.</p><p>¡Esperamos contar contigo!</p><p>Atentamente,<br>Equipo de Emaús</p>', 1, datetime('now'), datetime('now')),

			('${uuidv4()}', 'Confirmación de Registro (Sistema)', 'SYS_REGISTRATION_CONFIRMATION', '<h2>¡Bienvenido/a al Sistema Emaús!</h2><p>Hola <strong>{user.displayName}</strong>,</p><p>Tu cuenta ha sido creada exitosamente en el sistema de gestión de retiros Emaús.</p><p><strong>Datos de tu cuenta:</strong></p><ul><li><strong>Correo electrónico:</strong> {user.email}</li><li><strong>Nombre:</strong> {user.displayName}</li></ul><p>Ya puedes comenzar a utilizar el sistema con tus credenciales.</p><p>Si tienes alguna pregunta, no dudes en contactar al administrador del sistema.</p><p>¡Que tengas un bendecido día!</p><p>Atentamente,<br>Equipo de Emaús</p>', 1, datetime('now'), datetime('now')),

			('${uuidv4()}', 'Verificación de Correo Electrónico (Sistema)', 'SYS_EMAIL_VERIFICATION', '<h2>Verifica tu Correo Electrónico</h2><p>Hola <strong>{user.displayName}</strong>,</p><p>Por favor, verifica tu correo electrónico haciendo clic en el siguiente enlace:</p><p><a href="{verificationUrl}">Verificar Correo Electrónico</a></p><p>O copia y pega este enlace en tu navegador:<br><a href="{verificationUrl}">{verificationUrl}</a></p><p>Este enlace expirará en 24 horas por seguridad.</p><p>Si no creaste una cuenta en nuestro sistema, puedes ignorar este mensaje.</p><p>Atentamente,<br>Equipo de Emaús</p>', 1, datetime('now'), datetime('now')),

			('${uuidv4()}', 'Cuenta Bloqueada (Sistema)', 'SYS_ACCOUNT_LOCKED', '<h2>Cuenta Temporalmente Bloqueada</h2><p>Hola <strong>{user.displayName}</strong>,</p><p>Tu cuenta ha sido temporalmente bloqueada debido a múltiples intentos de acceso fallidos.</p><p>Por razones de seguridad, tu cuenta permanecerá bloqueada durante 1 hora.</p><p>Si no reconoces esta actividad, por favor contacta inmediatamente al administrador del sistema.</p><p>Para desbloquear tu cuenta antes del tiempo estipulado, puedes solicitar el restablecimiento de contraseña.</p><p>Atentamente,<br>Equipo de Seguridad de Emaús</p>', 1, datetime('now'), datetime('now')),

			('${uuidv4()}', 'Cuenta Desbloqueada (Sistema)', 'SYS_ACCOUNT_UNLOCKED', '<h2>Cuenta Desbloqueada</h2><p>Hola <strong>{user.displayName}</strong>,</p><p>Tu cuenta ha sido desbloqueada y ya puedes acceder al sistema normalmente.</p><p>Si no solicitaste esta acción, por favor contacta inmediatamente al administrador del sistema.</p><p>Te recomendamos utilizar una contraseña segura y cambiarla periódicamente.</p><p>Atentamente,<br>Equipo de Seguridad de Emaús</p>', 1, datetime('now'), datetime('now')),

			('${uuidv4()}', 'Solicitud de Rol (Sistema)', 'SYS_ROLE_REQUESTED', '<h2>Solicitud de Rol Recibida</h2><p>Hola <strong>{user.displayName}</strong>,</p><p>Hemos recibido tu solicitud para el rol de <strong>{roleName}</strong> en el retiro <strong>{retreatName}</strong>.</p><p><strong>Detalles de la solicitud:</strong></p><ul><li><strong>Rol solicitado:</strong> {roleName}</li><li><strong>Retiro:</strong> {retreatName}</li><li><strong>Fecha de solicitud:</strong> {requestDate}</li></ul><p>Tu solicitud está siendo revisada por los administradores del retiro. Recibirás una respuesta próximamente.</p><p>Atentamente,<br>Equipo de Emaús</p>', 1, datetime('now'), datetime('now')),

			('${uuidv4()}', 'Rol Aprobado (Sistema)', 'SYS_ROLE_APPROVED', '<h2>Solicitud de Rol Aprobada</h2><p>¡Felicitaciones <strong>{user.displayName}</strong>! 🎉</p><p>Tu solicitud para el rol de <strong>{roleName}</strong> en el retiro <strong>{retreatName}</strong> ha sido aprobada.</p><p>Ya tienes acceso a las funciones y permisos correspondientes a tu rol.</p><p><strong>Detalles del rol:</strong></p><ul><li><strong>Rol:</strong> {roleName}</li><li><strong>Retiro:</strong> {retreatName}</li><li><strong>Fecha de aprobación:</strong> {approvalDate}</li></ul><p>Gracias por tu disposición para servir en este retiro.</p><p>Atentamente,<br>Equipo de Emaús</p>', 1, datetime('now'), datetime('now')),

			('${uuidv4()}', 'Rol Rechazado (Sistema)', 'SYS_ROLE_REJECTED', '<h2>Solicitud de Rol Rechazada</h2><p>Hola <strong>{user.displayName}</strong>,</p><p>Lamentamos informarte que tu solicitud para el rol de <strong>{roleName}</strong> en el retiro <strong>{retreatName}</strong> no ha podido ser aprobada en este momento.</p><p><strong>Motivo del rechazo:</strong><br>{rejectionReason}</p><p>Esto no significa que no valoramos tu disposición para servir. Puede que el cupo para este rol esté completo o que se necesiten perfiles específicos para esta función.</p><p>Te agradecemos tu comprensión y tu interés en participar.</p><p>Atentamente,<br>Equipo de Emaús</p>', 1, datetime('now'), datetime('now'));
		`);

		// Seed inventory data
		await this.seedInventoryData(queryRunner);
	}

	private async seedInventoryData(queryRunner: QueryRunner): Promise<void> {
		// Insert inventory categories
		await queryRunner.query(`
			INSERT INTO "inventory_category" ("id", "name", "description", "isActive", "createdAt", "updatedAt") VALUES
			('cat-1', 'Snacks', 'Alimentos y botanas para los caminantes', 1, datetime('now'), datetime('now')),
			('cat-2', 'Botiquín', 'Suministros médicos y de primeros auxilios', 1, datetime('now'), datetime('now')),
			('cat-3', 'Aseo Personal', 'Artículos de higiene personal', 1, datetime('now'), datetime('now')),
			('cat-4', 'Papelería', 'Material de oficina y escritura', 1, datetime('now'), datetime('now')),
			('cat-5', 'Material Requerido', 'Material general requerido para el retiro', 1, datetime('now'), datetime('now')),
			('cat-6', 'Botiquín 1Eros Aux', 'Botiquín de primeros auxilios', 1, datetime('now'), datetime('now')),
			('cat-7', 'Oración', 'Material para oración y actividades espirituales', 1, datetime('now'), datetime('now')),
			('cat-8', 'Santísimo', 'Material para el Santísimo', 1, datetime('now'), datetime('now')),
			('cat-9', 'Quema De Pecados', 'Material para la quema de pecados', 1, datetime('now'), datetime('now')),
			('cat-10', 'Lavado De Manos', 'Material para lavado de manos', 1, datetime('now'), datetime('now')),
			('cat-11', 'Bolsas Salida', 'Material para bolsas de salida', 1, datetime('now'), datetime('now'))
		`);

		// Insert inventory teams
		await queryRunner.query(`
			INSERT INTO "inventory_team" ("id", "name", "description", "isActive", "createdAt", "updatedAt") VALUES
			('team-1', 'Recepción', 'Equipo de recepción y registro', 1, datetime('now'), datetime('now')),
			('team-2', 'Caminantes', 'Atención a los caminantes', 1, datetime('now'), datetime('now')),
			('team-3', 'Palanquitas', 'Equipo de palanquitas', 1, datetime('now'), datetime('now')),
			('team-4', 'Botiquín 1Eros Aux', 'Equipo de botiquín y primeros auxilios', 1, datetime('now'), datetime('now')),
			('team-5', 'Música', 'Equipo de música y alabanza', 1, datetime('now'), datetime('now')),
			('team-6', 'Comedor', 'Equipo de comedor y alimentación', 1, datetime('now'), datetime('now')),
			('team-7', 'Salón', 'Equipo del salón', 1, datetime('now'), datetime('now')),
			('team-8', 'Oración', 'Equipo de oración', 1, datetime('now'), datetime('now')),
			('team-9', 'Santísimo', 'Equipo del Santísimo', 1, datetime('now'), datetime('now')),
			('team-10', 'Campana', 'Equipo de la campana', 1, datetime('now'), datetime('now')),
			('team-11', 'Cuartos', 'Equipo de asignación de cuartos', 1, datetime('now'), datetime('now')),
			('team-12', 'Papelería', 'Equipo de papelería y materiales', 1, datetime('now'), datetime('now')),
			('team-13', 'Palancas', 'Equipo de palancas y cartas', 1, datetime('now'), datetime('now')),
			('team-14', 'Quema De Pecados', 'Equipo de la quema de pecados', 1, datetime('now'), datetime('now')),
			('team-15', 'Pared', 'Equipo de la pared', 1, datetime('now'), datetime('now')),
			('team-16', 'Lavado De Manos', 'Equipo de lavado de manos', 1, datetime('now'), datetime('now')),
			('team-17', 'Bolsas Salida', 'Equipo de bolsas de salida', 1, datetime('now'), datetime('now')),
			('team-18', 'Pared', 'Equipo de la pared', 1, datetime('now'), datetime('now'))
		`);

		// Insert inventory items
		await queryRunner.query(`
			INSERT INTO "inventory_item" ("id", "name", "description", "categoryId", "teamId", "ratio", "requiredQuantity", "unit", "isCalculated", "calculationType", "tshirtSize", "isActive", "createdAt", "updatedAt") VALUES
			-- Recepción items
			('item-1', 'Cajas de Plástico para Celulares', 'Cajas plásticas para guardar celulares durante el retiro', 'cat-5', 'team-1', 0.03, NULL, 'cajas', 0, NULL, NULL, 1, datetime('now'), datetime('now')),
			('item-2', 'Bolsas Zip Lock Sándwich', 'Bolsas herméticas para organizar materiales pequeños', 'cat-5', 'team-1', 0.04, NULL, 'bolsas', 0, NULL, NULL, 1, datetime('now'), datetime('now')),
			('item-3', 'Marcadores y Plumas', 'Marcadores y plumas para registro y actividades', 'cat-5', 'team-1', 0.08, NULL, 'piezas', 0, NULL, NULL, 1, datetime('now'), datetime('now')),
			('item-4', 'Gafetes Porta gafetes Plástico', 'Portagafetes de plástico para identificación de participantes', 'cat-5', 'team-1', 1.0, NULL, 'piezas', 0, NULL, NULL, 1, datetime('now'), datetime('now')),

			-- Caminantes items
			('item-5', 'Biblias', 'Biblias para uso de los caminantes durante el retiro', 'cat-5', 'team-2', 1.0, NULL, 'piezas', 0, NULL, NULL, 1, datetime('now'), datetime('now')),
			('item-6', 'Cuadernitos', 'Cuadernos para notas y reflexiones de los caminantes', 'cat-5', 'team-2', 1.0, NULL, 'piezas', 0, NULL, NULL, 1, datetime('now'), datetime('now')),
			('item-7', 'Pluma', 'Plumas para escritura de los caminantes', 'cat-5', 'team-2', 1.0, NULL, 'piezas', 0, NULL, NULL, 1, datetime('now'), datetime('now')),
			('item-8', 'Rosarios', 'Rosarios para oración de los caminantes', 'cat-5', 'team-2', 1.0, NULL, 'piezas', 0, NULL, NULL, 1, datetime('now'), datetime('now')),

			-- Palanquitas
			('item-9', 'Juego Palanquitas X Caminante', 'Juego completo de palanquitas para cada caminante', 'cat-5', 'team-3', 1.0, NULL, 'juegos', 0, NULL, NULL, 1, datetime('now'), datetime('now')),

			-- Fixed quantity items
			('item-10', 'Laptop para Charlas', 'Laptop para presentaciones y charlas durante el retiro', 'cat-5', 'team-5', 0.01, 1, 'piezas', 0, NULL, NULL, 1, datetime('now'), datetime('now')),
			('item-11', 'Bocina para Santísimo', 'Bocina portátil para música durante el Santísimo', 'cat-5', 'team-9', 0.01, 1, 'piezas', 0, NULL, NULL, 1, datetime('now'), datetime('now')),
			('item-12', 'Caja de Música', 'Caja de música para ambientación y momentos especiales', 'cat-5', 'team-5', 0.01, 1, 'piezas', 0, NULL, NULL, 1, datetime('now'), datetime('now')),

			-- Música equipment
			('item-13', 'Bocina y Micrófono para Salón', 'Sistema de sonido con micrófono para el salón principal', 'cat-5', 'team-5', 0.01, 2, 'piezas', 0, NULL, NULL, 1, datetime('now'), datetime('now')),
			('item-14', 'Bocina y Micrófono para Comedor', 'Sistema de sonido para el área del comedor', 'cat-5', 'team-5', 0.01, 1, 'piezas', 0, NULL, NULL, 1, datetime('now'), datetime('now')),
			('item-15', 'Micrófono Adicional', 'Micrófono inalámbrico adicional para presentaciones', 'cat-5', 'team-5', 0.01, 1, 'piezas', 0, NULL, NULL, 1, datetime('now'), datetime('now')),
			('item-16', 'Masking Tape Grueso (Cables Piso)', 'Cinta adhesiva gruesa para fijar cables al suelo', 'cat-5', 'team-5', 0.01, 1, 'piezas', 0, NULL, NULL, 1, datetime('now'), datetime('now')),

			-- Comedor
			('item-17', 'Cumpleaños: Pastel', 'Pasteles para celebración de cumpleaños durante el retiro', 'cat-5', 'team-6', 0.01, 2, 'pasteles', 0, NULL, NULL, 1, datetime('now'), datetime('now')),
			('item-18', 'Cumpleaños: Velitas', 'Velitas para pastel de cumpleaños', 'cat-5', 'team-6', 0.01, 2, 'piezas', 0, NULL, NULL, 1, datetime('now'), datetime('now')),
			('item-19', 'Letreros Mesas con Número', 'Letreros numerados para identificación de mesas', 'cat-5', 'team-6', 0.17, NULL, 'piezas', 0, NULL, NULL, 1, datetime('now'), datetime('now')),

			-- Salón
			('item-20', 'Kleenex', 'Cajas de pañuelos desechables para el salón', 'cat-5', 'team-7', 0.14, NULL, 'cajas', 0, NULL, NULL, 1, datetime('now'), datetime('now')),
			('item-21', 'Banners: Invocación Al Espíritu Santo', 'Banner con la oración de invocación al Espíritu Santo', 'cat-5', 'team-7', 0.06, 4, 'piezas', 0, NULL, NULL, 1, datetime('now'), datetime('now')),
			('item-22', 'Banners: Confidencialidad', 'Banner sobre la importancia de la confidencialidad', 'cat-5', 'team-7', 0.01, 1, 'piezas', 0, NULL, NULL, 1, datetime('now'), datetime('now')),
			('item-23', 'Banners: Jesucristo Ha Resucitado', 'Banner con la imagen de Jesucristo resucitado', 'cat-5', 'team-7', 0.01, 1, 'piezas', 0, NULL, NULL, 1, datetime('now'), datetime('now')),
			('item-24', 'Banners: Divina Misericordia', 'Banner con la imagen de la Divina Misericordia', 'cat-5', 'team-7', 0.01, 1, 'piezas', 0, NULL, NULL, 1, datetime('now'), datetime('now')),
			('item-25', 'Banners: Rembrandt Hijo Pródigo', 'Banner con la pintura del Hijo Pródigo de Rembrandt', 'cat-5', 'team-7', 0.01, 1, 'piezas', 0, NULL, NULL, 1, datetime('now'), datetime('now')),
			('item-26', 'Banner / Cuadro Virgen de Guadalupe', 'Banner o cuadro de la Virgen de Guadalupe', 'cat-5', 'team-7', 0.01, 1, 'piezas', 0, NULL, NULL, 1, datetime('now'), datetime('now')),
			('item-27', 'Prit Tack para Letreros Cuartos', 'Adhesivo reutilizable para fijar letreros en las puertas', 'cat-5', 'team-7', 0.03, NULL, 'piezas', 0, NULL, NULL, 1, datetime('now'), datetime('now')),

			-- Santísimo items
			('item-28', 'Cirios No Mayor de 15 cms', 'Cirios pequeños para la ceremonia del Santísimo', 'cat-8', 'team-9', 0.06, 4, 'piezas', 0, NULL, NULL, 1, datetime('now'), datetime('now')),
			('item-29', 'Platos para Cirios', 'Platos pequeños para colocar debajo de los cirios', 'cat-8', 'team-9', 0.06, 4, 'piezas', 0, NULL, NULL, 1, datetime('now'), datetime('now')),
			('item-30', 'Corporal Grande', 'Corporal grande para la ceremonia del Santísimo', 'cat-8', 'team-9', 0.01, 1, 'piezas', 0, NULL, NULL, 1, datetime('now'), datetime('now')),
			('item-31', 'Lámpara', 'Lámpara para iluminación durante el Santísimo', 'cat-8', 'team-9', 0.01, 1, 'piezas', 0, NULL, NULL, 1, datetime('now'), datetime('now')),
			('item-32', 'Pilas AAA', 'Pilas AAA para lámparas y dispositivos electrónicos', 'cat-8', 'team-9', 0.04, 3, 'piezas', 0, NULL, NULL, 1, datetime('now'), datetime('now')),
			('item-33', 'Tijeras Pequeñas', 'Tijeras pequeñas para cortar materiales durante la ceremonia', 'cat-8', 'team-9', 0.01, 1, 'piezas', 0, NULL, NULL, 1, datetime('now'), datetime('now')),
			('item-34', 'Encendedores', 'Encendedores para prender cirios durante la ceremonia', 'cat-8', 'team-9', 0.01, 1, 'piezas', 0, NULL, NULL, 1, datetime('now'), datetime('now')),
			('item-35', 'Folder Oraciones Santísimo', 'Folder con oraciones para la ceremonia del Santísimo', 'cat-8', 'team-9', 0.01, 1, 'piezas', 0, NULL, NULL, 1, datetime('now'), datetime('now')),
			('item-36', 'Letreros Santísimo Expuesto', 'Letreros para indicar que el Santísimo está expuesto', 'cat-8', 'team-9', 0.01, 1, 'piezas', 0, NULL, NULL, 1, datetime('now'), datetime('now')),
			('item-37', 'Caja para Palancas Reclusorios', 'Caja especial para guardar palancas durante reclusorios', 'cat-8', 'team-9', 0.01, 1, 'piezas', 0, NULL, NULL, 1, datetime('now'), datetime('now')),

			-- Campana
			('item-38', 'Campanas', 'Campanas para llamar a oración y anunciar actividades', 'cat-5', 'team-10', 0.03, 2, 'piezas', 0, NULL, NULL, 1, datetime('now'), datetime('now')),

			-- Cuartos
			('item-39', 'Papel de Baño', 'Rollos de papel de baño para los cuartos', 'cat-5', 'team-11', 1.0, NULL, 'rollos', 0, NULL, NULL, 1, datetime('now'), datetime('now')),

			-- Sample T-shirt items (calculated)
			('item-40', 'Camisetas Blancas Talla S', 'Camisetas blancas talla S para participantes', 'cat-5', 'team-1', 0.01, NULL, 'piezas', 1, 'tshirt', 'S', 1, datetime('now'), datetime('now')),
			('item-41', 'Camisetas Blancas Talla M', 'Camisetas blancas talla M para participantes', 'cat-5', 'team-1', 0.01, NULL, 'piezas', 1, 'tshirt', 'M', 1, datetime('now'), datetime('now')),
			('item-42', 'Camisetas Blancas Talla G', 'Camisetas blancas talla G para participantes', 'cat-5', 'team-1', 0.01, NULL, 'piezas', 1, 'tshirt', 'G', 1, datetime('now'), datetime('now')),
			('item-43', 'Camisetas Blancas Talla X', 'Camisetas blancas talla X para participantes', 'cat-5', 'team-1', 0.01, NULL, 'piezas', 1, 'tshirt', 'X', 1, datetime('now'), datetime('now')),
			('item-44', 'Camisetas Blancas Talla 2', 'Camisetas blancas talla 2 para participantes', 'cat-5', 'team-1', 0.01, NULL, 'piezas', 1, 'tshirt', '2', 1, datetime('now'), datetime('now')),

			-- Blue T-shirts (calculated)
			('item-45', 'Camisetas Azules Talla S', 'Camisetas azules talla S para servidores', 'cat-5', 'team-1', 0.01, NULL, 'piezas', 1, 'bluetshirt', 'S', 1, datetime('now'), datetime('now')),
			('item-46', 'Camisetas Azules Talla M', 'Camisetas azules talla M para servidores', 'cat-5', 'team-1', 0.01, NULL, 'piezas', 1, 'bluetshirt', 'M', 1, datetime('now'), datetime('now')),
			('item-47', 'Camisetas Azules Talla G', 'Camisetas azules talla G para servidores', 'cat-5', 'team-1', 0.01, NULL, 'piezas', 1, 'bluetshirt', 'G', 1, datetime('now'), datetime('now')),
			('item-48', 'Camisetas Azules Talla X', 'Camisetas azules talla X para servidores', 'cat-5', 'team-1', 0.01, NULL, 'piezas', 1, 'bluetshirt', 'X', 1, datetime('now'), datetime('now')),
			('item-49', 'Camisetas Azules Talla 2', 'Camisetas azules talla 2 para servidores', 'cat-5', 'team-1', 0.01, NULL, 'piezas', 1, 'bluetshirt', '2', 1, datetime('now'), datetime('now')),

			-- Jackets (calculated)
			('item-50', 'Chamarras Talla S', 'Chamarras talla S para servidores', 'cat-5', 'team-1', 0.01, NULL, 'piezas', 1, 'jacket', 'S', 1, datetime('now'), datetime('now')),
			('item-51', 'Chamarras Talla M', 'Chamarras talla M para servidores', 'cat-5', 'team-1', 0.01, NULL, 'piezas', 1, 'jacket', 'M', 1, datetime('now'), datetime('now')),
			('item-52', 'Chamarras Talla G', 'Chamarras talla G para servidores', 'cat-5', 'team-1', 0.01, NULL, 'piezas', 1, 'jacket', 'G', 1, datetime('now'), datetime('now')),
			('item-53', 'Chamarras Talla X', 'Chamarras talla X para servidores', 'cat-5', 'team-1', 0.01, NULL, 'piezas', 1, 'jacket', 'X', 1, datetime('now'), datetime('now')),
			('item-54', 'Chamarras Talla 2', 'Chamarras talla 2 para servidores', 'cat-5', 'team-1', 0.01, NULL, 'piezas', 1, 'jacket', '2', 1, datetime('now'), datetime('now')),

			-- Papelería items
			('item-55', 'Cinta Canela Café', 'Cinta adhesiva color canela para manualidades', 'cat-4', 'team-12', 0.01, 1, 'piezas', 0, NULL, NULL, 1, datetime('now'), datetime('now')),
			('item-56', 'Diurex', 'Corrector líquido para errores de escritura', 'cat-4', 'team-12', 0.01, 1, 'piezas', 0, NULL, NULL, 1, datetime('now'), datetime('now')),
			('item-57', 'Engrapadoras', 'Engrapadoras para unir documentos', 'cat-4', 'team-12', 0.01, 1, 'piezas', 0, NULL, NULL, 1, datetime('now'), datetime('now')),
			('item-58', 'Guillotinas', 'Guillotinas para cortar papel de forma precisa', 'cat-4', 'team-12', 0.01, 1, 'piezas', 0, NULL, NULL, 1, datetime('now'), datetime('now')),
			('item-59', 'Hojas Blancas', 'Hojas de papel blanco tamaño carta para diversos usos', 'cat-4', 'team-12', 13.89, NULL, 'hojas', 0, NULL, NULL, 1, datetime('now'), datetime('now')),
			('item-60', 'Laptop e Impresora para Logística', 'Equipo de cómputo e impresión para tareas logísticas', 'cat-4', 'team-12', 0.01, 1, 'piezas', 0, NULL, NULL, 1, datetime('now'), datetime('now')),
			('item-61', 'Lápices', 'Lápices para escritura y dibujo', 'cat-4', 'team-12', 1.39, NULL, 'piezas', 0, NULL, NULL, 1, datetime('now'), datetime('now')),
			('item-62', 'Sobres Blancos Grandes Oficio No. 10', 'Sobres grandes tamaño oficio para documentos', 'cat-4', 'team-12', 3.47, NULL, 'sobres', 0, NULL, NULL, 1, datetime('now'), datetime('now')),
			('item-63', 'Saca Puntas', 'Sacapuntas para afilar lápices', 'cat-4', 'team-12', 0.03, 2, 'piezas', 0, NULL, NULL, 1, datetime('now'), datetime('now')),
			('item-64', 'Tarjetas de Agradecimiento Padres', 'Tarjetas de agradecimiento para los padres de los caminantes', 'cat-4', 'team-12', 0.28, 20, 'piezas', 0, NULL, NULL, 1, datetime('now'), datetime('now')),
			('item-65', 'Tijeras', 'Tijeras para cortar papel y materiales', 'cat-4', 'team-12', 0.01, 1, 'piezas', 0, NULL, NULL, 1, datetime('now'), datetime('now')),

			-- Palancas items
			('item-66', 'Sobres para Palancas', 'Sobres especiales para las palancas de los caminantes', 'cat-5', 'team-13', 1.53, NULL, 'sobres', 0, NULL, NULL, 1, datetime('now'), datetime('now')),
			('item-67', 'Bolsas Salida', 'Bolsas para la salida de los caminantes', 'cat-11', 'team-13', 0.01, 1, 'piezas', 0, NULL, NULL, 1, datetime('now'), datetime('now')),
			('item-68', 'Kleenex: Paquetitos Individuales', 'Paquetes individuales de pañuelos desechables', 'cat-5', 'team-13', 0.69, NULL, 'paquetes', 0, NULL, NULL, 1, datetime('now'), datetime('now')),
			('item-69', 'Impresora: Cartuchos Tinta / Toners', 'Cartuchos de tinta o tóner para la impresora', 'cat-5', 'team-13', 0.01, 1, 'piezas', 0, NULL, NULL, 1, datetime('now'), datetime('now')),

			-- Snacks items
			('item-70', 'Garrafones / Vitroleros Agua', 'Garrafones o vitroleros para servir agua', 'cat-1', 'team-2', 0.03, NULL, 'piezas', 0, NULL, NULL, 1, datetime('now'), datetime('now')),
			('item-71', 'Vasos desechables', 'Vasos desechables para servir bebidas', 'cat-1', 'team-2', 0.69, NULL, 'pzas', 0, NULL, NULL, 1, datetime('now'), datetime('now')),
			('item-72', 'Vasos para café', 'Vasos térmicos para servir café', 'cat-1', 'team-2', 0.69, NULL, 'pzas', 0, NULL, NULL, 1, datetime('now'), datetime('now')),
			('item-73', 'Bolsa de carton (Son las bolsas de salida)', 'Bolsas de cartón para la salida de los caminantes', 'cat-1', 'team-2', 0.69, NULL, 'pzas', 0, NULL, NULL, 1, datetime('now'), datetime('now')),
			('item-74', 'Lata Café', 'Lata de café soluble para preparar bebidas', 'cat-1', 'team-2', 0.01, 1, 'latas', 0, NULL, NULL, 1, datetime('now'), datetime('now')),
			('item-75', 'Botella de valentina', 'Salsa Valentina para condimentar snacks', 'cat-1', 'team-2', 0.01, 1, 'pzas', 0, NULL, NULL, 1, datetime('now'), datetime('now')),
			('item-76', 'Botella de Chamoy o Miguelito', 'Chamoy o Miguelito para dar sabor a las frutas', 'cat-1', 'team-2', 0.01, 1, 'botellas', 0, NULL, NULL, 1, datetime('now'), datetime('now')),
			('item-77', 'Jarabes Agua Fresca', 'Jarabes para preparar aguas frescas', 'cat-1', 'team-2', 0.06, NULL, 'botellas', 0, NULL, NULL, 1, datetime('now'), datetime('now')),
			('item-78', 'Cajas de Te variados', 'Cajas con variedad de tés para servir', 'cat-1', 'team-2', 0.01, 1, 'pzas', 0, NULL, NULL, 1, datetime('now'), datetime('now')),
			('item-79', 'Azucar, Splenda, una de cada uno. (sobres)', 'Cajas de sobres de azúcar y Splenda para el café', 'cat-1', 'team-2', 0.01, 1, 'cajas', 0, NULL, NULL, 1, datetime('now'), datetime('now')),
			('item-80', 'Cofeemate (sustituto de crema)', 'Cremora o sustituto de crema para el café', 'cat-1', 'team-2', 0.01, 1, 'bote / caja', 0, NULL, NULL, 1, datetime('now'), datetime('now')),
			('item-81', 'Cucharitas', 'Cucharitas desechables para el café y otros usos', 'cat-1', 'team-2', 1.67, NULL, 'bolsa', 0, NULL, NULL, 1, datetime('now'), datetime('now')),
			('item-82', 'Bolsas de basura grandes', 'Caja con 10 bolsas de basura grandes', 'cat-1', 'team-2', 0.01, 1, 'caja de 10', 0, NULL, NULL, 1, datetime('now'), datetime('now')),
			('item-83', 'Platos desechables grandes para poner snacks', 'Platos desechables grandes para servir snacks', 'cat-1', 'team-2', 0.03, NULL, 'paquete', 0, NULL, NULL, 1, datetime('now'), datetime('now')),
			('item-84', 'Cajas de Galletas', 'Cajas de galletas surtidas para snacks', 'cat-1', 'team-2', 0.06, NULL, 'cajas', 0, NULL, NULL, 1, datetime('now'), datetime('now')),
			('item-85', 'Papas / Frituras', 'Papas frituras y otros botanas saladas', 'cat-1', 'team-2', 0.07, NULL, 'kgs', 0, NULL, NULL, 1, datetime('now'), datetime('now')),
			('item-86', 'Cacahuates', 'Cacahuates surtidos para botana', 'cat-1', 'team-2', 0.04, NULL, 'kgs', 0, NULL, NULL, 1, datetime('now'), datetime('now')),
			('item-87', 'Gomitas', 'Gomitas y dulces suaves', 'cat-1', 'team-2', 0.03, NULL, 'kgs', 0, NULL, NULL, 1, datetime('now'), datetime('now')),
			('item-88', 'Mentas', 'Bolsa grande de mentas y caramelos', 'cat-1', 'team-2', 0.01, NULL, 'bolsa grande', 0, NULL, NULL, 1, datetime('now'), datetime('now')),
			('item-89', 'Cholocates minis para palanquitas', 'Bolsas con chocolates mini para las palanquitas', 'cat-1', 'team-2', 0.04, NULL, 'bolsas 50', 0, NULL, NULL, 1, datetime('now'), datetime('now')),
			('item-90', 'Botella agua 500ml / 600ml', 'Botellas de agua de 500ml o 600ml individuales', 'cat-1', 'team-2', 0.28, NULL, 'piezas', 0, NULL, NULL, 1, datetime('now'), datetime('now')),
			('item-91', 'Refresco cola 2L', 'Refrescos de cola de 2 litros', 'cat-1', 'team-2', 0.06, NULL, '2L', 0, NULL, NULL, 1, datetime('now'), datetime('now')),
			('item-92', 'Refresco cola light 2L', 'Refrescos de cola light de 2 litros', 'cat-1', 'team-2', 0.04, NULL, '2L', 0, NULL, NULL, 1, datetime('now'), datetime('now')),
			('item-93', 'Refresco manzana 2L', 'Refrescos de manzana de 2 litros', 'cat-1', 'team-2', 0.04, NULL, '2L', 0, NULL, NULL, 1, datetime('now'), datetime('now')),
			('item-94', 'Refresco sprite 2L', 'Refrescos Sprite de 2 litros', 'cat-1', 'team-2', 0.04, NULL, '2L', 0, NULL, NULL, 1, datetime('now'), datetime('now')),
			('item-95', 'Jugo de manzana 1L', 'Jugo de manzana de 1 litro', 'cat-1', 'team-2', 0.06, NULL, '1L', 0, NULL, NULL, 1, datetime('now'), datetime('now')),
			('item-96', 'Pavera', 'Pavera para encender fuego y velas', 'cat-1', 'team-2', 0.01, 1, 'piezas', 0, NULL, NULL, 1, datetime('now'), datetime('now')),

			-- Botiquín items
			('item-97', 'Next, caja 10 tabletas', 'Pastillas Next para el dolor de cabeza', 'cat-2', 'team-4', 0.14, NULL, 'cajas', 0, NULL, NULL, 1, datetime('now'), datetime('now')),
			('item-98', 'Agua oxigenada, botella 230ml', 'Agua oxigenada para desinfectar heridas', 'cat-2', 'team-4', 3.19, NULL, 'ml', 0, NULL, NULL, 1, datetime('now'), datetime('now')),
			('item-99', 'Alcohol, botella 200 ml', 'Alcohol isopropílico para desinfección', 'cat-2', 'team-4', 2.78, NULL, 'ml', 0, NULL, NULL, 1, datetime('now'), datetime('now')),
			('item-100', 'Eskapar cápsulas 200 mg', 'Cápsulas de Eskapar para alergias', 'cat-2', 'team-4', 0.21, NULL, 'capsulas', 0, NULL, NULL, 1, datetime('now'), datetime('now')),
			('item-101', 'Treda, 8 pastillas sueltas', 'Pastillas sueltas Treda para alivio del dolor', 'cat-2', 'team-4', 0.11, NULL, 'pastillas', 0, NULL, NULL, 1, datetime('now'), datetime('now')),
			('item-102', 'Advil, frasco 100 tabletas', 'Tabletas de Advil para dolor e inflamación', 'cat-2', 'team-4', 1.39, NULL, 'tabletas', 0, NULL, NULL, 1, datetime('now'), datetime('now')),
			('item-103', 'Tylenol frasco, 6 tabletas', 'Tabletas de Tylenol para alivio del dolor', 'cat-2', 'team-4', 0.08, NULL, 'tabletas', 0, NULL, NULL, 1, datetime('now'), datetime('now')),
			('item-104', 'Aliviax caja 4 tabletas', 'Tabletas de Aliviax para dolor muscular', 'cat-2', 'team-4', 0.06, NULL, 'tabletas', 0, NULL, NULL, 1, datetime('now'), datetime('now')),
			('item-105', 'Jeringas, caja con 3 unidades', 'Caja con 3 jeringas estériles', 'cat-2', 'team-4', 0.04, NULL, 'unidades', 0, NULL, NULL, 1, datetime('now'), datetime('now')),
			('item-106', 'Curitas, caja 75 piezas', 'Caja con 75 curitas de diferentes tamaños', 'cat-2', 'team-4', 1.04, NULL, 'piezas', 0, NULL, NULL, 1, datetime('now'), datetime('now')),
			('item-107', 'Gasas, caja con 10 piezas', 'Caja con 10 gasas estériles', 'cat-2', 'team-4', 0.14, NULL, 'piezas', 0, NULL, NULL, 1, datetime('now'), datetime('now')),
			('item-108', 'Nazil gotas imitado, 15 ml', 'Gotas nasales de 15ml para congestión', 'cat-2', 'team-4', 0.21, NULL, 'ml', 0, NULL, NULL, 1, datetime('now'), datetime('now')),
			('item-109', 'Alta Seltzer, cajas 12 tabletas', 'Tabletas de Alta Seltzer para indigestión', 'cat-2', 'team-4', 0.28, NULL, 'tabletas', 0, NULL, NULL, 1, datetime('now'), datetime('now')),
			('item-110', 'Melox, tabletas masticables', 'Tabletas masticables de Melox para dolor', 'cat-2', 'team-4', 0.42, NULL, 'tabletas', 0, NULL, NULL, 1, datetime('now'), datetime('now')),
			('item-111', 'Pepto bismol PLUS, frasco', 'Frasco de Pepto Bismol para problemas estomacales', 'cat-2', 'team-4', 0.01, 1, 'frasco', 0, NULL, NULL, 1, datetime('now'), datetime('now')),
			('item-112', 'Clorotrimeton repetabs, tabletas', 'Tabletas de Clorotrimeton para alergias', 'cat-2', 'team-4', 0.26, NULL, 'tabletas', 0, NULL, NULL, 1, datetime('now'), datetime('now')),
			('item-113', 'Andantol, jalea 25g', 'Jalea de Andantol 25g para picaduras', 'cat-2', 'team-4', 0.35, NULL, 'gr', 0, NULL, NULL, 1, datetime('now'), datetime('now')),
			('item-114', 'cIproxina, tabletas 500 mg', 'Tabletas de Ciproxina 500mg para infecciones', 'cat-2', 'team-4', 0.19, NULL, 'tabletas', 0, NULL, NULL, 1, datetime('now'), datetime('now')),
			('item-115', 'Firac plus tab 1 tab cada 8 hrs', 'Tabletas Firac Plus para resfriados', 'cat-2', 'team-4', 0.28, NULL, 'tabletas', 0, NULL, NULL, 1, datetime('now'), datetime('now')),
			('item-116', 'Transpore cinta de 5 cms.', 'Cinta adhesiva médica de 5cm para vendajes', 'cat-2', 'team-4', 0.01, 1, 'piezas', 0, NULL, NULL, 1, datetime('now'), datetime('now')),
			('item-117', 'Gatorade frasco', 'Frasco de Gatorade para hidratación', 'cat-2', 'team-4', 0.01, 1, 'frasco', 0, NULL, NULL, 1, datetime('now'), datetime('now')),

			-- Aseo Personal items
			('item-118', 'Cepillos de dientes', 'Cepillos de dientes para los caminantes', 'cat-3', 'team-2', 0.14, NULL, 'piezas', 0, NULL, NULL, 1, datetime('now'), datetime('now')),
			('item-119', 'Jabon de tocador', 'Jabón de tocador para aseo personal', 'cat-3', 'team-2', 0.14, NULL, 'piezas', 0, NULL, NULL, 1, datetime('now'), datetime('now')),
			('item-120', 'Papel de baño, paquete 4 piezas', 'Paquetes de papel de baño con 4 rollos', 'cat-3', 'team-2', 0.07, NULL, 'piezas', 0, NULL, NULL, 1, datetime('now'), datetime('now')),
			('item-121', 'Pasta de dientes chicas', 'Tubos pequeños de pasta de dientes', 'cat-3', 'team-2', 0.14, NULL, 'piezas', 0, NULL, NULL, 1, datetime('now'), datetime('now')),
			('item-122', 'Shampoo chicos (de viaje)', 'Botellas pequeñas de shampoo para viaje', 'cat-3', 'team-2', 0.14, NULL, 'piezas', 0, NULL, NULL, 1, datetime('now'), datetime('now')),
			('item-123', 'Tapones de oído', 'Tapones de oído para dormir', 'cat-3', 'team-2', 0.35, NULL, 'piezas', 0, NULL, NULL, 1, datetime('now'), datetime('now')),
			('item-124', 'Rastrillos desechables', 'Rastrillos desechables para aseo personal', 'cat-3', 'team-2', 0.07, NULL, 'piezas', 0, NULL, NULL, 1, datetime('now'), datetime('now')),

			-- Quema De Pecados items
			('item-125', 'Encendedores Largos', 'Encendedores largos para la ceremonia de quema de pecados', 'cat-9', 'team-14', 0.03, NULL, 'piezas', 0, NULL, NULL, 1, datetime('now'), datetime('now')),
			('item-126', 'Iniciador de Fuego (Doritos)', 'Doritos o snacks para iniciar el fuego en la ceremonia', 'cat-9', 'team-14', 0.01, 1, 'piezas', 0, NULL, NULL, 1, datetime('now'), datetime('now')),
			('item-127', 'Pavera para Quema de Pecados', 'Pavera especial para la ceremonia de quema de pecados', 'cat-9', 'team-14', 0.01, 1, 'piezas', 0, NULL, NULL, 1, datetime('now'), datetime('now')),
			('item-128', 'Porta Paveras de Alambre Rigido', 'Soporte de alambre rígido para las paveras', 'cat-9', 'team-14', 0.01, 1, 'piezas', 0, NULL, NULL, 1, datetime('now'), datetime('now')),

			-- Pared items
			('item-129', 'Linternas', 'Linternas para iluminación en actividades nocturnas', 'cat-5', 'team-15', 0.03, 1, 'piezas', 0, NULL, NULL, 1, datetime('now'), datetime('now')),
			('item-130', 'Láser', 'Punteros láser para presentaciones y actividades', 'cat-5', 'team-15', 0.03, 2, 'piezas', 0, NULL, NULL, 1, datetime('now'), datetime('now')),
			('item-131', 'Veladoras', 'Veladoras para oración y momentos espirituales', 'cat-5', 'team-15', 0.69, 50, 'piezas', 0, NULL, NULL, 1, datetime('now'), datetime('now')),

			-- Lavado De Manos items
			('item-132', 'Jarra para Lavado de Manos', 'Jarra para contener agua durante el lavado de manos', 'cat-10', 'team-16', 0.01, 1, 'piezas', 0, NULL, NULL, 1, datetime('now'), datetime('now')),
			('item-133', 'Recipiente de Agua (Palangana)', 'Palangana o recipiente para el lavado de manos', 'cat-10', 'team-16', 0.01, 1, 'piezas', 0, NULL, NULL, 1, datetime('now'), datetime('now')),

			-- Bolsas Salida items
			('item-134', 'CDs: Etiquetas', 'Etiquetas para los CDs de la salida', 'cat-11', 'team-17', 0.01, NULL, 'piezas', 0, NULL, NULL, 1, datetime('now'), datetime('now')),
			('item-135', 'CDs: Grabados', 'CDs grabados con música del retiro', 'cat-11', 'team-17', 1.53, NULL, 'piezas', 0, NULL, NULL, 1, datetime('now'), datetime('now')),
			('item-136', 'CDs: Sobres', 'Sobres para proteger los CDs de la salida', 'cat-11', 'team-17', 1.53, NULL, 'piezas', 0, NULL, NULL, 1, datetime('now'), datetime('now')),
			('item-137', 'Playeras', 'Playeras conmemorativas del retiro', 'cat-11', 'team-17', 1.0, NULL, 'piezas', 0, NULL, NULL, 1, datetime('now'), datetime('now'))
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

		// Drop indexes for communications table first
		await queryRunner.query(`DROP INDEX IF EXISTS "idx_participant_communications_participantId"`);
		await queryRunner.query(`DROP INDEX IF EXISTS "idx_participant_communications_retreatId"`);
		await queryRunner.query(`DROP INDEX IF EXISTS "idx_participant_communications_sentAt"`);
		await queryRunner.query(`DROP INDEX IF EXISTS "idx_participant_communications_messageType"`);

		// Drop indexes for payments table first
		await queryRunner.query(`DROP INDEX IF EXISTS "idx_payments_recordedBy"`);
		await queryRunner.query(`DROP INDEX IF EXISTS "idx_payments_paymentDate"`);
		await queryRunner.query(`DROP INDEX IF EXISTS "idx_payments_retreatId"`);
		await queryRunner.query(`DROP INDEX IF EXISTS "idx_payments_participantId"`);

		// Drop tables in reverse order to respect foreign key constraints
		await queryRunner.query(`DROP TABLE IF EXISTS "sessions"`);
		await queryRunner.query(`DROP TABLE IF EXISTS "participant_communications"`);
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
