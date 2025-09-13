import { MigrationInterface, QueryRunner } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import * as bcrypt from 'bcrypt';

export class SeedInitialData20250910163452 implements MigrationInterface {
	name = 'SeedInitialData';
	timestamp = '20250910163452';

	public async up(queryRunner: QueryRunner): Promise<void> {
		console.log('🌱 Seeding initial data...');

		// Create master user
		const masterUserId = uuidv4();
		const masterEmail = process.env.SEED_MASTER_USER_EMAIL || 'admin@example.com';
		const masterName = process.env.SEED_MASTER_USER_NAME || 'Administrator';
		const masterPassword = process.env.SEED_MASTER_USER_PASSWORD || 'password';

		// Hash the master password
		const hashedPassword = await bcrypt.hash(masterPassword, 10);

		console.log(`Creating master user: ${masterEmail}`);

		await queryRunner.query(
			`
			INSERT OR IGNORE INTO "users" (
				"id", "email", "displayName", "password", "createdAt", "updatedAt"
			) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
		`,
			[masterUserId, masterEmail, masterName, hashedPassword],
		);

		console.log('✅ Master user created/updated.');

		// Assign superadmin role to master user
		console.log('Assigning superadmin role to master user...');

		// Get the superadmin role ID
		const roleResult = await queryRunner.query(
			`SELECT id FROM "roles" WHERE "name" = 'superadmin' LIMIT 1`,
		);

		if (roleResult.length > 0) {
			const superadminRoleId = roleResult[0].id;

			// Assign the role to the master user
			await queryRunner.query(
				`
				INSERT OR IGNORE INTO "user_roles" ("userId", "roleId", "createdAt")
				VALUES (?, ?, CURRENT_TIMESTAMP)
				`,
				[masterUserId, superadminRoleId],
			);

			console.log('✅ Superadmin role assigned to master user.');

			// Create users for other roles
			console.log('Creating users for other roles...');

			// Admin user
			const adminUserId = uuidv4();
			const adminEmail = process.env.SEED_ADMIN_USER_EMAIL || 'admin@emaus.org';
			const adminName = process.env.SEED_ADMIN_USER_NAME || 'Administrador';
			const adminPassword = process.env.SEED_ADMIN_USER_PASSWORD || 'admin123';
			const adminHashedPassword = await bcrypt.hash(adminPassword, 10);

			await queryRunner.query(
				`
			INSERT OR IGNORE INTO "users" (
				"id", "email", "displayName", "password", "createdAt", "updatedAt"
			) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
			`,
				[adminUserId, adminEmail, adminName, adminHashedPassword],
			);

			// Server user
			const serverUserId = uuidv4();
			const serverEmail = process.env.SEED_SERVER_USER_EMAIL || 'servidor@emaus.org';
			const serverName = process.env.SEED_SERVER_USER_NAME || 'Servidor';
			const serverPassword = process.env.SEED_SERVER_USER_PASSWORD || 'servidor123';
			const serverHashedPassword = await bcrypt.hash(serverPassword, 10);

			await queryRunner.query(
				`
			INSERT OR IGNORE INTO "users" (
				"id", "email", "displayName", "password", "createdAt", "updatedAt"
			) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
			`,
				[serverUserId, serverEmail, serverName, serverHashedPassword],
			);

			// Treasurer user
			const treasurerUserId = uuidv4();
			const treasurerEmail = process.env.SEED_TREASURER_USER_EMAIL || 'tesorero@emaus.org';
			const treasurerName = process.env.SEED_TREASURER_USER_NAME || 'Tesorero';
			const treasurerPassword = process.env.SEED_TREASURER_USER_PASSWORD || 'tesorero123';
			const treasurerHashedPassword = await bcrypt.hash(treasurerPassword, 10);

			await queryRunner.query(
				`
			INSERT OR IGNORE INTO "users" (
				"id", "email", "displayName", "password", "createdAt", "updatedAt"
			) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
			`,
				[treasurerUserId, treasurerEmail, treasurerName, treasurerHashedPassword],
			);

			// Logistics user
			const logisticsUserId = uuidv4();
			const logisticsEmail = process.env.SEED_LOGISTICS_USER_EMAIL || 'logistica@emaus.org';
			const logisticsName = process.env.SEED_LOGISTICS_USER_NAME || 'Logística';
			const logisticsPassword = process.env.SEED_LOGISTICS_USER_PASSWORD || 'logistica123';
			const logisticsHashedPassword = await bcrypt.hash(logisticsPassword, 10);

			await queryRunner.query(
				`
			INSERT OR IGNORE INTO "users" (
				"id", "email", "displayName", "password", "createdAt", "updatedAt"
			) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
			`,
				[logisticsUserId, logisticsEmail, logisticsName, logisticsHashedPassword],
			);

			// Operations user
			const operationsUserId = uuidv4();
			const operationsEmail = process.env.SEED_OPERATIONS_USER_EMAIL || 'palancas@emaus.org';
			const operationsName = process.env.SEED_OPERATIONS_USER_NAME || 'Palancas';
			const operationsPassword = process.env.SEED_OPERATIONS_USER_PASSWORD || 'palancas123';
			const operationsHashedPassword = await bcrypt.hash(operationsPassword, 10);

			await queryRunner.query(
				`
			INSERT OR IGNORE INTO "users" (
				"id", "email", "displayName", "password", "createdAt", "updatedAt"
			) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
			`,
				[operationsUserId, operationsEmail, operationsName, operationsHashedPassword],
			);

			console.log('✅ Users for all roles created.');

			// Get all role IDs
			const allRoles = await queryRunner.query(
				`SELECT id, name FROM "roles" WHERE "name" IN ('admin', 'servidor', 'tesorero', 'logística', 'palancas')`,
			);

			const roleMap = new Map<string, string>();
			allRoles.forEach((role: { id: string; name: string }) => {
				roleMap.set(role.name, role.id);
			});

			// Assign roles to users
			console.log('Assigning roles to users...');

			// Assign admin role
			if (roleMap.has('admin')) {
				await queryRunner.query(
					`
				INSERT OR IGNORE INTO "user_roles" ("userId", "roleId", "createdAt")
				VALUES (?, ?, CURRENT_TIMESTAMP)
				`,
					[adminUserId, roleMap.get('admin')],
				);
			}

			// Assign server role
			if (roleMap.has('servidor')) {
				await queryRunner.query(
					`
				INSERT OR IGNORE INTO "user_roles" ("userId", "roleId", "createdAt")
				VALUES (?, ?, CURRENT_TIMESTAMP)
				`,
					[serverUserId, roleMap.get('servidor')],
				);
			}

			// Assign treasurer role
			if (roleMap.has('tesorero')) {
				await queryRunner.query(
					`
				INSERT OR IGNORE INTO "user_roles" ("userId", "roleId", "createdAt")
				VALUES (?, ?, CURRENT_TIMESTAMP)
				`,
					[treasurerUserId, roleMap.get('tesorero')],
				);
			}

			// Assign logistics role
			if (roleMap.has('logística')) {
				await queryRunner.query(
					`
				INSERT OR IGNORE INTO "user_roles" ("userId", "roleId", "createdAt")
				VALUES (?, ?, CURRENT_TIMESTAMP)
				`,
					[logisticsUserId, roleMap.get('logística')],
				);
			}

			// Assign operations role
			if (roleMap.has('palancas')) {
				await queryRunner.query(
					`
				INSERT OR IGNORE INTO "user_roles" ("userId", "roleId", "createdAt")
				VALUES (?, ?, CURRENT_TIMESTAMP)
				`,
					[operationsUserId, roleMap.get('palancas')],
				);
			}

			console.log('✅ Roles assigned to all users.');
		} else {
			console.log(
				'⚠️  Superadmin role not found. Make sure the schema migration has been run first.',
			);
		}

		// Check if we need to create sample data (only if SEED_FORCE is true)
		const forceSeed = process.env.SEED_FORCE === 'true';

		if (forceSeed) {
			console.log('🏠 Creating sample house data...');

			// Create sample house
			const houseId = uuidv4();
			await queryRunner.query(
				`
				INSERT OR IGNORE INTO "house" (
					"id", "name", "address1", "city", "state", "zipCode", "country", "capacity"
				) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
			`,
				[
					houseId,
					'Casa Emaus Principal',
					'Av. Principal 123',
					'Ciudad de México',
					'CDMX',
					'01234',
					'México',
					50,
				],
			);

			// Create sample beds for the house
			const bedIds = [uuidv4(), uuidv4(), uuidv4()];
			await queryRunner.query(
				`
				INSERT OR IGNORE INTO "bed" ("id", "roomNumber", "bedNumber", "type", "defaultUsage", "houseId")
				VALUES (?, ?, ?, ?, ?, ?), (?, ?, ?, ?, ?, ?), (?, ?, ?, ?, ?, ?)
			`,
				[
					bedIds[0],
					'101',
					'1',
					'normal',
					'caminante',
					houseId,
					bedIds[1],
					'101',
					'2',
					'normal',
					'caminante',
					houseId,
					bedIds[2],
					'102',
					'1',
					'litera',
					'servidor',
					houseId,
				],
			);

			console.log('✅ Sample house and beds created.');

			// Create sample retreat
			const retreatId = uuidv4();
			const startDate = new Date();
			startDate.setMonth(startDate.getMonth() + 1);
			const endDate = new Date(startDate);
			endDate.setDate(endDate.getDate() + 3);

			await queryRunner.query(
				`
				INSERT OR IGNORE INTO "retreat" (
					"id", "parish", "startDate", "endDate", "houseId", "max_walkers", "max_servers"
				) VALUES (?, ?, ?, ?, ?, ?, ?)
			`,
				[
					retreatId,
					'Parroquia de San Francisco',
					startDate.toISOString().split('T')[0],
					endDate.toISOString().split('T')[0],
					houseId,
					30,
					15,
				],
			);

			console.log('✅ Sample retreat created.');

			// Create 40 retreat beds - 20 for walkers and 20 for servers
			console.log('Creating 40 retreat beds (20 for walkers, 20 for servers)...');

			for (let i = 0; i < 40; i++) {
				const roomNumber = Math.floor(i / 4) + 1; // 4 beds per room
				const bedNumber = (i % 4) + 1;
				const isWalker = i < 20; // First 20 beds for walkers, next 20 for servers
				const bedType = i % 4 === 2 || i % 4 === 3 ? 'litera' : 'normal'; // Every 3rd and 4th bed is a bunk bed

				await queryRunner.query(
					`
					INSERT OR IGNORE INTO "retreat_bed" (
						"id", "roomNumber", "bedNumber", "type", "defaultUsage", "retreatId"
					) VALUES (?, ?, ?, ?, ?, ?)
				`,
					[
						uuidv4(),
						roomNumber.toString(),
						bedNumber.toString(),
						bedType,
						isWalker ? 'caminante' : 'servidor',
						retreatId,
					],
				);
			}

			console.log('✅ Sample retreat beds created.');

			// Create sample tables
			const tableIds = [uuidv4(), uuidv4(), uuidv4()];
			await queryRunner.query(
				`
				INSERT OR IGNORE INTO "tables" ("id", "name", "retreatId")
				VALUES (?, ?, ?), (?, ?, ?), (?, ?, ?)
			`,
				[
					tableIds[0],
					'Mesa 1',
					retreatId,
					tableIds[1],
					'Mesa 2',
					retreatId,
					tableIds[2],
					'Mesa 3',
					retreatId,
				],
			);

			console.log('✅ Sample tables created.');

			// Create inventory categories
			const categoryIds = [uuidv4(), uuidv4()];
			await queryRunner.query(
				`
				INSERT OR IGNORE INTO "inventory_category" ("id", "name", "description")
				VALUES (?, ?, ?), (?, ?, ?)
			`,
				[
					categoryIds[0],
					'Comida',
					'Artículos de comida y bebida',
					categoryIds[1],
					'Limpieza',
					'Artículos de limpieza e higiene',
				],
			);

			console.log('✅ Sample inventory categories created.');

			// Create inventory teams
			const teamIds = [uuidv4(), uuidv4()];
			await queryRunner.query(
				`
				INSERT OR IGNORE INTO "inventory_team" ("id", "name", "description")
				VALUES (?, ?, ?), (?, ?, ?)
			`,
				[
					teamIds[0],
					'Cocina',
					'Equipo de cocina y alimentación',
					teamIds[1],
					'Limpieza',
					'Equipo de limpieza y mantenimiento',
				],
			);

			console.log('✅ Sample inventory teams created.');

			// Create inventory items
			const itemIds = [uuidv4(), uuidv4(), uuidv4(), uuidv4()];
			await queryRunner.query(
				`
				INSERT OR IGNORE INTO "inventory_item" (
					"id", "name", "description", "categoryId", "teamId", "ratio", "unit", "isActive"
				) VALUES (?, ?, ?, ?, ?, ?, ?, ?), (?, ?, ?, ?, ?, ?, ?, ?), (?, ?, ?, ?, ?, ?, ?, ?), (?, ?, ?, ?, ?, ?, ?, ?)
			`,
				[
					itemIds[0],
					'Agua',
					'Agua embotellada',
					categoryIds[0],
					teamIds[0],
					1.0,
					'litros',
					true,
					itemIds[1],
					'Pan',
					'Pan para comidas',
					categoryIds[0],
					teamIds[0],
					2.0,
					'piezas',
					true,
					itemIds[2],
					'Jabón',
					'Jabón para manos',
					categoryIds[1],
					teamIds[1],
					1.0,
					'unidades',
					true,
					itemIds[3],
					'Toallas',
					'Toallas de papel',
					categoryIds[1],
					teamIds[1],
					3.0,
					'paquetes',
					true,
				],
			);

			console.log('✅ Sample inventory items created.');

			// Create message templates
			const templateIds = [uuidv4(), uuidv4(), uuidv4()];
			await queryRunner.query(
				`
				INSERT OR IGNORE INTO "message_templates" (
					"id", "name", "type", "message", "retreatId"
				) VALUES (?, ?, ?, ?, ?), (?, ?, ?, ?, ?), (?, ?, ?, ?, ?)
			`,
				[
					templateIds[0],
					'Bienvenida Caminante',
					'WALKER_WELCOME',
					'¡Bienvenido/a al retiro! Estamos emocionados de tenerte con nosotros. Por favor llega a tiempo y trae todo lo necesario.',
					retreatId,
					templateIds[1],
					'Bienvenida Servidor',
					'SERVER_WELCOME',
					'¡Gracias por ser parte del equipo de servidores! Tu dedicación hace posible este retiro.',
					retreatId,
					templateIds[2],
					'Recordatorio de Pago',
					'PAYMENT_REMINDER',
					'Este es un recordatorio amable sobre tu pago del retiro. Por favor completa tu pago a la brevedad posible.',
					retreatId,
				],
			);

			console.log('✅ Sample message templates created.');
		}

		console.log('✅ Initial data seeding completed.');
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		console.log('🧹 Removing seeded data...');

		// Note: This is a simple seed cleanup. In production, you might want to be more careful
		// about what data to remove based on your business logic.

		// Remove message templates
		await queryRunner.query(
			`DELETE FROM "message_templates" WHERE "name" IN ('Bienvenida Caminante', 'Bienvenida Servidor', 'Recordatorio de Pago')`,
		);

		// Remove inventory items
		await queryRunner.query(
			`DELETE FROM "inventory_item" WHERE "name" IN ('Agua', 'Pan', 'Jabón', 'Toallas')`,
		);

		// Remove inventory teams
		await queryRunner.query(`DELETE FROM "inventory_team" WHERE "name" IN ('Cocina', 'Limpieza')`);

		// Remove inventory categories
		await queryRunner.query(
			`DELETE FROM "inventory_category" WHERE "name" IN ('Comida', 'Limpieza')`,
		);

		// Remove tables
		await queryRunner.query(`DELETE FROM "tables" WHERE "name" LIKE 'Mesa%'`);

		// Remove retreat beds
		await queryRunner.query(`DELETE FROM "retreat_bed" WHERE "roomNumber" LIKE 'Room%'`);

		// Remove retreats
		await queryRunner.query(`DELETE FROM "retreat" WHERE "parish" = 'Parroquia de San Francisco'`);

		// Remove beds
		await queryRunner.query(
			`DELETE FROM "bed" WHERE "houseId" IN (SELECT "id" FROM "house" WHERE "name" = 'Casa Emaus Principal')`,
		);

		// Remove houses
		await queryRunner.query(`DELETE FROM "house" WHERE "name" = 'Casa Emaus Principal'`);

		// Remove master user roles first (to avoid foreign key constraint issues)
		const masterEmail = process.env.SEED_MASTER_USER_EMAIL || 'admin@example.com';
		await queryRunner.query(
			`DELETE FROM "user_roles" WHERE "userId" IN (SELECT "id" FROM "users" WHERE "email" = ?)`,
			[masterEmail],
		);

		// Remove master user (only if it was created by this seed)
		await queryRunner.query(`DELETE FROM "users" WHERE "email" = ?`, [masterEmail]);

		console.log('✅ Seeded data removed.');
	}
}
