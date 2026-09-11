import { setupTestDatabase, teardownTestDatabase, clearTestData } from '../test-setup';
import { TestDataFactory } from '../test-utils/testDataFactory';
import { AppDataSource } from '@/data-source';
import { ServerShirtPricingAndConfirmation20260910120000 } from '@/migrations/sqlite/20260910120000_ServerShirtPricingAndConfirmation';

/**
 * Seed-and-verify for the shirt-price + server confirmation-sequence
 * migration. The test DB uses `synchronize` (the entities already declare
 * `retreat_shirt_type.price` and the 2 new template types), so the
 * `ADD COLUMN` and the CHECK recreate are functional no-ops here — what
 * matters is that `up()` runs clean against that schema and seeds the
 * sequence + templates, and that `down()` reverts it.
 */
describe('ServerShirtPricingAndConfirmation — shirt price + confirmation sequence', () => {
	beforeAll(async () => {
		await setupTestDatabase();
	});
	afterAll(async () => {
		await teardownTestDatabase();
	});
	beforeEach(async () => {
		await clearTestData();
	});

	it('seeds the 2-step sequence (21/7 days, whatsapp, server audience)', async () => {
		const migration = new ServerShirtPricingAndConfirmation20260910120000();
		const qr = AppDataSource.createQueryRunner();

		await migration.up(qr);

		const seqs = await qr.query(
			`SELECT name, trigger, audience, isActive FROM global_message_sequences WHERE name = 'Confirmación de camisetas (servidores)'`,
		);
		expect(seqs).toHaveLength(1);
		expect(seqs[0].trigger).toBe('days_before_retreat');
		expect(seqs[0].audience).toBe('server');
		expect(Number(seqs[0].isActive)).toBe(1);

		const steps = await qr.query(
			`SELECT stepOrder, offsetDays, sendHour, templateType, channel, recipientTarget
			 FROM global_sequence_steps st
			 JOIN global_message_sequences s ON s.id = st.sequenceId
			 WHERE s.name = 'Confirmación de camisetas (servidores)'
			 ORDER BY stepOrder`,
		);
		expect(steps).toHaveLength(2);
		expect(steps[0]).toMatchObject({
			stepOrder: 0,
			offsetDays: 21,
			sendHour: 9,
			templateType: 'SERVER_SHIRT_CONFIRMATION',
			channel: 'whatsapp',
			recipientTarget: 'participant',
		});
		expect(steps[1]).toMatchObject({
			stepOrder: 1,
			offsetDays: 7,
			sendHour: 9,
			templateType: 'SERVER_SHIRT_CONFIRMATION_REMINDER',
			channel: 'whatsapp',
			recipientTarget: 'participant',
		});

		await qr.release();
	});

	it('seeds the 2 global templates with the expected text', async () => {
		const migration = new ServerShirtPricingAndConfirmation20260910120000();
		const qr = AppDataSource.createQueryRunner();

		await migration.up(qr);

		const templates = await qr.query(
			`SELECT type, message FROM global_message_templates WHERE type IN ('SERVER_SHIRT_CONFIRMATION', 'SERVER_SHIRT_CONFIRMATION_REMINDER') ORDER BY type`,
		);
		expect(templates).toHaveLength(2);
		const notice = templates.find((t: any) => t.type === 'SERVER_SHIRT_CONFIRMATION');
		const reminder = templates.find((t: any) => t.type === 'SERVER_SHIRT_CONFIRMATION_REMINDER');
		expect(notice.message).toContain('{participant.shirtOrderSummary}');
		expect(notice.message).toContain('{participant.shirtCharge}');
		// The balance line: the server should see the combined amount due
		// (fee + meals + garments - payments) in the same message.
		expect(notice.message).toContain('{participant.paymentRemaining}');
		expect(reminder.message).toContain('{participant.shirtOrderSummary}');
		expect(reminder.message).toContain('{participant.shirtCharge}');
		expect(reminder.message).toContain('{participant.paymentRemaining}');

		await qr.release();
	});

	it('copies the templates to every EXISTING retreat when the migration runs', async () => {
		const retreatBefore = await TestDataFactory.createTestRetreat({});

		const migration = new ServerShirtPricingAndConfirmation20260910120000();
		const qr = AppDataSource.createQueryRunner();
		await migration.up(qr);

		const perRetreat = await qr.query(
			`SELECT type FROM message_templates WHERE retreatId = ? AND type IN ('SERVER_SHIRT_CONFIRMATION', 'SERVER_SHIRT_CONFIRMATION_REMINDER')`,
			[retreatBefore.id],
		);
		expect(perRetreat).toHaveLength(2);

		await qr.release();
	});

	it('the price ALTER TABLE is idempotent: PRAGMA table_info still reports the column after 2 runs', async () => {
		const migration = new ServerShirtPricingAndConfirmation20260910120000();
		const qr = AppDataSource.createQueryRunner();

		await migration.up(qr);
		await migration.up(qr); // second run must not break with "duplicate column name"

		const columns: { name: string }[] = await qr.query(`PRAGMA table_info("retreat_shirt_type")`);
		expect(columns.some((c) => c.name === 'price')).toBe(true);

		await qr.release();
	});

	it('re-running up() does not duplicate the sequence or its steps (INSERT OR IGNORE)', async () => {
		const migration = new ServerShirtPricingAndConfirmation20260910120000();
		const qr = AppDataSource.createQueryRunner();

		await migration.up(qr);
		await migration.up(qr);

		const seqs = await qr.query(
			`SELECT COUNT(*) AS c FROM global_message_sequences WHERE name = 'Confirmación de camisetas (servidores)'`,
		);
		expect(Number(seqs[0].c)).toBe(1);

		const steps = await qr.query(
			`SELECT COUNT(*) AS c FROM global_sequence_steps st
			 JOIN global_message_sequences s ON s.id = st.sequenceId
			 WHERE s.name = 'Confirmación de camisetas (servidores)'`,
		);
		expect(Number(steps[0].c)).toBe(2);

		await qr.release();
	});

	it('down() reverts: deletes the seeded sequence, steps and templates (leaves the ones the coordinator edited)', async () => {
		const retreat = await TestDataFactory.createTestRetreat({});

		const migration = new ServerShirtPricingAndConfirmation20260910120000();
		const qr = AppDataSource.createQueryRunner();
		await migration.up(qr);

		// The coordinator edited the per-retreat notice template: down() must not
		// touch it — it only deletes the ones that still hold the exact seeded text.
		await qr.query(
			`UPDATE message_templates SET message = 'Texto editado por el coordinador' WHERE retreatId = ? AND type = 'SERVER_SHIRT_CONFIRMATION'`,
			[retreat.id],
		);

		await migration.down(qr);

		const seqs = await qr.query(
			`SELECT COUNT(*) AS c FROM global_message_sequences WHERE name = 'Confirmación de camisetas (servidores)'`,
		);
		expect(Number(seqs[0].c)).toBe(0);

		const steps = await qr.query(`SELECT COUNT(*) AS c FROM global_sequence_steps`);
		expect(Number(steps[0].c)).toBe(0);

		const globalTemplates = await qr.query(
			`SELECT COUNT(*) AS c FROM global_message_templates WHERE type IN ('SERVER_SHIRT_CONFIRMATION', 'SERVER_SHIRT_CONFIRMATION_REMINDER')`,
		);
		expect(Number(globalTemplates[0].c)).toBe(0);

		// The unedited reminder was deleted; the edited notice survives.
		const perRetreat = await qr.query(
			`SELECT type, message FROM message_templates WHERE retreatId = ? AND type IN ('SERVER_SHIRT_CONFIRMATION', 'SERVER_SHIRT_CONFIRMATION_REMINDER')`,
			[retreat.id],
		);
		expect(perRetreat).toHaveLength(1);
		expect(perRetreat[0].type).toBe('SERVER_SHIRT_CONFIRMATION');
		expect(perRetreat[0].message).toBe('Texto editado por el coordinador');

		await qr.release();
	});
});
