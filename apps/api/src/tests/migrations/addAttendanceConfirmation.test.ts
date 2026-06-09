/**
 * Functional test para AddAttendanceConfirmationToRetreatParticipant20260609120000.
 *
 * Verifica:
 *   - up() agrega la columna `attendanceConfirmation` con default 'pending' en las
 *     filas existentes.
 *   - se puede escribir 'confirmed' / 'declined' y persiste.
 *   - down() elimina la columna (DROP COLUMN).
 */
import { setupTestDatabase, teardownTestDatabase, clearTestData } from '../test-setup';
import { TestDataFactory } from '../test-utils/testDataFactory';

describe('AddAttendanceConfirmationToRetreatParticipant20260609120000', () => {
	let migration: any;

	beforeAll(async () => {
		await setupTestDatabase();
		const mod = await import(
			'@/migrations/sqlite/20260609120000_AddAttendanceConfirmationToRetreatParticipant'
		);
		migration = new mod.AddAttendanceConfirmationToRetreatParticipant20260609120000();
	});

	afterAll(async () => {
		await teardownTestDatabase();
	});

	beforeEach(async () => {
		await clearTestData();
	});

	const columnExists = async (ds: any): Promise<boolean> => {
		const cols = await ds.query(`PRAGMA table_info(retreat_participants)`);
		return cols.some((c: any) => c.name === 'attendanceConfirmation');
	};

	it('la columna ya existe (la creó setupTestDatabase) con default pending', async () => {
		const ds = TestDataFactory.getDataSource();
		expect(await columnExists(ds)).toBe(true);

		// Una fila nueva (creada por el factory) cae en 'pending'.
		const retreat = await TestDataFactory.createTestRetreat();
		await TestDataFactory.createTestParticipant(retreat.id, { firstName: 'Walk', lastName: 'Er' });
		const rows = await ds.query(
			`SELECT attendanceConfirmation FROM retreat_participants LIMIT 1`,
		);
		expect(rows[0].attendanceConfirmation).toBe('pending');
	});

	it('acepta confirmed / declined y persiste', async () => {
		const ds = TestDataFactory.getDataSource();
		const retreat = await TestDataFactory.createTestRetreat();
		await TestDataFactory.createTestParticipant(retreat.id, { firstName: 'Conf', lastName: 'Irm' });
		await ds.query(`UPDATE retreat_participants SET attendanceConfirmation = 'confirmed'`);
		let rows = await ds.query(`SELECT attendanceConfirmation FROM retreat_participants LIMIT 1`);
		expect(rows[0].attendanceConfirmation).toBe('confirmed');
		await ds.query(`UPDATE retreat_participants SET attendanceConfirmation = 'declined'`);
		rows = await ds.query(`SELECT attendanceConfirmation FROM retreat_participants LIMIT 1`);
		expect(rows[0].attendanceConfirmation).toBe('declined');
	});

	it('down() elimina la columna y up() la vuelve a crear', async () => {
		const ds = TestDataFactory.getDataSource();
		const qr = ds.createQueryRunner();
		await migration.down(qr);
		expect(await columnExists(ds)).toBe(false);
		await migration.up(qr);
		expect(await columnExists(ds)).toBe(true);
		await qr.release();
	});
});
