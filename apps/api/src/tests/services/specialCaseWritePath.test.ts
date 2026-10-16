import { setupTestDatabase, teardownTestDatabase, clearTestData } from '../test-setup';
import { TestDataFactory } from '../test-utils/testDataFactory';
import { AppDataSource } from '@/data-source';
import { RetreatParticipant } from '@/entities/retreatParticipant.entity';
import { Participant } from '@/entities/participant.entity';
import { DomainAuditLog } from '@/entities/domainAuditLog.entity';
import {
	updateParticipant,
	findAllParticipants,
	findParticipantById,
} from '@/services/participantService';

/**
 * Special case (specs/special-case): the palanquero flags a walker for the
 * coordinator. The flag travels through PUT /participants/:id as
 * `specialCase` + `specialCaseCategory` + `specialCaseNotes` +
 * `contextRetreatId` and lands on the retreat_participants row of the context
 * retreat — same path as pays-at-house. Unmarking clears the case reason but
 * never the walker's general `notes`.
 */
describe('special case: write path', () => {
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
		const retreat = await TestDataFactory.createTestRetreat();
		retreatId = retreat.id;
		const p = await TestDataFactory.createTestParticipant(retreatId, { type: 'walker' } as any);
		participantId = p.id;
	});

	const rpRepo = () => AppDataSource.getRepository(RetreatParticipant);

	const readRow = (rId: string = retreatId) =>
		rpRepo().findOne({ where: { participantId, retreatId: rId } });

	const setRow = (fields: Partial<RetreatParticipant>, rId: string = retreatId) =>
		rpRepo().update({ participantId, retreatId: rId }, fields);

	/** The participant as the list hydrates it (per-retreat fields flattened). */
	const fromList = async () => {
		const p = await AppDataSource.getRepository(Participant).findOne({
			where: { id: participantId },
		});
		const rp = await readRow();
		return {
			...p,
			notes: rp?.notes,
			specialCase: rp?.specialCase ?? false,
			specialCaseCategory: rp?.specialCaseCategory ?? undefined,
			specialCaseNotes: rp?.specialCaseNotes ?? undefined,
		} as any;
	};

	// §25.3: the audit INSERT is fire-and-forget; wait for the row before the
	// next write so it doesn't collide with the in-flight save.
	const awaitAuditRows = async (count: number): Promise<DomainAuditLog[]> => {
		const auditRepo = AppDataSource.getRepository(DomainAuditLog);
		for (let i = 0; i < 100; i++) {
			const rows = await auditRepo.find({
				where: { action: 'participant.update', resourceId: participantId },
			});
			if (rows.length >= count) return rows;
			await new Promise((r) => setTimeout(r, 5));
		}
		throw new Error(`expected ${count} participant.update audit rows for ${participantId}`);
	};

	it('marking with category and notes writes the context retreat row and the return reflects it', async () => {
		const updated = await updateParticipant(participantId, {
			...(await fromList()),
			specialCase: true,
			specialCaseCategory: 'room',
			specialCaseNotes: 'Viaja con su mamá',
			contextRetreatId: retreatId,
		} as any);

		const row = await readRow();
		expect(row?.specialCase).toBe(true);
		expect(row?.specialCaseCategory).toBe('room');
		expect(row?.specialCaseNotes).toBe('Viaja con su mamá');
		// The returned virtuals already carry the new values (what the UI shows
		// after saving, without a refetch).
		expect((updated as any)?.specialCase).toBe(true);
		expect((updated as any)?.specialCaseCategory).toBe('room');
		expect((updated as any)?.specialCaseNotes).toBe('Viaja con su mamá');
	});

	it("unmarking persists false and clears the case reason, but never the walker's notes", async () => {
		await setRow({
			specialCase: true,
			specialCaseCategory: 'health',
			specialCaseNotes: 'Usa silla de ruedas',
			notes: 'Llega el sábado temprano',
		});

		// The client re-sends the whole hydrated DTO: the stale category and
		// notes ride along with `specialCase: false` and must not survive.
		const updated = await updateParticipant(participantId, {
			...(await fromList()),
			specialCase: false,
			contextRetreatId: retreatId,
		} as any);

		const row = await readRow();
		expect(row?.specialCase).toBe(false);
		expect(row?.specialCaseCategory).toBeNull();
		expect(row?.specialCaseNotes).toBeNull();
		expect(row?.notes).toBe('Llega el sábado temprano');
		expect((updated as any)?.specialCase).toBe(false);
		expect((updated as any)?.specialCaseCategory).toBeNull();
		expect((updated as any)?.specialCaseNotes).toBeNull();
	});

	it('a save without the fields does NOT erase the flag (legacy payload)', async () => {
		await setRow({ specialCase: true, specialCaseCategory: 'other', specialCaseNotes: 'Duelo reciente' });
		const ficha = await fromList();
		delete ficha.specialCase;
		delete ficha.specialCaseCategory;
		delete ficha.specialCaseNotes;

		await updateParticipant(participantId, {
			...ficha,
			cellPhone: '5551112233',
			contextRetreatId: retreatId,
		} as any);

		const row = await readRow();
		expect(row?.specialCase).toBe(true);
		expect(row?.specialCaseCategory).toBe('other');
		expect(row?.specialCaseNotes).toBe('Duelo reciente');
	});

	it('re-sending specialCase: true without category keeps the stored category (CA-5)', async () => {
		await setRow({ specialCase: true, specialCaseCategory: 'room', specialCaseNotes: 'Ronca fuerte' });
		const ficha = await fromList();
		delete ficha.specialCaseCategory;
		delete ficha.specialCaseNotes;

		await updateParticipant(participantId, {
			...ficha,
			specialCase: true,
			contextRetreatId: retreatId,
		} as any);

		const row = await readRow();
		expect(row?.specialCase).toBe(true);
		expect(row?.specialCaseCategory).toBe('room');
		expect(row?.specialCaseNotes).toBe('Ronca fuerte');
	});

	it('with contextRetreatId of ANOTHER retreat, writes that row and leaves the primary one alone', async () => {
		const retreatB = await TestDataFactory.createTestRetreat();
		await rpRepo().save(
			rpRepo().create({
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
			specialCase: true,
			specialCaseCategory: 'health',
			contextRetreatId: retreatB.id,
		} as any);

		const rowB = await readRow(retreatB.id);
		expect(rowB?.specialCase).toBe(true);
		expect(rowB?.specialCaseCategory).toBe('health');
		const rowA = await readRow();
		expect(rowA?.specialCase).toBe(false);
		expect(rowA?.specialCaseCategory).toBeNull();
	});

	describe('read overlay (per retreat, never mixed)', () => {
		let retreatB: string;

		beforeEach(async () => {
			retreatB = (await TestDataFactory.createTestRetreat()).id;
			await rpRepo().save(
				rpRepo().create({
					participantId,
					retreatId: retreatB,
					roleInRetreat: 'walker',
					type: 'walker',
					isCancelled: false,
					isPrimaryRetreat: false,
				}),
			);
			await setRow({ specialCase: true, specialCaseCategory: 'room', specialCaseNotes: 'Cuarto aparte' });
		});

		it('findAllParticipants hydrates the flag only in the retreat where it was set', async () => {
			const inA = (await findAllParticipants(retreatId)).find((p) => p.id === participantId);
			expect(inA?.specialCase).toBe(true);
			expect(inA?.specialCaseCategory).toBe('room');
			expect(inA?.specialCaseNotes).toBe('Cuarto aparte');

			const inB = (await findAllParticipants(retreatB)).find((p) => p.id === participantId);
			expect(inB?.specialCase).toBe(false);
			// Null reason columns stay off the wire payload (same rule as `notes`).
			const wireB = JSON.parse(JSON.stringify(inB));
			expect(wireB.specialCase).toBe(false);
			expect(wireB).not.toHaveProperty('specialCaseCategory');
			expect(wireB).not.toHaveProperty('specialCaseNotes');
		});

		it('findParticipantById hydrates the flag of the context retreat', async () => {
			const inA = await findParticipantById(participantId, false, retreatId);
			expect(inA?.specialCase).toBe(true);
			expect(inA?.specialCaseCategory).toBe('room');

			const inB = await findParticipantById(participantId, false, retreatB);
			expect(inB?.specialCase).toBe(false);
			expect(inB?.specialCaseCategory).toBeNull();
			expect(inB?.specialCaseNotes).toBeNull();
		});
	});

	it('the update audit records marking (with category) and unmarking', async () => {
		await updateParticipant(participantId, {
			...(await fromList()),
			specialCase: true,
			specialCaseCategory: 'health',
			specialCaseNotes: 'Diabético',
			contextRetreatId: retreatId,
		} as any);
		await awaitAuditRows(1);

		await updateParticipant(participantId, {
			...(await fromList()),
			specialCase: false,
			contextRetreatId: retreatId,
		} as any);
		// createdAt has second precision in SQLite: tell the rows apart by content.
		const rows = await awaitAuditRows(2);
		const mark = rows.find((r) => JSON.parse(r.newValues!).specialCase === true)!;
		const unmark = rows.find((r) => JSON.parse(r.newValues!).specialCase === false)!;

		expect(mark.retreatId).toBe(retreatId);
		expect(JSON.parse(mark.oldValues!)).toEqual({
			specialCase: false,
			specialCaseCategory: null,
			specialCaseNotes: null,
		});
		expect(JSON.parse(mark.newValues!)).toEqual({
			specialCase: true,
			specialCaseCategory: 'health',
			specialCaseNotes: 'Diabético',
		});

		expect(JSON.parse(unmark.oldValues!)).toEqual({
			specialCase: true,
			specialCaseCategory: 'health',
			specialCaseNotes: 'Diabético',
		});
		expect(JSON.parse(unmark.newValues!)).toEqual({
			specialCase: false,
			specialCaseCategory: null,
			specialCaseNotes: null,
		});
	});
});
