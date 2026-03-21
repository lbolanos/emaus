// Tests for virtual field preservation on Participant entity
// Virtual fields (type, isCancelled, id_on_retreat, family_friend_color, tableId)
// live in retreat_participants, NOT in the participants table.
// They get lost when the entity is refreshed from DB via findOne/save.

/**
 * Simulates a Participant entity as returned by TypeORM findOne()
 * (only real @Column fields, no virtual fields)
 */
function createDbParticipant(overrides: Record<string, any> = {}) {
	return {
		id: 'p-001',
		firstName: 'Juan',
		lastName: 'Pérez',
		email: 'juan@test.com',
		retreatId: 'r-001',
		birthDate: new Date('1990-05-15'),
		snores: false,
		// Virtual fields are undefined when loaded from DB
		type: undefined,
		isCancelled: undefined,
		id_on_retreat: undefined,
		family_friend_color: undefined,
		tableId: undefined,
		...overrides,
	};
}

/**
 * Simulates a RetreatParticipant row (retreat_participants table)
 */
function createRetreatParticipant(overrides: Record<string, any> = {}) {
	return {
		participantId: 'p-001',
		retreatId: 'r-001',
		type: 'walker' as const,
		isCancelled: false,
		tableId: null,
		idOnRetreat: 42,
		familyFriendColor: '#FF0000',
		roleInRetreat: 'walker' as const,
		...overrides,
	};
}

/**
 * Simulates setting virtual fields on a participant from retreat_participants data.
 * This is the pattern used throughout participantService.ts.
 */
function applyVirtualFields(participant: any, rp: any) {
	participant.type = rp.type;
	participant.isCancelled = rp.isCancelled;
	participant.id_on_retreat = rp.idOnRetreat ?? undefined;
	participant.family_friend_color = rp.familyFriendColor ?? undefined;
	participant.tableId = rp.tableId;
}

/**
 * Simulates the DB refresh pattern that caused the bug:
 *   savedParticipant = await repo.findOne({ where: { id } }) || savedParticipant;
 * This replaces the object, losing all virtual fields.
 */
function simulateDbRefresh(participant: any): any {
	// DB only returns @Column fields — virtual fields become undefined
	return createDbParticipant({
		id: participant.id,
		firstName: participant.firstName,
		lastName: participant.lastName,
		email: participant.email,
		retreatId: participant.retreatId,
	});
}

/**
 * The fixed version: preserve virtual fields across DB refresh
 */
function refreshWithVirtualFieldPreservation(participant: any): any {
	const virtualType = participant.type;
	const virtualIsCancelled = participant.isCancelled;
	const virtualIdOnRetreat = participant.id_on_retreat;
	const virtualFamilyColor = participant.family_friend_color;
	const virtualTableId = participant.tableId;

	const refreshed = simulateDbRefresh(participant);

	refreshed.type = virtualType;
	refreshed.isCancelled = virtualIsCancelled;
	refreshed.id_on_retreat = virtualIdOnRetreat;
	refreshed.family_friend_color = virtualFamilyColor;
	refreshed.tableId = virtualTableId;

	return refreshed;
}

