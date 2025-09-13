import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateSchema20250910163337 implements MigrationInterface {
	name = 'CreateSchema';
	timestamp = '20250910163337';

	public async up(queryRunner: QueryRunner): Promise<void> {
		// Create users table
		await queryRunner.query(`
			CREATE TABLE IF NOT EXISTS "users" (
				"id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
				"google_id" VARCHAR(255) UNIQUE,
				"email" VARCHAR(255) NOT NULL UNIQUE,
				"display_name" VARCHAR(255) NOT NULL,
				"photo" VARCHAR(500),
				"password" VARCHAR(255),
				"created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
				"updated_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
			)
		`);

		// Create houses table
		await queryRunner.query(`
			CREATE TABLE IF NOT EXISTS "house" (
				"id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
				"name" VARCHAR(255) NOT NULL,
				"address1" VARCHAR(255) NOT NULL,
				"address2" VARCHAR(255),
				"city" VARCHAR(255) NOT NULL,
				"state" VARCHAR(255) NOT NULL,
				"zip_code" VARCHAR(255) NOT NULL,
				"country" VARCHAR(255) NOT NULL,
				"capacity" INTEGER NOT NULL,
				"latitude" REAL,
				"longitude" REAL,
				"google_maps_url" VARCHAR(500),
				"notes" TEXT
			)
		`);

		// Create beds table
		await queryRunner.query(`
			CREATE TABLE IF NOT EXISTS "bed" (
				"id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
				"room_number" VARCHAR(255) NOT NULL,
				"bed_number" VARCHAR(255) NOT NULL,
				"floor" INTEGER,
				"type" TEXT NOT NULL DEFAULT 'normal' CHECK ("type" IN ('normal', 'litera', 'colchon')),
				"default_usage" TEXT NOT NULL DEFAULT 'caminante' CHECK ("default_usage" IN ('caminante', 'servidor')),
				"houseId" UUID NOT NULL,
				FOREIGN KEY ("houseId") REFERENCES "house" ("id") ON DELETE CASCADE
			)
		`);

		// Create retreats table
		await queryRunner.query(`
			CREATE TABLE IF NOT EXISTS "retreat" (
				"id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
				"parish" VARCHAR(255) NOT NULL,
				"start_date" DATE NOT NULL,
				"end_date" DATE NOT NULL,
				"houseId" UUID NOT NULL,
				"opening_notes" TEXT,
				"closing_notes" TEXT,
				"things_to_bring_notes" TEXT,
				"cost" VARCHAR(255),
				"payment_info" TEXT,
				"payment_methods" TEXT,
				"max_walkers" INTEGER,
				"max_servers" INTEGER,
				FOREIGN KEY ("houseId") REFERENCES "house" ("id") ON DELETE RESTRICT
			)
		`);

		// Create participants table (with correct shirt field types)
		await queryRunner.query(`
			CREATE TABLE IF NOT EXISTS "participants" (
				"id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
				"id_on_retreat" INTEGER NOT NULL,
				"type" VARCHAR(255) NOT NULL CHECK ("type" IN ('walker', 'server', 'waiting')),
				"first_name" VARCHAR(255) NOT NULL,
				"last_name" VARCHAR(255) NOT NULL,
				"nickname" VARCHAR(255),
				"birth_date" DATE NOT NULL,
				"marital_status" VARCHAR(255) NOT NULL CHECK ("marital_status" IN ('S', 'C', 'D', 'V', 'O')),
				"street" VARCHAR(255) NOT NULL,
				"house_number" VARCHAR(255) NOT NULL,
				"postal_code" VARCHAR(255) NOT NULL,
				"neighborhood" VARCHAR(255) NOT NULL,
				"city" VARCHAR(255) NOT NULL,
				"state" VARCHAR(255) NOT NULL,
				"country" VARCHAR(255) NOT NULL,
				"parish" VARCHAR(255),
				"home_phone" VARCHAR(255),
				"work_phone" VARCHAR(255),
				"cell_phone" VARCHAR(255) NOT NULL,
				"email" VARCHAR(255) NOT NULL,
				"occupation" VARCHAR(255) NOT NULL,
				"snores" BOOLEAN NOT NULL DEFAULT false,
				"has_medication" BOOLEAN NOT NULL DEFAULT false,
				"medication_details" TEXT,
				"medication_schedule" VARCHAR(255),
				"has_dietary_restrictions" BOOLEAN NOT NULL DEFAULT false,
				"dietary_restrictions_details" TEXT,
				"sacraments" TEXT,
				"emergency_contact1_name" VARCHAR(255) NOT NULL,
				"emergency_contact1_relation" VARCHAR(255) NOT NULL,
				"emergency_contact1_home_phone" VARCHAR(255),
				"emergency_contact1_work_phone" VARCHAR(255),
				"emergency_contact1_cell_phone" VARCHAR(255) NOT NULL,
				"emergency_contact1_email" VARCHAR(255),
				"emergency_contact2_name" VARCHAR(255),
				"emergency_contact2_relation" VARCHAR(255),
				"emergency_contact2_home_phone" VARCHAR(255),
				"emergency_contact2_work_phone" VARCHAR(255),
				"emergency_contact2_cell_phone" VARCHAR(255),
				"emergency_contact2_email" VARCHAR(255),
				"tshirt_size" VARCHAR(255) CHECK ("tshirt_size" IN ('S', 'M', 'G', 'X', '2')),
				"needs_white_shirt" VARCHAR(10),
				"needs_blue_shirt" VARCHAR(10),
				"needs_jacket" VARCHAR(10),
				"invited_by" VARCHAR(255),
				"is_invited_by_emaus_member" BOOLEAN,
				"inviter_home_phone" VARCHAR(255),
				"inviter_work_phone" VARCHAR(255),
				"inviter_cell_phone" VARCHAR(255),
				"inviter_email" VARCHAR(255),
				"family_friend_color" VARCHAR(20),
				"pickup_location" VARCHAR(255),
				"arrives_on_own" BOOLEAN,
				"payment_date" DATE,
				"payment_amount" DECIMAL(10,2),
				"is_scholarship" BOOLEAN NOT NULL DEFAULT false,
				"palancas_coordinator" VARCHAR(255),
				"palancas_requested" BOOLEAN,
				"palancas_received" TEXT,
				"palancas_notes" TEXT,
				"requests_single_room" BOOLEAN,
				"is_cancelled" BOOLEAN NOT NULL DEFAULT false,
				"notes" TEXT,
				"registration_date" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
				"last_updated_date" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
				"retreatId" UUID NOT NULL,
				"tableId" UUID,
				"retreatBedId" UUID,
				FOREIGN KEY ("retreatId") REFERENCES "retreat" ("id") ON DELETE CASCADE
			)
		`);

		// Create tables table (without foreign keys that reference participants table)
		await queryRunner.query(`
			CREATE TABLE IF NOT EXISTS "tables" (
				"id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
				"name" VARCHAR(255) NOT NULL,
				"retreatId" UUID NOT NULL,
				"liderId" UUID,
				"colider1Id" UUID,
				"colider2Id" UUID,
				FOREIGN KEY ("retreatId") REFERENCES "retreat" ("id") ON DELETE CASCADE
			)
		`);

		// Create retreat_bed table
		await queryRunner.query(`
			CREATE TABLE IF NOT EXISTS "retreat_bed" (
				"id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
				"room_number" VARCHAR(255) NOT NULL,
				"bed_number" VARCHAR(255) NOT NULL,
				"floor" INTEGER,
				"type" TEXT NOT NULL CHECK ("type" IN ('normal', 'litera', 'colchon')),
				"default_usage" TEXT NOT NULL CHECK ("default_usage" IN ('caminante', 'servidor')),
				"retreatId" UUID NOT NULL,
				"participantId" UUID,
				FOREIGN KEY ("retreatId") REFERENCES "retreat" ("id") ON DELETE CASCADE,
				FOREIGN KEY ("participantId") REFERENCES "participants" ("id") ON DELETE SET NULL
			)
		`);

		// Create retreat_charges table (without foreign key that references participants table)
		await queryRunner.query(`
			CREATE TABLE IF NOT EXISTS "retreat_charges" (
				"id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
				"name" VARCHAR(255) NOT NULL,
				"description" TEXT,
				"retreatId" UUID NOT NULL,
				"participantId" UUID,
				FOREIGN KEY ("retreatId") REFERENCES "retreat" ("id") ON DELETE CASCADE
			)
		`);

		// Create message_templates table
		await queryRunner.query(`
			CREATE TABLE IF NOT EXISTS "message_templates" (
				"id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
				"name" VARCHAR(255) NOT NULL,
				"type" VARCHAR(255) NOT NULL CHECK ("type" IN ('WALKER_WELCOME', 'SERVER_WELCOME', 'EMERGENCY_CONTACT_VALIDATION', 'PALANCA_REQUEST', 'PALANCA_REMINDER', 'GENERAL', 'PRE_RETREAT_REMINDER', 'PAYMENT_REMINDER', 'POST_RETREAT_MESSAGE', 'CANCELLATION_CONFIRMATION')),
				"message" TEXT NOT NULL,
				"retreatId" UUID NOT NULL,
				"created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
				"updated_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
				FOREIGN KEY ("retreatId") REFERENCES "retreat" ("id") ON DELETE CASCADE
			)
		`);

		// Create inventory_category table
		await queryRunner.query(`
			CREATE TABLE IF NOT EXISTS "inventory_category" (
				"id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
				"name" VARCHAR(255) NOT NULL,
				"description" TEXT,
				"is_active" BOOLEAN NOT NULL DEFAULT true,
				"created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
				"updated_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
			)
		`);

		// Create inventory_team table
		await queryRunner.query(`
			CREATE TABLE IF NOT EXISTS "inventory_team" (
				"id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
				"name" VARCHAR(255) NOT NULL,
				"description" TEXT,
				"is_active" BOOLEAN NOT NULL DEFAULT true,
				"created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
				"updated_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
			)
		`);

		// Create inventory_item table
		await queryRunner.query(`
			CREATE TABLE IF NOT EXISTS "inventory_item" (
				"id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
				"name" VARCHAR(255) NOT NULL,
				"description" TEXT,
				"category_id" UUID NOT NULL,
				"team_id" UUID NOT NULL,
				"ratio" DECIMAL(5,2) NOT NULL DEFAULT 1.0,
				"required_quantity" DECIMAL(10,2),
				"unit" VARCHAR(255) NOT NULL,
				"is_calculated" BOOLEAN NOT NULL DEFAULT false,
				"calculation_type" VARCHAR(255),
				"tshirt_size" VARCHAR(255),
				"is_active" BOOLEAN NOT NULL DEFAULT true,
				"created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
				"updated_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
				FOREIGN KEY ("category_id") REFERENCES "inventory_category" ("id") ON DELETE RESTRICT,
				FOREIGN KEY ("team_id") REFERENCES "inventory_team" ("id") ON DELETE RESTRICT
			)
		`);

		// Create retreat_inventory table
		await queryRunner.query(`
			CREATE TABLE IF NOT EXISTS "retreat_inventory" (
				"id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
				"retreatId" UUID NOT NULL,
				"inventory_item_id" UUID NOT NULL,
				"required_quantity" DECIMAL(10,2) NOT NULL DEFAULT 0,
				"current_quantity" DECIMAL(10,2) NOT NULL DEFAULT 0,
				"is_sufficient" BOOLEAN NOT NULL DEFAULT false,
				"notes" TEXT,
				"created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
				"updated_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
				FOREIGN KEY ("retreatId") REFERENCES "retreat" ("id") ON DELETE CASCADE,
				FOREIGN KEY ("inventory_item_id") REFERENCES "inventory_item" ("id") ON DELETE CASCADE
			)
		`);

		// Create permissions table
		await queryRunner.query(`
			CREATE TABLE IF NOT EXISTS "permissions" (
				"id" SERIAL PRIMARY KEY,
				"resource" VARCHAR(255) NOT NULL,
				"operation" VARCHAR(255) NOT NULL,
				"description" TEXT,
				"created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
				"updated_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
				UNIQUE("resource", "operation")
			);
		`);

		// Create roles table
		await queryRunner.query(`
			CREATE TABLE IF NOT EXISTS "roles" (
				"id" SERIAL PRIMARY KEY,
				"name" VARCHAR(255) NOT NULL UNIQUE,
				"description" TEXT,
				"created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
				"updated_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
			);
		`);

		// Create role_permissions table
		await queryRunner.query(`
			CREATE TABLE IF NOT EXISTS "role_permissions" (
				"id" SERIAL PRIMARY KEY,
				"role_id" INTEGER NOT NULL,
				"permission_id" INTEGER NOT NULL,
				"created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
				FOREIGN KEY("role_id") REFERENCES "roles"("id") ON DELETE CASCADE,
				FOREIGN KEY("permission_id") REFERENCES "permissions"("id") ON DELETE CASCADE,
				UNIQUE("role_id", "permission_id")
			);
		`);

		// Create user_roles table
		await queryRunner.query(`
			CREATE TABLE IF NOT EXISTS "user_roles" (
				"id" SERIAL PRIMARY KEY,
				"user_id" UUID NOT NULL,
				"role_id" INTEGER NOT NULL,
				"created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
				FOREIGN KEY("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
				FOREIGN KEY("role_id") REFERENCES "roles"("id") ON DELETE CASCADE,
				UNIQUE("user_id", "role_id")
			);
		`);

		// Create user_retreats table
		await queryRunner.query(`
			CREATE TABLE IF NOT EXISTS "user_retreats" (
				"id" SERIAL PRIMARY KEY,
				"user_id" UUID NOT NULL,
				"retreat_id" UUID NOT NULL,
				"role_id" INTEGER NOT NULL,
				"created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
				FOREIGN KEY("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
				FOREIGN KEY("retreat_id") REFERENCES "retreat"("id") ON DELETE CASCADE,
				FOREIGN KEY("role_id") REFERENCES "roles"("id") ON DELETE CASCADE,
				UNIQUE("user_id", "retreat_id", "role_id")
			);
		`);

		// Create indexes for better performance
		await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_users_email" ON "users" ("email")`);
		await queryRunner.query(
			`CREATE INDEX IF NOT EXISTS "idx_users_google_id" ON "users" ("google_id")`,
		);
		await queryRunner.query(
			`CREATE INDEX IF NOT EXISTS "idx_participants_retreat_id" ON "participants" ("retreatId")`,
		);
		await queryRunner.query(
			`CREATE INDEX IF NOT EXISTS "idx_participants_table_id" ON "participants" ("tableId")`,
		);
		await queryRunner.query(
			`CREATE INDEX IF NOT EXISTS "idx_participants_retreat_bed_id" ON "participants" ("retreatBedId")`,
		);
		await queryRunner.query(
			`CREATE INDEX IF NOT EXISTS "idx_tables_retreat_id" ON "tables" ("retreatId")`,
		);
		await queryRunner.query(
			`CREATE INDEX IF NOT EXISTS "idx_retreat_bed_retreat_id" ON "retreat_bed" ("retreatId")`,
		);
		await queryRunner.query(
			`CREATE INDEX IF NOT EXISTS "idx_retreat_bed_participant_id" ON "retreat_bed" ("participantId")`,
		);
		await queryRunner.query(
			`CREATE INDEX IF NOT EXISTS "idx_retreat_charges_retreat_id" ON "retreat_charges" ("retreatId")`,
		);
		await queryRunner.query(
			`CREATE INDEX IF NOT EXISTS "idx_retreat_charges_participant_id" ON "retreat_charges" ("participantId")`,
		);
		await queryRunner.query(
			`CREATE INDEX IF NOT EXISTS "idx_message_templates_retreat_id" ON "message_templates" ("retreatId")`,
		);
		await queryRunner.query(
			`CREATE INDEX IF NOT EXISTS "idx_inventory_item_category_id" ON "inventory_item" ("category_id")`,
		);
		await queryRunner.query(
			`CREATE INDEX IF NOT EXISTS "idx_inventory_item_team_id" ON "inventory_item" ("team_id")`,
		);
		await queryRunner.query(
			`CREATE INDEX IF NOT EXISTS "idx_retreat_inventory_retreat_id" ON "retreat_inventory" ("retreatId")`,
		);
		await queryRunner.query(
			`CREATE INDEX IF NOT EXISTS "idx_retreat_inventory_inventory_item_id" ON "retreat_inventory" ("inventory_item_id")`,
		);
		await queryRunner.query(
			`CREATE INDEX IF NOT EXISTS "idx_participants_table_id" ON "participants" ("tableId")`,
		);
		await queryRunner.query(
			`CREATE INDEX IF NOT EXISTS "idx_participants_retreat_bed_id" ON "participants" ("retreatBedId")`,
		);
		await queryRunner.query(
			`CREATE INDEX IF NOT EXISTS "idx_tables_lider_id" ON "tables" ("liderId")`,
		);
		await queryRunner.query(
			`CREATE INDEX IF NOT EXISTS "idx_tables_colider1_id" ON "tables" ("colider1Id")`,
		);
		await queryRunner.query(
			`CREATE INDEX IF NOT EXISTS "idx_tables_colider2_id" ON "tables" ("colider2Id")`,
		);
		await queryRunner.query(
			`CREATE INDEX IF NOT EXISTS "idx_retreat_charges_participant_id" ON "retreat_charges" ("participantId")`,
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
			('payment', 'list', 'List payments');
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
				`INSERT INTO "role_permissions" ("role_id", "permission_id") VALUES ($1, $2)`,
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
					`INSERT INTO "role_permissions" ("role_id", "permission_id") VALUES ($1, $2)`,
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
					`INSERT INTO "role_permissions" ("role_id", "permission_id") VALUES ($1, $2)`,
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
					`INSERT INTO "role_permissions" ("role_id", "permission_id") VALUES ($1, $2)`,
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
					`INSERT INTO "role_permissions" ("role_id", "permission_id") VALUES ($1, $2)`,
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
					`INSERT INTO "role_permissions" ("role_id", "permission_id") VALUES ($1, $2)`,
					[roles.palancas, permissions[perm]],
				);
			}
		}

		// Update existing master user to have superadmin role
		const masterEmail = process.env.SEED_MASTER_USER_EMAIL || 'admin@example.com';
		const userResult = await queryRunner.query(`SELECT id FROM "users" WHERE email = $1 LIMIT 1`, [
			masterEmail,
		]);

		if (userResult.length > 0) {
			const userId = userResult[0].id;
			await queryRunner.query(`INSERT INTO "user_roles" ("user_id", "role_id") VALUES ($1, $2)`, [
				userId,
				roles.superadmin,
			]);
		}
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		// Drop indexes first
		await queryRunner.query(`DROP INDEX IF EXISTS "idx_retreat_inventory_inventory_item_id"`);
		await queryRunner.query(`DROP INDEX IF EXISTS "idx_retreat_inventory_retreat_id"`);
		await queryRunner.query(`DROP INDEX IF EXISTS "idx_inventory_item_team_id"`);
		await queryRunner.query(`DROP INDEX IF EXISTS "idx_inventory_item_category_id"`);
		await queryRunner.query(`DROP INDEX IF EXISTS "idx_message_templates_retreat_id"`);
		await queryRunner.query(`DROP INDEX IF EXISTS "idx_retreat_charges_participant_id"`);
		await queryRunner.query(`DROP INDEX IF EXISTS "idx_retreat_charges_retreat_id"`);
		await queryRunner.query(`DROP INDEX IF EXISTS "idx_retreat_bed_participant_id"`);
		await queryRunner.query(`DROP INDEX IF EXISTS "idx_retreat_bed_retreat_id"`);
		await queryRunner.query(`DROP INDEX IF EXISTS "idx_tables_retreat_id"`);
		await queryRunner.query(`DROP INDEX IF EXISTS "idx_participants_retreat_bed_id"`);
		await queryRunner.query(`DROP INDEX IF EXISTS "idx_participants_table_id"`);
		await queryRunner.query(`DROP INDEX IF EXISTS "idx_participants_retreat_id"`);
		await queryRunner.query(`DROP INDEX IF EXISTS "idx_users_google_id"`);
		await queryRunner.query(`DROP INDEX IF EXISTS "idx_users_email"`);

		// Drop tables in reverse order to respect foreign key constraints
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
