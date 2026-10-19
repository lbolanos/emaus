import { setupTestDatabase, teardownTestDatabase, clearTestData } from '../test-setup';
import { TestDataFactory } from '../test-utils/testDataFactory';
import { AppDataSource } from '@/data-source';
import { RetreatParticipant } from '@/entities/retreatParticipant.entity';
import { updateParticipant } from '@/services/participantService';
import { Participant } from '@/entities/participant.entity';

/**
 * Write path for the "pays at the retreat house" flag (specs/pays-at-house).
 * The toggle travels through PUT /participants/:id as `paysAtHouse` +
 * `contextRetreatId` and lands on the retreat_participants row of the context
 * retreat — same path as the scholarship flag.
 */
describe('pays-at-house: write path', () => {
	let retreatId: string;
	let participantId: string;

	beforeAll(async () => {
		await setupTestDatabase();
	});
	afterAll(async () => {
		await teardownTestDatabase();
	});
	beforeEach(async () => {
		await clearTestData();
		// Cost > 0 so the marked participant still owes (pays_at_house status).
		const retreat = await TestDataFactory.createTestRetreat({ cost: '1500' } as any);
		retreatId = retreat.id;
		const p = await TestDataFactory.createTestParticipant(retreatId, { type: 'walker' } as any);
		participantId = p.id;
	});

	const readRow = (rId: string = retreatId) =>
		AppDataSource.getRepository(RetreatParticipant).findOne({
			where: { participantId, retreatId: rId },
		});

	/** DTO as the list hydrates it (per-retreat fields flattened). */
	const fromList = async () => {
		const p = await AppDataSource.getRepository(Participant).findOne({
			where: { id: participantId },
		});
		const rp = await readRow();
		return { ...p, paysAtHouse: rp?.paysAtHouse ?? false, isScholarship: rp?.isScholarship ?? false } as any;
	};

	it('paysAtHouse=true writes the context retreat row and the return value carries it', async () => {
		const updated = await updateParticipant(participantId, {
			...(await fromList()),
			paysAtHouse: true,
			contextRetreatId: retreatId,
		} as any);

		const row = await readRow();
		expect(row?.paysAtHouse).toBe(true);
		// The returned virtual already carries the new value (what the UI shows
		// after saving, without a refetch).
		expect((updated as any)?.paysAtHouse).toBe(true);
	});

	it('paysAtHouse=false persists the unmark', async () => {
		await AppDataSource.getRepository(RetreatParticipant).update(
			{ participantId, retreatId },
			{ paysAtHouse: true },
		);

		await updateParticipant(participantId, {
			...(await fromList()),
			paysAtHouse: false,
			contextRetreatId: retreatId,
		} as any);

		const row = await readRow();
		expect(row?.paysAtHouse).toBe(false);
	});

	it('a save that omits the field does NOT clear the flag (legacy payload)', async () => {
		await AppDataSource.getRepository(RetreatParticipant).update(
			{ participantId, retreatId },
			{ paysAtHouse: true },
		);
		const dto = await fromList();
		delete dto.paysAtHouse;

		await updateParticipant(participantId, { ...dto, cellPhone: '5551112233' } as any);

		const row = await readRow();
		expect(row?.paysAtHouse).toBe(true);
	});

	it('marking the scholarship clears the flag (D4: mirror hygiene of scholarshipAmount)', async () => {
		await AppDataSource.getRepository(RetreatParticipant).update(
			{ participantId, retreatId },
			{ paysAtHouse: true },
		);

		await updateParticipant(participantId, {
			...(await fromList()),
			isScholarship: true,
			contextRetreatId: retreatId,
		} as any);

		const row = await readRow();
		expect(row?.isScholarship).toBe(true);
		// A scholarshipped participant is exempt from everything: the promise
		// to pay at the house makes no sense and is cleared on the same save.
		expect(row?.paysAtHouse).toBe(false);
	});

	it('with a contextRetreatId from ANOTHER retreat, writes that row and not the primary one', async () => {
		const retreatB = await TestDataFactory.createTestRetreat({ cost: '999' } as any);
		await AppDataSource.getRepository(RetreatParticipant).save(
			AppDataSource.getRepository(RetreatParticipant).create({
				participantId,
				retreatId: retreatB.id,
				roleInRetreat: 'walker',
				type: 'walker',
				isCancelled: false,
				isPrimaryRetreat: false,
			}),
		);

		await updateParticipant(participantId, {
			...(await fromList()),
			paysAtHouse: true,
			contextRetreatId: retreatB.id,
		} as any);

		expect((await readRow(retreatB.id))?.paysAtHouse).toBe(true);
		// The primary retreat row stays untouched.
		expect((await readRow())?.paysAtHouse).toBe(false);
	});
});
