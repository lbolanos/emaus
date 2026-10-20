/**
 * Server side of the offline outbox (specs/offline-mode, M3), against the real
 * test database:
 *
 * - D7: a queued check-in / schedule start / complete keeps the device time
 *   (`occurredAt`) instead of the time it reached the server;
 * - FR-18: writes sent with an Idempotency-Key leave `occurredAt` and
 *   `syncedFromOutbox` in the audit metadata; regular writes do not;
 * - FR-15b: the no-show cancellation sent as an explicit `{ isCancelled,
 *   contextRetreatId }` body frees the walker's bed and table, as the full-record
 *   edit always did.
 */
import { setupTestDatabase, teardownTestDatabase, clearTestData } from '../test-setup';
import { TestDataFactory } from '../test-utils/testDataFactory';
import { RetreatParticipant } from '@/entities/retreatParticipant.entity';
import { RetreatBed } from '@/entities/retreatBed.entity';
import { RetreatScheduleItem } from '@/entities/retreatScheduleItem.entity';
import { DomainAuditLog } from '@/entities/domainAuditLog.entity';
import { setParticipantCheckIn, updateParticipant } from '@/services/participantService';
import { RetreatScheduleService } from '@/services/retreatScheduleService';
import { auditContext } from '@/utils/auditContext';

const getDS = () => TestDataFactory.getDataSource();

const REQUEST_ID = '0f8fad5b-d9cb-469f-a165-70867728950e';

async function awaitAuditRow(action: string, resourceId: string): Promise<DomainAuditLog> {
	const repo = getDS().getRepository(DomainAuditLog);
	for (let i = 0; i < 60; i++) {
		const found = await repo.findOne({ where: { action, resourceId } });
		if (found) return found;
		await new Promise((r) => setTimeout(r, 5));
	}
	throw new Error(`audit row not seen: ${action} for ${resourceId}`);
}

async function makeScheduleItem(retreatId: string): Promise<RetreatScheduleItem> {
	const repo = getDS().getRepository(RetreatScheduleItem);
	return repo.save(
		repo.create({
			retreatId,
			name: 'Charla de prueba',
			type: 'charla' as any,
			day: 1,
			startTime: new Date('2026-10-16T22:00:00.000Z'),
			endTime: new Date('2026-10-16T22:30:00.000Z'),
			durationMinutes: 30,
			orderInDay: 0,
			status: 'pending' as any,
		}),
	);
}

