/**
 * Functional test para AddPalancaDefinitionTemplate20260913190000.
 *
 * Verifica:
 *   - El recreate de global_message_templates preserva las filas existentes.
 *   - El CHECK de la tabla rechazaba PALANCA_DEFINITION antes del up() y lo
 *     acepta después (el DDL de sqlite_master contiene el tipo).
 *   - El seed de "Definición de Palanca" entra una sola vez aunque up() corra
 *     dos veces, y lleva el texto del equipo de palancas.
 *   - El backfill flipea la PALANCA_REQUEST duplicada MÁS NUEVA solo en
 *     retiros no terminados: la original queda intacta y los retiros ya
 *     terminados no se tocan.
 *   - Un retiro con una sola PALANCA_REQUEST no se toca.
 *   - down() revierte seed + backfill y devuelve el CHECK viejo.
 */
import { setupTestDatabase, teardownTestDatabase, clearTestData } from '../test-setup';
import { TestDataFactory } from '../test-utils/testDataFactory';

describe('AddPalancaDefinitionTemplate20260913190000', () => {
	let migration: any;

	beforeAll(async () => {
		await setupTestDatabase();
		const mod = await import(
			'@/migrations/sqlite/20260913190000_AddPalancaDefinitionTemplate'
		);
		migration = new mod.AddPalancaDefinitionTemplate20260913190000();
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

	const insertGlobal = async (ds: any, id: string, type: string, message: string) => {
		await ds.query(
			`INSERT INTO global_message_templates (id, name, type, message, isActive, createdAt, updatedAt)
			 VALUES (?, ?, ?, ?, 1, datetime('now'), datetime('now'))`,
			[id, `tpl-${id}`, type, message],
		);
	};

	const insertRetreatTemplate = async (
		ds: any,
		id: string,
		retreatId: string,
		type: string,
		createdAt: string,
	) => {
		await ds.query(
			`INSERT INTO message_templates (id, name, type, scope, message, retreatId, createdAt, updatedAt)
			 VALUES (?, ?, ?, 'retreat', ?, ?, ?, ?)`,
			[id, `tpl-${id}`, type, `mensaje de ${id}`, retreatId, createdAt, createdAt],
		);
	};

	const typeOf = async (ds: any, id: string): Promise<string> =>
		(await ds.query(`SELECT type FROM message_templates WHERE id = ?`, [id]))[0].type;

	const runUp = async () => {
		const ds = TestDataFactory.getDataSource();
		const qr = ds.createQueryRunner();
		await migration.up(qr);
		await qr.release();
	};

	it('preserva las filas existentes de global_message_templates', async () => {
		const ds = TestDataFactory.getDataSource();
		await insertGlobal(ds, 'g1', 'PALANCA_REQUEST', 'texto de la solicitud');
		await insertGlobal(ds, 'g2', 'WALKER_WELCOME', 'texto de bienvenida');

		await runUp();

		const rows = await ds.query(
			`SELECT id, name, type, message FROM global_message_templates WHERE id IN ('g1', 'g2') ORDER BY id`,
		);
		expect(rows).toHaveLength(2);
		expect(rows[0]).toMatchObject({ id: 'g1', type: 'PALANCA_REQUEST', message: 'texto de la solicitud' });
		expect(rows[1]).toMatchObject({ id: 'g2', type: 'WALKER_WELCOME', message: 'texto de bienvenida' });
	});

	it('el CHECK rechazaba PALANCA_DEFINITION antes del up() y lo acepta después', async () => {
		const ds = TestDataFactory.getDataSource();
		// Recrear la tabla como está en prod: mismo esquema de columnas con un
		// CHECK que NO incluye PALANCA_DEFINITION. No hace falta la lista
		// completa de 37 tipos — basta con que sea restrictivo.
		await ds.query(`DROP TABLE IF EXISTS global_message_templates`);
		await ds.query(`
			CREATE TABLE global_message_templates (
				"id" VARCHAR(36) PRIMARY KEY NOT NULL,
				"name" VARCHAR(255) NOT NULL,
				"type" VARCHAR(255) NOT NULL CHECK ("type" IN ('PALANCA_REQUEST', 'PALANCA_REMINDER', 'GENERAL')),
				"message" TEXT NOT NULL,
				"isActive" BOOLEAN NOT NULL DEFAULT (1),
				"createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
				"updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
			)
		`);
		await insertGlobal(ds, 'g1', 'PALANCA_REQUEST', 'texto viejo');

		await expect(
			ds.query(
				`INSERT INTO global_message_templates (id, name, type, message) VALUES ('bad', 'bad', 'PALANCA_DEFINITION', 'x')`,
			),
		).rejects.toThrow(/CHECK/i);

		await runUp();

		// El DDL recreado por la migración contiene el tipo nuevo.
		const ddl = await ds.query(
			`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'global_message_templates'`,
		);
		expect(ddl[0].sql).toContain('PALANCA_DEFINITION');

		// Y el insert que antes reventaba ahora pasa.
		await ds.query(
			`INSERT INTO global_message_templates (id, name, type, message) VALUES ('ok', 'ok', 'PALANCA_DEFINITION', 'x')`,
		);
		const cnt = await ds.query(
			`SELECT COUNT(*) AS c FROM global_message_templates WHERE type = 'PALANCA_DEFINITION'`,
		);
		expect(cnt[0].c).toBeGreaterThanOrEqual(1);
	});

	it('siembra "Definición de Palanca" una sola vez aunque up() corra dos veces', async () => {
		const ds = TestDataFactory.getDataSource();
		await runUp();
		await runUp();

		const seeds = await ds.query(
			`SELECT name, type, message, isActive FROM global_message_templates WHERE type = 'PALANCA_DEFINITION' AND name = 'Definición de Palanca'`,
		);
		expect(seeds).toHaveLength(1);
		expect(seeds[0].isActive).toBe(1);
		// Fragmento distintivo del texto del equipo de palancas (verbatim).
		expect(seeds[0].message).toContain('Nosotros le llamamos ¨Palancas.¨');
		expect(seeds[0].message).toContain('{participant.palanqueroName}');
	});

	it('backfill: flipea el duplicado más nuevo solo en retiros no terminados', async () => {
		const ds = TestDataFactory.getDataSource();

		const vigente = await TestDataFactory.createTestRetreat();
		await ds.query(`UPDATE retreat SET endDate = ? WHERE id = ?`, ['2027-01-01 00:00:00', vigente.id]);
		await insertRetreatTemplate(ds, 'bd-old', vigente.id, 'PALANCA_REQUEST', '2026-07-16 12:00:00');
		await insertRetreatTemplate(ds, 'bd-new', vigente.id, 'PALANCA_REQUEST', '2026-09-13 17:53:00');

		const terminado = await TestDataFactory.createTestRetreat();
		await ds.query(`UPDATE retreat SET endDate = ? WHERE id = ?`, ['2026-04-30 00:00:00', terminado.id]);
		await insertRetreatTemplate(ds, 'sj-old', terminado.id, 'PALANCA_REQUEST', '2026-02-01 12:00:00');
		await insertRetreatTemplate(ds, 'sj-new', terminado.id, 'PALANCA_REQUEST', '2026-03-01 12:00:00');

		const unica = await TestDataFactory.createTestRetreat();
		await ds.query(`UPDATE retreat SET endDate = ? WHERE id = ?`, ['2027-02-01 00:00:00', unica.id]);
		await insertRetreatTemplate(ds, 'solo', unica.id, 'PALANCA_REQUEST', '2026-08-01 12:00:00');

		await runUp();

		// Retiro vigente: la más nueva se flipea, la original queda.
		expect(await typeOf(ds, 'bd-new')).toBe('PALANCA_DEFINITION');
		expect(await typeOf(ds, 'bd-old')).toBe('PALANCA_REQUEST');
		// Retiro terminado: no se toca.
		expect(await typeOf(ds, 'sj-old')).toBe('PALANCA_REQUEST');
		expect(await typeOf(ds, 'sj-new')).toBe('PALANCA_REQUEST');
		// Retiro con una sola PALANCA_REQUEST: no se toca.
		expect(await typeOf(ds, 'solo')).toBe('PALANCA_REQUEST');

		// Idempotente: el segundo up() no encuentra nada que voltear.
		await runUp();
		expect(await typeOf(ds, 'bd-new')).toBe('PALANCA_DEFINITION');
		expect(await typeOf(ds, 'bd-old')).toBe('PALANCA_REQUEST');
	});

	it('down() revierte seed, backfill y CHECK', async () => {
		const ds = TestDataFactory.getDataSource();
		const vigente = await TestDataFactory.createTestRetreat();
		await ds.query(`UPDATE retreat SET endDate = ? WHERE id = ?`, ['2027-01-01 00:00:00', vigente.id]);
		await insertRetreatTemplate(ds, 'bd-old', vigente.id, 'PALANCA_REQUEST', '2026-07-16 12:00:00');
		await insertRetreatTemplate(ds, 'bd-new', vigente.id, 'PALANCA_REQUEST', '2026-09-13 17:53:00');

		const qr = ds.createQueryRunner();
		await migration.up(qr);
		await migration.down(qr);
		await qr.release();

		expect(await typeOf(ds, 'bd-new')).toBe('PALANCA_REQUEST');
		expect(await typeOf(ds, 'bd-old')).toBe('PALANCA_REQUEST');
		const seeds = await ds.query(
			`SELECT COUNT(*) AS c FROM global_message_templates WHERE type = 'PALANCA_DEFINITION'`,
		);
		expect(seeds[0].c).toBe(0);
	});
});
