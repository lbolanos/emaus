/**
 * Functional test for AddServerAssignmentsBriefingTemplate20261015130000.
 *
 * Verifies:
 *   - Siembra 1 plantilla global SERVER_ASSIGNMENTS_BRIEFING.
 *   - Copia la plantilla a cada retiro existente (scope='retreat').
 *   - El mensaje sembrado usa las variables {assignments.*} en texto plano
 *     WhatsApp (\n + *bold*), no HTML.
 *   - Es idempotente: correr dos veces no duplica.
 *   - El CHECK ampliado de global_message_templates acepta el tipo nuevo.
 *   - down() limpia ambas tablas y revierte el CHECK.
 */
import { setupTestDatabase, teardownTestDatabase, clearTestData } from '../test-setup';
import { TestDataFactory } from '../test-utils/testDataFactory';

describe('AddServerAssignmentsBriefingTemplate20261015130000', () => {
	let migration: any;
	const TYPE = 'SERVER_ASSIGNMENTS_BRIEFING';

	beforeAll(async () => {
		await setupTestDatabase();
		const mod = await import(
			'@/migrations/sqlite/20261015130000_AddServerAssignmentsBriefingTemplate'
		);
		migration = new mod.AddServerAssignmentsBriefingTemplate20261015130000();
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

	it('siembra la global y la copia a cada retiro existente', async () => {
		const ds = TestDataFactory.getDataSource();
		await TestDataFactory.createTestRetreat();
		await TestDataFactory.createTestRetreat();

		const queryRunner = ds.createQueryRunner();
		await migration.up(queryRunner);
		await queryRunner.release();

		const globals = await ds.query(
			`SELECT COUNT(*) AS n FROM global_message_templates WHERE type = ?`,
			[TYPE],
		);
		expect(Number(globals[0].n)).toBe(1);

		const perRetreat = await ds.query(
			`SELECT COUNT(*) AS n FROM message_templates WHERE type = ? AND scope = 'retreat'`,
			[TYPE],
		);
		expect(Number(perRetreat[0].n)).toBe(2);

		// El CHECK recreado acepta el tipo nuevo (el INSERT de arriba ya lo
		// demuestra; el assert del schema lo fija por si alguien toca el CHECK).
		const schema = await ds.query(
			`SELECT sql FROM sqlite_master WHERE type='table' AND name='global_message_templates'`,
		);
		expect(schema[0].sql).toContain(TYPE);
	});

	it('el mensaje sembrado usa {assignments.*} en sintaxis WhatsApp, no HTML', async () => {
		const ds = TestDataFactory.getDataSource();

		const queryRunner = ds.createQueryRunner();
		await migration.up(queryRunner);
		await queryRunner.release();

		const rows = await ds.query(
			`SELECT message FROM global_message_templates WHERE type = ?`,
			[TYPE],
		);
		const message = rows[0].message;
		expect(message).toContain('{participant.firstName}');
		expect(message).toContain('{retreat.parish}');
		expect(message).toContain('{assignments.responsibilitiesCount}');
		expect(message).toContain('{assignments.responsibilitiesRoster}');
		expect(message).toContain('{assignments.teamsCount}');
		expect(message).toContain('{assignments.teamsRoster}');
		// Texto plano WhatsApp: saltos de línea reales + énfasis con *; nada de
		// HTML (desde 20260914 el motor de secuencias manda el texto crudo).
		expect(message).toContain('\n');
		expect(message).toContain('*Tus responsabilidades');
		expect(message).not.toContain('<');
	});

	it('es idempotente — correr dos veces no duplica', async () => {
		const ds = TestDataFactory.getDataSource();
		await TestDataFactory.createTestRetreat();

		const queryRunner = ds.createQueryRunner();
		await migration.up(queryRunner);
		await migration.up(queryRunner);
		await queryRunner.release();

		const globals = await ds.query(
			`SELECT COUNT(*) AS n FROM global_message_templates WHERE type = ?`,
			[TYPE],
		);
		const perRetreat = await ds.query(
			`SELECT COUNT(*) AS n FROM message_templates WHERE type = ? AND scope = 'retreat'`,
			[TYPE],
		);
		expect(Number(globals[0].n)).toBe(1);
		expect(Number(perRetreat[0].n)).toBe(1);
	});

	it('down() limpia ambas tablas y revierte el CHECK', async () => {
		const ds = TestDataFactory.getDataSource();
		await TestDataFactory.createTestRetreat();

		const queryRunner = ds.createQueryRunner();
		await migration.up(queryRunner);
		await migration.down(queryRunner);
		await queryRunner.release();

		const globals = await ds.query(
			`SELECT COUNT(*) AS n FROM global_message_templates WHERE type = ?`,
			[TYPE],
		);
		const perRetreat = await ds.query(
			`SELECT COUNT(*) AS n FROM message_templates WHERE type = ?`,
			[TYPE],
		);
		expect(Number(globals[0].n)).toBe(0);
		expect(Number(perRetreat[0].n)).toBe(0);

		const schema = await ds.query(
			`SELECT sql FROM sqlite_master WHERE type='table' AND name='global_message_templates'`,
		);
		expect(schema[0].sql).not.toContain(TYPE);
	});
});
