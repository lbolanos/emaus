import { setupTestDatabase, teardownTestDatabase, clearTestData } from '../test-setup';
import { TestDataFactory } from '../test-utils/testDataFactory';
import { AppDataSource } from '@/data-source';
import { Payment } from '@/entities/payment.entity';
import { AddPaymentReceiptPhoto20261105120000 } from '@/migrations/sqlite/20261105120000_AddPaymentReceiptPhoto';

/**
 * Seed-and-verify for the payment receipt columns. The test DB uses
 * `synchronize` from the entities, so the columns already exist here — the
 * guards make `up()` a functional no-op that must still run clean, and
 * `down()`/`up()` prove the real ALTER TABLEs round-trip.
 */
describe('AddPaymentReceiptPhoto20261105120000 — receipt columns on payments', () => {
	beforeAll(async () => {
		await setupTestDatabase();
	});
	afterAll(async () => {
		await teardownTestDatabase();
	});
	beforeEach(async () => {
		await clearTestData();
	});

	const seedPayment = async () => {
		const retreat = await TestDataFactory.createTestRetreat({});
		const participant = await TestDataFactory.createTestParticipant(retreat.id);
		const repo = AppDataSource.getRepository(Payment);
		const payment = repo.create({
			participantId: participant.id,
			retreatId: retreat.id,
			amount: 100,
			paymentDate: new Date('2026-06-01'),
			paymentMethod: 'cash',
		});
		await repo.insert(payment);
		return payment.id;
	};

	it('up() is idempotent when the columns already exist (entity-synchronized schema)', async () => {
		const migration = new AddPaymentReceiptPhoto20261105120000();
		const qr = AppDataSource.createQueryRunner();

		await migration.up(qr);
		await migration.up(qr); // must not die with "duplicate column name"

		const columns: { name: string }[] = await qr.query(`PRAGMA table_info("payments")`);
		expect(columns.some((c) => c.name === 'receiptUrl')).toBe(true);
		expect(columns.some((c) => c.name === 'receiptS3Key')).toBe(true);

		await qr.release();
	});

	it('keeps existing payment rows intact through up() and a down()+up() round-trip', async () => {
		const paymentId = await seedPayment();

		const migration = new AddPaymentReceiptPhoto20261105120000();
		const qr = AppDataSource.createQueryRunner();

		const countOfPayments = async () => {
			const rows = await qr.query(`SELECT COUNT(*) AS c FROM "payments"`);
			return Number(rows[0].c);
		};
		const before = await countOfPayments();
		expect(before).toBeGreaterThanOrEqual(1);

		await migration.up(qr);
		// New columns are nullable: seeded rows survive with NULL receipt.
		expect(await countOfPayments()).toBe(before);
		const receipts = await qr.query(`SELECT receiptUrl, receiptS3Key FROM "payments"`);
		expect(receipts.every((r: any) => r.receiptUrl === null && r.receiptS3Key === null)).toBe(
			true,
		);

		await migration.down(qr);
		let columns: { name: string }[] = await qr.query(`PRAGMA table_info("payments")`);
		expect(columns.some((c) => c.name === 'receiptUrl')).toBe(false);
		expect(columns.some((c) => c.name === 'receiptS3Key')).toBe(false);
		// Rows survive the DROP COLUMN too.
		expect(await countOfPayments()).toBe(before);
		expect(await qr.query(`SELECT id FROM "payments" WHERE id = '${paymentId}'`)).toHaveLength(
			1,
		);

		await migration.up(qr);
		columns = await qr.query(`PRAGMA table_info("payments")`);
		expect(columns.some((c) => c.name === 'receiptUrl')).toBe(true);
		expect(columns.some((c) => c.name === 'receiptS3Key')).toBe(true);
		expect(await countOfPayments()).toBe(before);

		await qr.release();
	});
});
