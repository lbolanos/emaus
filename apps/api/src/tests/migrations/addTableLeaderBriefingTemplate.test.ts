/**
 * Functional test for AddTableLeaderBriefingTemplate20260608120000.
 *
 * Verifies:
 *   - Siembra 1 plantilla global TABLE_LEADER_BRIEFING.
 *   - Copia la plantilla a cada retiro existente (scope='retreat').
 *   - Es idempotente: correr dos veces no duplica.
 *   - El CHECK ampliado de global_message_templates acepta el tipo nuevo.
 */
import { setupTestDatabase, teardownTestDatabase, clearTestData } from '../test-setup';
import { TestDataFactory } from '../test-utils/testDataFactory';

describe('AddTableLeaderBriefingTemplate20260608120000', () => {
	let migration: any;
	const TYPE = 'TABLE_LEADER_BRIEFING';
	const TYPES = ['TABLE_LEADER_BRIEFING', 'WALKER_CONFIRMATION'];
	const inList = TYPES.map((t) => `'${t}'`).join(',');

	beforeAll(async () => {
		await setupTestDatabase();
		const mod = await import(
			'@/migrations/sqlite/20260608120000_AddTableLeaderBriefingTemplate'
		);
		migration = new mod.AddTableLeaderBriefingTemplate20260608120000();
	});

	afterAll(async () => {
		await teardownTestDatabase();
	});

	beforeEach(async () => {
		await clearTestData();
		const ds = TestDataFactory.getDataSource();
		await ds.query(`DELETE FROM message_templates`);
		await ds.query(`DELETE FROM global_message_templates`);
	});

	it('siembra ambas globales y las copia a cada retiro existente', async () => {
		const ds = TestDataFactory.getDataSource();
		await TestDataFactory.createTestRetreat();
		await TestDataFactory.createTestRetreat();

		const queryRunner = ds.createQueryRunner();
		await migration.up(queryRunner);
		await queryRunner.release();

		// 2 tipos globales (briefing + confirmación).
		const globals = await ds.query(
			`SELECT COUNT(*) AS n FROM global_message_templates WHERE type IN (${inList})`,
		);
		expect(Number(globals[0].n)).toBe(2);

		// 2 tipos × 2 retiros = 4 plantillas de retiro.
		const perRetreat = await ds.query(
			`SELECT COUNT(*) AS n FROM message_templates WHERE type IN (${inList}) AND scope = 'retreat'`,
		);
		expect(Number(perRetreat[0].n)).toBe(4);

		// La confirmación lleva variables de retiro.
		const conf = await ds.query(
			`SELECT message FROM global_message_templates WHERE type = 'WALKER_CONFIRMATION'`,
		);
		expect(conf[0].message).toContain('{retreat.walkerArrivalTime}');
		expect(conf[0].message).toContain('{participant.firstName}');
	});

	it('es idempotente — correr dos veces no duplica', async () => {
		const ds = TestDataFactory.getDataSource();
		await TestDataFactory.createTestRetreat();

		const queryRunner = ds.createQueryRunner();
		await migration.up(queryRunner);
		await migration.up(queryRunner);
		await queryRunner.release();

		const globals = await ds.query(
			`SELECT COUNT(*) AS n FROM global_message_templates WHERE type IN (${inList})`,
		);
		const perRetreat = await ds.query(
			`SELECT COUNT(*) AS n FROM message_templates WHERE type IN (${inList}) AND scope = 'retreat'`,
		);
		expect(Number(globals[0].n)).toBe(2);
		expect(Number(perRetreat[0].n)).toBe(2);
	});

	it('down() limpia ambas tablas y revierte el CHECK', async () => {
		const ds = TestDataFactory.getDataSource();
		await TestDataFactory.createTestRetreat();

		const queryRunner = ds.createQueryRunner();
		await migration.up(queryRunner);
		await migration.down(queryRunner);
		await queryRunner.release();

		const globals = await ds.query(
			`SELECT COUNT(*) AS n FROM global_message_templates WHERE type IN (${inList})`,
		);
		const perRetreat = await ds.query(
			`SELECT COUNT(*) AS n FROM message_templates WHERE type IN (${inList})`,
		);
		expect(Number(globals[0].n)).toBe(0);
		expect(Number(perRetreat[0].n)).toBe(0);

		const schema = await ds.query(
			`SELECT sql FROM sqlite_master WHERE type='table' AND name='global_message_templates'`,
		);
		expect(schema[0].sql).not.toContain(TYPE);
		expect(schema[0].sql).not.toContain('WALKER_CONFIRMATION');
	});
});
