/**
 * AddDocumentsToServerAssignmentsBriefing20261019130000 (specs/assignment-documents, D6):
 * the documents block reaches the global template and every per-retreat copy
 * that still has the original seed; an edited copy keeps its text.
 */
import { setupTestDatabase, teardownTestDatabase, clearTestData } from '../test-setup';
import { TestDataFactory } from '../test-utils/testDataFactory';
import { AddServerAssignmentsBriefingTemplate20261015130000 } from '@/migrations/sqlite/20261015130000_AddServerAssignmentsBriefingTemplate';
import { AddDocumentsToServerAssignmentsBriefing20261019130000 as AddDocuments } from '@/migrations/sqlite/20261019130000_AddDocumentsToServerAssignmentsBriefing';

describe('AddDocumentsToServerAssignmentsBriefing20261019130000', () => {
	const TYPE = 'SERVER_ASSIGNMENTS_BRIEFING';

	beforeAll(async () => {
		await setupTestDatabase();
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

	it('updates unedited rows, keeps edited ones, is idempotent and reversible', async () => {
		const ds = TestDataFactory.getDataSource();
		const editedRetreat = await TestDataFactory.createTestRetreat();
		await TestDataFactory.createTestRetreat();
		const qr = ds.createQueryRunner();
		try {
			// The state in prod: the original seed, global + one copy per retreat.
			await new AddServerAssignmentsBriefingTemplate20261015130000().up(qr);
			await qr.query(`UPDATE message_templates SET message = ? WHERE type = ? AND retreatId = ?`, [
				'Texto propio del retiro',
				TYPE,
				editedRetreat.id,
			]);
			// The old seed constant must be byte-identical to what was seeded.
			const [global] = await qr.query(`SELECT message FROM global_message_templates WHERE type = ?`, [TYPE]);
			expect(global.message).toBe(AddDocuments.OLD_MESSAGE);

			const migration = new AddDocuments();
			await migration.up(qr);
			await migration.up(qr); // idempotent

			const messages = async () =>
				(await qr.query(
					`SELECT 'global' AS scope, message FROM global_message_templates WHERE type = ?
					 UNION ALL
					 SELECT COALESCE(retreatId, ''), message FROM message_templates WHERE type = ?`,
					[TYPE, TYPE],
				)) as Array<{ scope: string; message: string }>;

			const afterUp = await messages();
			expect(afterUp).toHaveLength(3);
			for (const row of afterUp) {
				if (row.scope === editedRetreat.id) expect(row.message).toBe('Texto propio del retiro');
				else {
					expect(row.message).toBe(AddDocuments.NEW_MESSAGE);
					expect(row.message).toContain('{assignments.documentsRoster}');
				}
			}

			await migration.down(qr);
			const afterDown = await messages();
			for (const row of afterDown) {
				if (row.scope === editedRetreat.id) expect(row.message).toBe('Texto propio del retiro');
				else expect(row.message).toBe(AddDocuments.OLD_MESSAGE);
			}
		} finally {
			await qr.release();
		}
	});
});