describe('offline outbox — server side (integration)', () => {
	beforeAll(async () => {
		await setupTestDatabase();
	});

	afterAll(async () => {
		await teardownTestDatabase();
	});

	beforeEach(async () => {
		await clearTestData();
		await getDS().getRepository(DomainAuditLog).clear();
	});

	describe('check-in keeps the device time (D7)', () => {
		test('occurredAt becomes checkedInAt', async () => {
			const retreat = await TestDataFactory.createTestRetreat();
			const walker = await TestDataFactory.createTestParticipant(retreat.id);
			const arrived = new Date(Date.now() - 2 * 60 * 60 * 1000);

			const result = await setParticipantCheckIn(walker.id, retreat.id, true, arrived);

			expect(result.checkedInAt?.toISOString()).toBe(arrived.toISOString());
			const rp = await getDS()
				.getRepository(RetreatParticipant)
				.findOneByOrFail({ participantId: walker.id, retreatId: retreat.id });
			expect(new Date(rp.checkedInAt as any).toISOString()).toBe(arrived.toISOString());
		});

		test('without occurredAt it stays "now", as before', async () => {
			const retreat = await TestDataFactory.createTestRetreat();
			const walker = await TestDataFactory.createTestParticipant(retreat.id);
			const before = Date.now();

			const result = await setParticipantCheckIn(walker.id, retreat.id, true);

			expect(result.checkedInAt!.getTime()).toBeGreaterThanOrEqual(before - 1000);
		});

		test('undoing the check-in clears the time even with occurredAt', async () => {
			const retreat = await TestDataFactory.createTestRetreat();
			const walker = await TestDataFactory.createTestParticipant(retreat.id);

			const result = await setParticipantCheckIn(walker.id, retreat.id, false, new Date());

			expect(result.checkedInAt).toBeNull();
		});
	});

	describe('schedule start / complete keep the device time (D7)', () => {
		test('occurredAt becomes actualStartTime and actualEndTime', async () => {
			const retreat = await TestDataFactory.createTestRetreat();
			const item = await makeScheduleItem(retreat.id);
			const started = new Date(Date.now() - 90 * 60 * 1000);
			const finished = new Date(Date.now() - 30 * 60 * 1000);
			// The exported singleton captures its repository at import time, before
			// setupTestDatabase swaps the data source; a fresh instance uses the test DB.
			const service = new RetreatScheduleService();

			await service.startItem(item.id, started);
			await service.completeItem(item.id, finished);

			const saved = await getDS().getRepository(RetreatScheduleItem).findOneByOrFail({ id: item.id });
			expect(new Date(saved.actualStartTime as any).toISOString()).toBe(started.toISOString());
			expect(new Date(saved.actualEndTime as any).toISOString()).toBe(finished.toISOString());
			expect(saved.status).toBe('completed');
		});
	});

	describe('audit metadata (FR-18)', () => {
		test('a write resent from the outbox records when it happened on the device', async () => {
			const retreat = await TestDataFactory.createTestRetreat();
			const walker = await TestDataFactory.createTestParticipant(retreat.id);
			const deviceTime = '2026-10-16T23:12:00.000Z';

			await auditContext.run(
				{ userId: null, idempotencyKey: REQUEST_ID, clientTime: deviceTime, fromOutbox: true },
				() => setParticipantCheckIn(walker.id, retreat.id, true, new Date(deviceTime)),
			);

			const audit = await awaitAuditRow('participant.checkin', walker.id);
			const meta = JSON.parse(audit.metadata ?? '{}');
			expect(meta.occurredAt).toBe(deviceTime);
			expect(meta.syncedFromOutbox).toBe(true);
		});

		test('a first attempt with signal carries the device time but is not marked as synced', async () => {
			const retreat = await TestDataFactory.createTestRetreat();
			const walker = await TestDataFactory.createTestParticipant(retreat.id);

			await auditContext.run(
				{ userId: null, idempotencyKey: REQUEST_ID, clientTime: '2026-10-16T23:12:00.000Z', fromOutbox: false },
				() => setParticipantCheckIn(walker.id, retreat.id, true),
			);

			const meta = JSON.parse((await awaitAuditRow('participant.checkin', walker.id)).metadata ?? '{}');
			expect(meta.syncedFromOutbox).toBe(false);
		});

		test('a regular write (no key) leaves the metadata untouched', async () => {
			const retreat = await TestDataFactory.createTestRetreat();
			const walker = await TestDataFactory.createTestParticipant(retreat.id);

			await auditContext.run({ userId: null }, () =>
				setParticipantCheckIn(walker.id, retreat.id, true),
			);

			const audit = await awaitAuditRow('participant.checkin', walker.id);
			expect(audit.metadata).toBeNull();
		});
	});

	describe('no-show cancellation with an explicit body (FR-15b)', () => {
		test('cancels, frees the bed and the table of that retreat, and leaves the record alone', async () => {
			const retreat = await TestDataFactory.createTestRetreat();
			const [table] = await TestDataFactory.createTestTables(retreat.id, 1);
			const walker = await TestDataFactory.createTestParticipant(retreat.id, {
				firstName: 'No',
				lastName: 'Llegó',
				tableId: table.id,
			} as any);
			const [bed] = await TestDataFactory.createTestBeds(retreat.id, retreat.houseId!, 1);
			await getDS().getRepository(RetreatBed).update(bed.id, { participantId: walker.id });

			await updateParticipant(walker.id, { isCancelled: true, contextRetreatId: retreat.id } as any);

			const rp = await getDS()
				.getRepository(RetreatParticipant)
				.findOneByOrFail({ participantId: walker.id, retreatId: retreat.id });
			expect(rp.isCancelled).toBe(true);
			expect(rp.tableId).toBeNull();
			const freed = await getDS().getRepository(RetreatBed).findOneByOrFail({ id: bed.id });
			expect(freed.participantId).toBeNull();

			const { Participant } = await import('@/entities/participant.entity');
			const record = await getDS().getRepository(Participant).findOneByOrFail({ id: walker.id });
			expect(record.firstName).toBe('No');
			expect(record.lastName).toBe('Llegó');
			expect(record.emergencyContact1CellPhone).toBe('0987654321');
		});
	});
});
