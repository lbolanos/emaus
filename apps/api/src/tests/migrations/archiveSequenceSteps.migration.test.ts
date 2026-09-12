/**
 * Test funcional de la migración ArchiveSequenceSteps (M5-B4).
 *
 * El schema lo crea `synchronize` (la columna ya está en la entity), así que
 * aquí se ejercita lo único que puede romperse en producción: el guard de
 * idempotidad (re-arranque tras un `up()` parcialmente commiteado con
 * `transaction = false`) y la reversibilidad del DROP/ADD COLUMN.
 */
import { setupTestDatabase, teardownTestDatabase } from '../test-setup';
import { TestDataFactory } from '../test-utils/testDataFactory';

describe('ArchiveSequenceSteps — guard y reversibilidad', () => {
	let migration: any;
	let qr: any;

	beforeAll(async () => {
		await setupTestDatabase();
		const mod = await import(
			'@/migrations/sqlite/20260912140000_ArchiveSequenceSteps'
		);
		migration = new mod.ArchiveSequenceSteps20260912140000();
		qr = TestDataFactory.getDataSource().createQueryRunner();
	});

	afterAll(async () => {
		await qr.release();
		await teardownTestDatabase();
	});

	it('up() con la columna ya presente es no-op (re-arranque tras fallo parcial)', async () => {
		await expect(migration.up(qr)).resolves.toBeUndefined();
	});

	it('down() quita la columna y up() la restaura (roundtrip)', async () => {
		await migration.down(qr);
		let cols: Array<{ name: string }> = await qr.query(
			`PRAGMA table_info("sequence_steps")`,
		);
		expect(cols.some((c) => c.name === 'isArchived')).toBe(false);

		await migration.up(qr);
		cols = await qr.query(`PRAGMA table_info("sequence_steps")`);
		const col = cols.find((c) => c.name === 'isArchived');
		expect(col).toBeTruthy();
		// NOT NULL DEFAULT 0: los pasos existentes quedan vivos, no archivados.
		// (dflt_value llega como texto según el driver.)
		expect(Number(col!.notnull)).toBe(1);
		expect(String(col!.dflt_value).trim()).toBe('0');
	});
});
