/**
 * Functional test for ImportGlobalTemplatesToCommunities20260507260000.
 *
 * Verifies:
 *   - Plantillas globales activas no-SYS_ se copian a cada comunidad existente.
 *   - Plantillas SYS_ NO se copian (uso solo a nivel sistema).
 *   - Plantillas inactivas NO se copian.
 *   - Es idempotente: correr dos veces no duplica.
 */
import { setupTestDatabase, teardownTestDatabase, clearTestData } from '../test-setup';
import { TestDataFactory } from '../test-utils/testDataFactory';

describe('ImportGlobalTemplatesToCommunities20260507260000', () => {
	let migration: any;

	beforeAll(async () => {
		await setupTestDatabase();
		const mod = await import(
			'@/migrations/sqlite/20260507260000_ImportGlobalTemplatesToCommunities'
		);
		migration = new mod.ImportGlobalTemplatesToCommunities20260507260000();
	});

	afterAll(async () => {
		await teardownTestDatabase();
	});

	beforeEach(async () => {
		await clearTestData();
		// clearTestData mistypes the table as `message_template` (singular) and
		// omits `global_message_templates` entirely — clean them by hand so
		// each test starts fresh.
		const ds = TestDataFactory.getDataSource();
		await ds.query(`DELETE FROM message_templates`);
		await ds.query(`DELETE FROM global_message_templates`);
	});

	async function getMigrationStats() {
		const ds = TestDataFactory.getDataSource();
		const rows = await ds.query(
			`SELECT scope, COUNT(*) AS n FROM message_templates GROUP BY scope`,
		);
		return Object.fromEntries(rows.map((r: any) => [r.scope, r.n]));
	}

	it('copia globales activas no-SYS a cada comunidad existente', async () => {
		const owner = await TestDataFactory.createTestUser();
		const community = await TestDataFactory.createTestCommunity(owner.id);

		// Three globals: 1 valid, 1 SYS_ (skip), 1 inactive (skip).
		await TestDataFactory.createGlobalMessageTemplate({
			name: 'Bienvenida',
			type: 'WALKER_WELCOME',
			isActive: true,
		});
		await TestDataFactory.createGlobalMessageTemplate({
			name: 'Sys reset',
			type: 'SYS_PASSWORD_RESET',
			isActive: true,
		});
		await TestDataFactory.createGlobalMessageTemplate({
			name: 'Old',
			type: 'GENERAL',
			isActive: false,
		});

		const ds = TestDataFactory.getDataSource();
		const queryRunner = ds.createQueryRunner();
		await migration.up(queryRunner);
		await queryRunner.release();

		const stats = await getMigrationStats();
		expect(stats.community).toBe(1); // solo la WALKER_WELCOME se copió

		const copied = await ds.query(
			`SELECT type, scope, communityId FROM message_templates WHERE scope='community'`,
		);
		expect(copied[0].type).toBe('WALKER_WELCOME');
		expect(copied[0].communityId).toBe(community.id);
	});

	it('es idempotente — correr dos veces no duplica', async () => {
		const owner = await TestDataFactory.createTestUser();
		await TestDataFactory.createTestCommunity(owner.id);
		await TestDataFactory.createGlobalMessageTemplate({
			name: 'Plantilla X',
			type: 'GENERAL',
			isActive: true,
		});

		const ds = TestDataFactory.getDataSource();
		const queryRunner = ds.createQueryRunner();

		await migration.up(queryRunner);
		const after1 = (await ds.query(
			`SELECT COUNT(*) AS n FROM message_templates WHERE scope='community'`,
		))[0].n;

		await migration.up(queryRunner);
		const after2 = (await ds.query(
			`SELECT COUNT(*) AS n FROM message_templates WHERE scope='community'`,
		))[0].n;

		await queryRunner.release();

		expect(after1).toBe(1);
		expect(after2).toBe(1);
	});

	it('si la comunidad ya tiene una plantilla del mismo type, NO la sobreescribe', async () => {
		const owner = await TestDataFactory.createTestUser();
		const community = await TestDataFactory.createTestCommunity(owner.id);
		await TestDataFactory.createGlobalMessageTemplate({
			name: 'Bienvenida Global',
			type: 'WALKER_WELCOME',
			message: 'GLOBAL VERSION',
			isActive: true,
		});

		const ds = TestDataFactory.getDataSource();
		// Pre-existing community-scoped template with the same type
		await ds.query(
			`INSERT INTO message_templates (id, name, type, scope, message, communityId, retreatId, createdAt, updatedAt)
			 VALUES ('pre-existing-id', 'Custom Bienvenida', 'WALKER_WELCOME', 'community', 'CUSTOM CONTENT', ?, NULL, datetime('now'), datetime('now'))`,
			[community.id],
		);

		const queryRunner = ds.createQueryRunner();
		await migration.up(queryRunner);
		await queryRunner.release();

		const rows = await ds.query(
			`SELECT id, message FROM message_templates WHERE scope='community' AND type='WALKER_WELCOME'`,
		);
		expect(rows.length).toBe(1); // no duplicó
		expect(rows[0].id).toBe('pre-existing-id');
		expect(rows[0].message).toBe('CUSTOM CONTENT'); // preservó el custom
	});

	it('sin comunidades, no inserta nada', async () => {
		await TestDataFactory.createGlobalMessageTemplate({
			name: 'Solo global',
			type: 'GENERAL',
			isActive: true,
		});

		const ds = TestDataFactory.getDataSource();
		const queryRunner = ds.createQueryRunner();
		await migration.up(queryRunner);
		await queryRunner.release();

		const stats = await getMigrationStats();
		expect(stats.community ?? 0).toBe(0);
	});
});
