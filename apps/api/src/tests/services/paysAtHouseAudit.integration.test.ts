import { setupTestDatabase, teardownTestDatabase, clearTestData } from '../test-setup';
import { TestDataFactory } from '../test-utils/testDataFactory';
import { AppDataSource } from '@/data-source';
import { DomainAuditLog } from '@/entities/domainAuditLog.entity';
import { RetreatParticipant } from '@/entities/retreatParticipant.entity';
import { Participant } from '@/entities/participant.entity';
import { updateParticipant } from '@/services/participantService';
import { auditContext } from '@/utils/auditContext';

/**
 * Audit coverage for the pays-at-house flag (specs/pays-at-house follow-up to
 * PR #8). `paysAtHouse` was part of `oldAuditSnapshot` but missing from the
 * `PARTICIPANT_AUDIT_FIELDS` allowlist, so `diffFields` dropped it and
 * mark/unmark left no audit trail of who set or cleared the commitment.
 */
describe('Domain audit — pays-at-house mark/unmark (participant.update)', () => {
	let retreatId: string;
	let participantId: string;
	let actorId: string;

	beforeAll(async () => {
		await setupTestDatabase();
	});
	afterAll(async () => {
		await teardownTestDatabase();
	});
	beforeEach(async () => {
		await clearTestData();
		const actor = await TestDataFactory.createTestUser();
		actorId = actor.id;
		// Cost > 0 so a marked participant still owes (pays_at_house status).
		const retreat = await TestDataFactory.createTestRetreat({ cost: '1500' } as any);
		retreatId = retreat.id;
		const p = await TestDataFactory.createTestParticipant(retreatId, { type: 'walker' } as any);
		participantId = p.id;
	});

	const logs = () => AppDataSource.getRepository(DomainAuditLog).find();
	async function waitForLogs(
		predicate: (rows: DomainAuditLog[]) => boolean,
		tries = 60,
		delayMs = 5,
	): Promise<DomainAuditLog[]> {
		let rows = await logs();
		for (let i = 0; i < tries && !predicate(rows); i++) {
			await new Promise((r) => setTimeout(r, delayMs));
			rows = await logs();
		}
		return rows;
	}

	const updateRows = (rows: DomainAuditLog[]) =>
		rows.filter((r) => r.action === 'participant.update' && r.resourceId === participantId);

	/** Flattened DTO as the list hydrates it (per-retreat fields flattened). */
	const fromList = async () => {
		const p = await AppDataSource.getRepository(Participant).findOne({
			where: { id: participantId },
		});
		const rp = await AppDataSource.getRepository(RetreatParticipant).findOne({
			where: { participantId, retreatId },
		});
		return {
			...p,
			paysAtHouse: rp?.paysAtHouse ?? false,
			isScholarship: rp?.isScholarship ?? false,
		} as any;
	};

	const runUpdate = (payload: Record<string, any>) =>
		auditContext.run({ userId: actorId, ip: '10.0.0.5' }, async () =>
			updateParticipant(participantId, payload as any),
		);

	it('marking logs participant.update with the paysAtHouse diff and the actor', async () => {
		await runUpdate({ ...(await fromList()), paysAtHouse: true, contextRetreatId: retreatId });

		const rows = await waitForLogs((r) => updateRows(r).length > 0);
		const updates = updateRows(rows);
		expect(updates).toHaveLength(1);
		expect(updates[0].actorUserId).toBe(actorId);
		expect(updates[0].retreatId).toBe(retreatId);
		const oldV = JSON.parse(updates[0].oldValues!);
		const newV = JSON.parse(updates[0].newValues!);
		expect(oldV.paysAtHouse).toBe(false);
		expect(newV.paysAtHouse).toBe(true);
	});

	it('unmarking logs the reverse diff', async () => {
		await AppDataSource.getRepository(RetreatParticipant).update(
			{ participantId, retreatId },
			{ paysAtHouse: true },
		);
		await runUpdate({ ...(await fromList()), paysAtHouse: false, contextRetreatId: retreatId });

		const rows = await waitForLogs((r) => updateRows(r).length > 0);
		const updates = updateRows(rows);
		expect(updates).toHaveLength(1);
		const oldV = JSON.parse(updates[0].oldValues!);
		const newV = JSON.parse(updates[0].newValues!);
		expect(oldV.paysAtHouse).toBe(true);
		expect(newV.paysAtHouse).toBe(false);
	});

	it('a payload without the field logs no paysAtHouse noise in the diff', async () => {
		await runUpdate({ ...(await fromList()), contextRetreatId: retreatId });

		const rows = await waitForLogs((r) => updateRows(r).length > 0);
		const updates = updateRows(rows);
		expect(updates).toHaveLength(1);
		// Empty diff → no old/new values at all: the flag stays out of the log
		// when the payload does not carry it.
		expect(updates[0].oldValues).toBeNull();
		expect(updates[0].newValues).toBeNull();
	});
});