describe('Participant Virtual Fields', () => {
	describe('Bug: virtual fields lost after DB refresh (createParticipant email bug)', () => {
		test('DB refresh without preservation loses type — causes "Property type not found" error', () => {
			const participant = createDbParticipant();
			const rp = createRetreatParticipant({ type: 'walker' });
			applyVirtualFields(participant, rp);

			expect(participant.type).toBe('walker');

			// Simulate the bug: DB refresh overwrites virtual fields
			const refreshed = simulateDbRefresh(participant);

			expect(refreshed.type).toBeUndefined();
			expect(refreshed.isCancelled).toBeUndefined();
			expect(refreshed.id_on_retreat).toBeUndefined();
			expect(refreshed.family_friend_color).toBeUndefined();
		});

		test('DB refresh WITH preservation keeps all virtual fields', () => {
			const participant = createDbParticipant();
			const rp = createRetreatParticipant({
				type: 'walker',
				isCancelled: false,
				idOnRetreat: 42,
				familyFriendColor: '#FF0000',
			});
			applyVirtualFields(participant, rp);

			const refreshed = refreshWithVirtualFieldPreservation(participant);

			expect(refreshed.type).toBe('walker');
			expect(refreshed.isCancelled).toBe(false);
			expect(refreshed.id_on_retreat).toBe(42);
			expect(refreshed.family_friend_color).toBe('#FF0000');
		});

		test('email template selection works after preserved refresh', () => {
			const participant = createDbParticipant();
			applyVirtualFields(participant, createRetreatParticipant({ type: 'walker' }));

			const refreshed = refreshWithVirtualFieldPreservation(participant);

			// This is the exact line that was failing (participantService.ts:1096)
			const templateType = refreshed.type === 'walker' ? 'WALKER_WELCOME' : 'SERVER_WELCOME';
			expect(templateType).toBe('WALKER_WELCOME');
		});

		test('email template selection for server after preserved refresh', () => {
			const participant = createDbParticipant();
			applyVirtualFields(participant, createRetreatParticipant({ type: 'server' }));

			const refreshed = refreshWithVirtualFieldPreservation(participant);

			const templateType = refreshed.type === 'walker' ? 'WALKER_WELCOME' : 'SERVER_WELCOME';
			expect(templateType).toBe('SERVER_WELCOME');
		});

		test('WITHOUT fix: email template defaults to SERVER_WELCOME for undefined type', () => {
			const participant = createDbParticipant();
			applyVirtualFields(participant, createRetreatParticipant({ type: 'walker' }));

			// Bug: refresh without preservation
			const refreshed = simulateDbRefresh(participant);

			// undefined !== 'walker', so it picks SERVER_WELCOME — WRONG for a walker
			const templateType = refreshed.type === 'walker' ? 'WALKER_WELCOME' : 'SERVER_WELCOME';
			expect(templateType).toBe('SERVER_WELCOME'); // BUG behavior
			expect(refreshed.type).not.toBe('walker'); // confirms type is lost
		});
	});

	describe('Bug: import bulk assignment with missing virtual fields', () => {
		test('participants loaded from DB without retreat_participants have no type', () => {
			const participants = [
				createDbParticipant({ id: 'p-001' }),
				createDbParticipant({ id: 'p-002' }),
				createDbParticipant({ id: 'p-003' }),
			];

			// All types are undefined — the bug
			for (const p of participants) {
				expect(p.type).toBeUndefined();
			}
		});

		test('waiting participants get assigned beds when type is undefined (the bug)', () => {
			// Simulate loading participants from Participant table directly (no join)
			const participant = createDbParticipant({ id: 'p-waiting' });
			// This participant is actually "waiting" in retreat_participants, but we didn't load that

			// Bug: undefined !== 'waiting' evaluates to true, so this passes the filter
			const shouldAssignBed = participant.type !== 'waiting' && participant.type !== 'partial_server';
			expect(shouldAssignBed).toBe(true); // BUG: should be false for waiting participants
		});

		test('cancelled participants are not skipped when isCancelled is undefined (the bug)', () => {
			const participant = createDbParticipant({ id: 'p-cancelled' });
			// This participant is actually cancelled, but we didn't load from retreat_participants

			// Bug: undefined is falsy, so this doesn't skip
			const shouldSkip = participant.isCancelled;
			expect(shouldSkip).toBeFalsy(); // BUG: should be true for cancelled participants
		});

		test('FIX: loading via retreat_participants properly populates virtual fields', () => {
			// Simulate the fix: load from retreat_participants with relations
			const rpRows = [
				{
					...createRetreatParticipant({ type: 'walker', isCancelled: false }),
					participant: createDbParticipant({ id: 'p-001' }),
				},
				{
					...createRetreatParticipant({ type: 'waiting', isCancelled: false }),
					participant: createDbParticipant({ id: 'p-002' }),
				},
				{
					...createRetreatParticipant({ type: 'server', isCancelled: true }),
					participant: createDbParticipant({ id: 'p-003' }),
				},
			];

			const participants = rpRows.map((rp) => {
				const p = rp.participant;
				applyVirtualFields(p, rp);
				return p;
			});

			// Walker: should get bed assignment
			expect(participants[0].type).toBe('walker');
			const walker = participants[0];
			expect(walker.type !== 'waiting' && walker.type !== 'partial_server').toBe(true);

			// Waiting: should NOT get bed assignment
			expect(participants[1].type).toBe('waiting');
			const waiting = participants[1];
			expect(waiting.type !== 'waiting' && waiting.type !== 'partial_server').toBe(false);

			// Cancelled server: should be skipped
			expect(participants[2].isCancelled).toBe(true);
		});
	});

	describe('Virtual field identification', () => {
		test('type is NOT a @Column — it is virtual', () => {
			const fromDb = createDbParticipant();
			expect(fromDb.type).toBeUndefined();
		});

		test('isCancelled is NOT a @Column — it is virtual', () => {
			const fromDb = createDbParticipant();
			expect(fromDb.isCancelled).toBeUndefined();
		});

		test('id_on_retreat is NOT a @Column — it is virtual', () => {
			const fromDb = createDbParticipant();
			expect(fromDb.id_on_retreat).toBeUndefined();
		});

		test('family_friend_color is NOT a @Column — it is virtual', () => {
			const fromDb = createDbParticipant();
			expect(fromDb.family_friend_color).toBeUndefined();
		});

		test('tableId is NOT a @Column — it is virtual', () => {
			const fromDb = createDbParticipant();
			expect(fromDb.tableId).toBeUndefined();
		});

		test('real @Column fields survive DB refresh', () => {
			const original = createDbParticipant({
				firstName: 'María',
				lastName: 'González',
				email: 'maria@test.com',
			});

			const refreshed = simulateDbRefresh(original);
			expect(refreshed.firstName).toBe('María');
			expect(refreshed.lastName).toBe('González');
			expect(refreshed.email).toBe('maria@test.com');
		});
	});

	describe('All participant type values', () => {
		const types = ['walker', 'server', 'waiting', 'partial_server'] as const;

		for (const type of types) {
			test(`type "${type}" is preserved after DB refresh with fix`, () => {
				const participant = createDbParticipant();
				applyVirtualFields(participant, createRetreatParticipant({ type }));

				const refreshed = refreshWithVirtualFieldPreservation(participant);
				expect(refreshed.type).toBe(type);
			});
		}

		test('bed assignment filtering works correctly for all types after fix', () => {
			const results: Record<string, boolean> = {};

			for (const type of types) {
				const participant = createDbParticipant();
				applyVirtualFields(participant, createRetreatParticipant({ type }));
				const refreshed = refreshWithVirtualFieldPreservation(participant);

				results[type] = refreshed.type !== 'waiting' && refreshed.type !== 'partial_server';
			}

			expect(results.walker).toBe(true);
			expect(results.server).toBe(true);
			expect(results.waiting).toBe(false);
			expect(results.partial_server).toBe(false);
		});
	});
});
