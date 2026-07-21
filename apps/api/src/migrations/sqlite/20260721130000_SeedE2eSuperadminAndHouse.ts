import { MigrationInterface, QueryRunner } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import * as bcrypt from 'bcrypt';

/**
 * Fixtures para el e2e happy-path de borrado de retiros:
 *   - e2e-superadmin@test.local (Test1234!) con rol `superadmin`
 *   - una casa E2E fija (houseId requerido para crear un retiro)
 *
 * Idempotente (INSERT OR IGNORE + chequeo de user_roles).
 * Guard de producción: no corre salvo `SEED_E2E_USERS_PRODUCTION=true`
 * (mismo patrón que 20260516200000_SeedE2ETestUsers). Nunca sembrar un
 * superadmin de prueba con password conocido en prod.
 */
export class SeedE2eSuperadminAndHouse20260721130000 implements MigrationInterface {
	name = 'SeedE2eSuperadminAndHouse';
	timestamp = '20260721130000';

	private readonly HOUSE_ID = 'e2e00003-cccc-cccc-cccc-000000000003';

	public async up(queryRunner: QueryRunner): Promise<void> {
		if (
			process.env.NODE_ENV === 'production' &&
			process.env.SEED_E2E_USERS_PRODUCTION !== 'true'
		) {
			console.log('⏭  Skipping E2E superadmin seed in production');
			return;
		}

		const hash = await bcrypt.hash('Test1234!', 10);
		await queryRunner.query(
			`INSERT OR IGNORE INTO users (id, email, displayName, password, createdAt, updatedAt)
			 VALUES (?, 'e2e-superadmin@test.local', 'E2E Superadmin', ?, datetime('now'), datetime('now'))`,
			[uuidv4(), hash],
		);

		const [userRow] = await queryRunner.query(
			`SELECT id FROM users WHERE email = 'e2e-superadmin@test.local'`,
		);
		const [roleRow] = await queryRunner.query(`SELECT id FROM roles WHERE name = 'superadmin'`);
		if (userRow && roleRow) {
			const existing = await queryRunner.query(
				`SELECT id FROM user_roles WHERE userId = ? AND roleId = ?`,
				[userRow.id, roleRow.id],
			);
			if (existing.length === 0) {
				await queryRunner.query(
					`INSERT INTO user_roles (userId, roleId, createdAt) VALUES (?, ?, datetime('now'))`,
					[userRow.id, roleRow.id],
				);
			}
		}

		// Casa fija: houseId es requerido al crear un retiro; el spec la reutiliza.
		await queryRunner.query(
			`INSERT OR IGNORE INTO house (id, name, address1, city, state, zipCode, country, capacity, timezone)
			 VALUES (?, 'E2E Test House', 'Calle E2E 1', 'CDMX', 'CDMX', '01000', 'México', 100, 'America/Mexico_City')`,
			[this.HOUSE_ID],
		);

		console.log('Seeded e2e-superadmin user (+superadmin role) and E2E house');
	}

	public async down(_queryRunner: QueryRunner): Promise<void> {
		console.log('Down no-op: e2e superadmin/house seed');
	}
}
