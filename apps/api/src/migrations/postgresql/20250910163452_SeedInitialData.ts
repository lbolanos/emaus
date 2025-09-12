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
			INSERT INTO "users" (
				"id", "email", "display_name", "password", "created_at", "updated_at"
			) VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
			ON CONFLICT ("email") DO UPDATE SET
				"display_name" = EXCLUDED."display_name",
				"password" = EXCLUDED."password",
				"updated_at" = CURRENT_TIMESTAMP
		`,
			[masterUserId, masterEmail, masterName, hashedPassword],
		);

		console.log('✅ Master user created/updated.');

		// Check if we need to create sample data (only if SEED_FORCE is true)
		const forceSeed = process.env.SEED_FORCE === 'true';

		if (forceSeed) {
			console.log('🏠 Creating sample house data...');

			// Create sample house
			const houseId = uuidv4();
			await queryRunner.query(
				`
				INSERT INTO "house" (
					"id", "name", "address1", "city", "state", "zip_code", "country", "capacity"
				) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
				ON CONFLICT DO NOTHING
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
				INSERT INTO "bed" ("id", "room_number", "bed_number", "type", "default_usage", "houseId")
				VALUES ($1, $2, $3, $4, $5, $6), ($7, $8, $9, $10, $11, $12), ($13, $14, $15, $16, $17, $18)
				ON CONFLICT DO NOTHING
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
				INSERT INTO "retreat" (
					"id", "parish", "start_date", "end_date", "houseId", "max_walkers", "max_servers"
				) VALUES ($1, $2, $3, $4, $5, $6, $7)
				ON CONFLICT DO NOTHING
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

			// Create sample retreat beds
			for (let i = 0; i < bedIds.length; i++) {
				await queryRunner.query(
					`
					INSERT INTO "retreat_bed" (
						"id", "room_number", "bed_number", "type", "default_usage", "retreatId"
					) VALUES ($1, $2, $3, $4, $5, $6)
					ON CONFLICT DO NOTHING
				`,
					[
						uuidv4(),
						`Room ${(i + 1) * 100}`,
						`Bed ${i + 1}`,
						i === 2 ? 'litera' : 'normal',
						i === 2 ? 'servidor' : 'caminante',
						retreatId,
					],
				);
			}

			console.log('✅ Sample retreat beds created.');

			// Create sample tables
			const tableIds = [uuidv4(), uuidv4(), uuidv4()];
			await queryRunner.query(
				`
				INSERT INTO "tables" ("id", "name", "retreatId")
				VALUES ($1, $2, $3), ($4, $5, $6), ($7, $8, $9)
				ON CONFLICT DO NOTHING
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
				INSERT INTO "inventory_category" ("id", "name", "description")
				VALUES ($1, $2, $3), ($4, $5, $6)
				ON CONFLICT DO NOTHING
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
				INSERT INTO "inventory_team" ("id", "name", "description")
				VALUES ($1, $2, $3), ($4, $5, $6)
				ON CONFLICT DO NOTHING
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
				INSERT INTO "inventory_item" (
					"id", "name", "description", "category_id", "team_id", "ratio", "unit", "is_active"
				) VALUES ($1, $2, $3, $4, $5, $6, $7, $8), ($9, $10, $11, $12, $13, $14, $15, $16), ($17, $18, $19, $20, $21, $22, $23, $24), ($25, $26, $27, $28, $29, $30, $31, $32)
				ON CONFLICT DO NOTHING
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
				INSERT INTO "message_templates" (
					"id", "name", "type", "message", "retreatId"
				) VALUES ($1, $2, $3, $4, $5), ($6, $7, $8, $9, $10), ($11, $12, $13, $14, $15)
				ON CONFLICT DO NOTHING
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
		await queryRunner.query(`DELETE FROM "retreat_bed" WHERE "room_number" LIKE 'Room%'`);

		// Remove retreats
		await queryRunner.query(`DELETE FROM "retreat" WHERE "parish" = 'Parroquia de San Francisco'`);

		// Remove beds
		await queryRunner.query(
			`DELETE FROM "bed" WHERE "houseId" IN (SELECT "id" FROM "house" WHERE "name" = 'Casa Emaus Principal')`,
		);

		// Remove houses
		await queryRunner.query(`DELETE FROM "house" WHERE "name" = 'Casa Emaus Principal'`);

		// Remove master user (only if it was created by this seed)
		const masterEmail = process.env.SEED_MASTER_USER_EMAIL || 'admin@example.com';
		await queryRunner.query(`DELETE FROM "users" WHERE "email" = $1`, [masterEmail]);

		console.log('✅ Seeded data removed.');
	}
}
