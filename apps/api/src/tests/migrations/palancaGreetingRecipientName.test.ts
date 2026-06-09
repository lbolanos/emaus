/**
 * Functional test para PalancaGreetingRecipientName20260609140000.
 *
 * Verifica:
 *   - up() cambia `{participant.nickname}` → `{participant.recipientName}` SOLO en
 *     plantillas PALANCA_REQUEST / PALANCA_REMINDER (global y de retiro).
 *   - No toca otros tipos (p. ej. WALKER_WELCOME).
 *   - No toca filas de palanca ya customizadas que no usan `{participant.nickname}`.
 *   - down() revierte el reemplazo.
 */
import { setupTestDatabase, teardownTestDatabase, clearTestData } from '../test-setup';
import { TestDataFactory } from '../test-utils/testDataFactory';

describe('PalancaGreetingRecipientName20260609140000', () => {
	let migration: any;

	beforeAll(async () => {
		await setupTestDatabase();
		const mod = await import(
			'@/migrations/sqlite/20260609140000_PalancaGreetingRecipientName'
		);
		migration = new mod.PalancaGreetingRecipientName20260609140000();
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

	const msgOf = async (ds: any, id: string): Promise<string> =>
		(await ds.query(`SELECT message FROM global_message_templates WHERE id = ?`, [id]))[0].message;

	it('reemplaza el saludo en PALANCA_REQUEST / PALANCA_REMINDER', async () => {
		const ds = TestDataFactory.getDataSource();
		await insertGlobal(ds, 'p1', 'PALANCA_REQUEST', 'Hola {participant.nickname}, te pido una palanca.');
		await insertGlobal(ds, 'p2', 'PALANCA_REMINDER', 'Recordatorio {participant.nickname}.');

		const qr = ds.createQueryRunner();
		await migration.up(qr);
		await qr.release();

		expect(await msgOf(ds, 'p1')).toBe('Hola {participant.recipientName}, te pido una palanca.');
		expect(await msgOf(ds, 'p2')).toBe('Recordatorio {participant.recipientName}.');
	});

	it('no toca otros tipos de plantilla', async () => {
		const ds = TestDataFactory.getDataSource();
		const original = 'Hola {participant.nickname}, bienvenido.';
		await insertGlobal(ds, 'w1', 'WALKER_WELCOME', original);

		const qr = ds.createQueryRunner();
		await migration.up(qr);
		await qr.release();

		expect(await msgOf(ds, 'w1')).toBe(original);
	});

	it('no toca palancas ya customizadas (sin {participant.nickname})', async () => {
		const ds = TestDataFactory.getDataSource();
		const custom = 'Hola {participant.emergencyContactName}, te pido una palanca.';
		await insertGlobal(ds, 'p3', 'PALANCA_REQUEST', custom);

		const qr = ds.createQueryRunner();
		await migration.up(qr);
		await qr.release();

		expect(await msgOf(ds, 'p3')).toBe(custom);
	});

	it('down() revierte recipientName → nickname en palancas', async () => {
		const ds = TestDataFactory.getDataSource();
		await insertGlobal(ds, 'p1', 'PALANCA_REQUEST', 'Hola {participant.nickname}, te pido una palanca.');

		const qr = ds.createQueryRunner();
		await migration.up(qr);
		await migration.down(qr);
		await qr.release();

		expect(await msgOf(ds, 'p1')).toBe('Hola {participant.nickname}, te pido una palanca.');
	});

	it('aplica también a plantillas de retiro (message_templates)', async () => {
		const ds = TestDataFactory.getDataSource();
		const retreat = await TestDataFactory.createTestRetreat();
		await ds.query(
			`INSERT INTO message_templates (id, name, type, scope, message, retreatId, createdAt, updatedAt)
			 VALUES (?, ?, ?, 'retreat', ?, ?, datetime('now'), datetime('now'))`,
			['rt1', 'palanca-retiro', 'PALANCA_REQUEST', 'Hola {participant.nickname}.', retreat.id],
		);

		const qr = ds.createQueryRunner();
		await migration.up(qr);
		await qr.release();

		const row = await ds.query(`SELECT message FROM message_templates WHERE id = ?`, ['rt1']);
		expect(row[0].message).toBe('Hola {participant.recipientName}.');
	});
});
