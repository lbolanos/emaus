/**
 * Functional test para AddRecipientMetaToParticipantCommunication20260609130000.
 * Verifica: columnas nullable agregadas, aceptan valores, down() las elimina.
 */
import { setupTestDatabase, teardownTestDatabase, clearTestData } from '../test-setup';
import { TestDataFactory } from '../test-utils/testDataFactory';

describe('AddRecipientMetaToParticipantCommunication20260609130000', () => {
	let migration: any;

	beforeAll(async () => {
		await setupTestDatabase();
		const mod = await import(
			'@/migrations/sqlite/20260609130000_AddRecipientMetaToParticipantCommunication'
		);
		migration = new mod.AddRecipientMetaToParticipantCommunication20260609130000();
	});

	afterAll(async () => {
		await teardownTestDatabase();
	});

	beforeEach(async () => {
		await clearTestData();
	});

	const cols = async (ds: any): Promise<string[]> =>
		(await ds.query(`PRAGMA table_info(participant_communications)`)).map((c: any) => c.name);

	it('las columnas existen (recipientContactKey / recipientName / audience)', async () => {
		const ds = TestDataFactory.getDataSource();
		const names = await cols(ds);
		expect(names).toEqual(
			expect.arrayContaining(['recipientContactKey', 'recipientName', 'audience']),
		);
	});

	it('down() elimina las columnas y up() las recrea', async () => {
		const ds = TestDataFactory.getDataSource();
		const qr = ds.createQueryRunner();
		await migration.down(qr);
		let names = await cols(ds);
		expect(names).not.toContain('audience');
		expect(names).not.toContain('recipientName');
		expect(names).not.toContain('recipientContactKey');
		await migration.up(qr);
		names = await cols(ds);
		expect(names).toEqual(
			expect.arrayContaining(['recipientContactKey', 'recipientName', 'audience']),
		);
		await qr.release();
	});
});
