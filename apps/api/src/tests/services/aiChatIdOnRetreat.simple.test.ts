/**
 * AI Chat Service - idOnRetreat Tool Tests
 *
 * Tests the logic for resolving participants by their retreat number (idOnRetreat).
 * Pure logic tests without DB or AI SDK dependencies.
 */

// ---- Extracted logic: resolve participants by idOnRetreat ----

interface RetreatParticipantRow {
	participantId: string;
	idOnRetreat: number | null;
	type: string;
	isCancelled: boolean;
}

interface ParticipantRow {
	id: string;
	firstName: string;
	lastName: string;
	type?: string;
}

/**
 * Given a list of requested idOnRetreat numbers and the DB rows,
 * build the response the findByIdOnRetreat tool would return.
 */
function buildFindByIdOnRetreatResponse(
	ids: number[],
	rpRows: RetreatParticipantRow[],
	participants: ParticipantRow[],
) {
	if (rpRows.length === 0) {
		return { count: 0, participants: [], notFound: ids };
	}
	const rpMap = new Map(rpRows.map((r) => [r.participantId, r]));
	return {
		count: participants.length,
		participants: participants.map((p) => {
			const rp = rpMap.get(p.id);
			return {
				id: p.id,
				idOnRetreat: rp?.idOnRetreat ?? null,
				name: `${p.firstName} ${p.lastName}`,
				type: rp?.type ?? p.type,
				isCancelled: rp?.isCancelled ?? false,
			};
		}),
		notFound: ids.filter((id) => !rpRows.some((r) => r.idOnRetreat === id)),
	};
}

// ---- Extracted logic: enrich participant list with idOnRetreat ----

function enrichWithIdOnRetreat(
	participants: ParticipantRow[],
	rpRows: RetreatParticipantRow[],
) {
	const rpMap = new Map(rpRows.map((r) => [r.participantId, r]));
	return participants.map((p) => ({
		id: p.id,
		idOnRetreat: rpMap.get(p.id)?.idOnRetreat ?? null,
		name: `${p.firstName} ${p.lastName}`,
		type: rpMap.get(p.id)?.type ?? p.type,
	}));
}

// ---- Extracted logic: parse user input for idOnRetreat numbers ----

/**
 * Extract numeric IDs from user text like "agrega 29 26 y 30 a mesa 3"
 * This simulates how the AI model should interpret user input.
 */
function extractIdOnRetreatNumbers(text: string): number[] {
	const matches = text.match(/\d+/g);
	return matches ? matches.map(Number) : [];
}

// ============= TESTS =============

describe('AI Chat - idOnRetreat Support', () => {
	// Shared test data
	const rpRows: RetreatParticipantRow[] = [
		{ participantId: 'uuid-1', idOnRetreat: 29, type: 'walker', isCancelled: false },
		{ participantId: 'uuid-2', idOnRetreat: 26, type: 'walker', isCancelled: false },
		{ participantId: 'uuid-3', idOnRetreat: 30, type: 'walker', isCancelled: false },
		{ participantId: 'uuid-4', idOnRetreat: 15, type: 'server', isCancelled: false },
		{ participantId: 'uuid-5', idOnRetreat: 8, type: 'walker', isCancelled: true },
	];

	const participants: ParticipantRow[] = [
		{ id: 'uuid-1', firstName: 'Juan', lastName: 'Perez' },
		{ id: 'uuid-2', firstName: 'Maria', lastName: 'Lopez' },
		{ id: 'uuid-3', firstName: 'Carlos', lastName: 'Garcia' },
	];

	describe('findByIdOnRetreat response builder', () => {
		test('should resolve multiple ids correctly', () => {
			const result = buildFindByIdOnRetreatResponse([29, 26, 30], rpRows.slice(0, 3), participants);
			expect(result.count).toBe(3);
			expect(result.notFound).toEqual([]);
			expect(result.participants).toHaveLength(3);
			expect(result.participants[0]).toEqual({
				id: 'uuid-1',
				idOnRetreat: 29,
				name: 'Juan Perez',
				type: 'walker',
				isCancelled: false,
			});
		});

		test('should report not-found ids', () => {
			const result = buildFindByIdOnRetreatResponse([29, 99, 100], rpRows.slice(0, 1), [participants[0]]);
			expect(result.count).toBe(1);
			expect(result.notFound).toEqual([99, 100]);
			expect(result.participants).toHaveLength(1);
		});

		test('should return empty result when no ids match', () => {
			const result = buildFindByIdOnRetreatResponse([99, 100], [], []);
			expect(result.count).toBe(0);
			expect(result.participants).toEqual([]);
			expect(result.notFound).toEqual([99, 100]);
		});

		test('should handle single id', () => {
			const result = buildFindByIdOnRetreatResponse([29], rpRows.slice(0, 1), [participants[0]]);
			expect(result.count).toBe(1);
			expect(result.participants[0].idOnRetreat).toBe(29);
			expect(result.participants[0].name).toBe('Juan Perez');
			expect(result.notFound).toEqual([]);
		});

		test('should include isCancelled status', () => {
			const cancelledRp = [rpRows[4]]; // uuid-5, idOnRetreat: 8, cancelled
			const cancelledParticipant = [{ id: 'uuid-5', firstName: 'Pedro', lastName: 'Ruiz' }];
			const result = buildFindByIdOnRetreatResponse([8], cancelledRp, cancelledParticipant);
			expect(result.participants[0].isCancelled).toBe(true);
		});

		test('should use rp type over participant type', () => {
			const rpWithType = [{ participantId: 'uuid-1', idOnRetreat: 29, type: 'server', isCancelled: false }];
			const pWithType = [{ id: 'uuid-1', firstName: 'Juan', lastName: 'Perez', type: 'walker' }];
			const result = buildFindByIdOnRetreatResponse([29], rpWithType, pWithType);
			expect(result.participants[0].type).toBe('server'); // rp type takes precedence
		});

		test('should return empty when rpRows is empty (no matches in retreat_participants)', () => {
			const emptyRp: RetreatParticipantRow[] = [];
			const result = buildFindByIdOnRetreatResponse([29], emptyRp, []);
			expect(result.count).toBe(0);
			expect(result.participants).toEqual([]);
			expect(result.notFound).toEqual([29]);
		});

		test('should fallback to participant type when rp entry missing from map', () => {
			// Participant exists but its rp entry has a different participantId (edge case)
			const rpMismatch = [{ participantId: 'uuid-other', idOnRetreat: 29, type: 'server', isCancelled: false }];
			const pWithType = [{ id: 'uuid-1', firstName: 'Juan', lastName: 'Perez', type: 'walker' }];
			const result = buildFindByIdOnRetreatResponse([29], rpMismatch, pWithType);
			expect(result.count).toBe(1);
			expect(result.participants[0].type).toBe('walker'); // falls back to participant type
			expect(result.participants[0].idOnRetreat).toBeNull(); // no rp match
		});
	});

	describe('enrichWithIdOnRetreat', () => {
		test('should add idOnRetreat to participant list', () => {
			const enriched = enrichWithIdOnRetreat(participants, rpRows.slice(0, 3));
			expect(enriched).toHaveLength(3);
			expect(enriched[0].idOnRetreat).toBe(29);
			expect(enriched[1].idOnRetreat).toBe(26);
			expect(enriched[2].idOnRetreat).toBe(30);
		});

		test('should return null idOnRetreat for unmatched participants', () => {
			const extraParticipant = [...participants, { id: 'uuid-999', firstName: 'Ana', lastName: 'Torres' }];
			const enriched = enrichWithIdOnRetreat(extraParticipant, rpRows.slice(0, 3));
			expect(enriched[3].idOnRetreat).toBeNull();
		});

		test('should use rp type over participant type', () => {
			const pWithType = [{ id: 'uuid-4', firstName: 'Luis', lastName: 'Diaz', type: 'walker' }];
			const enriched = enrichWithIdOnRetreat(pWithType, [rpRows[3]]); // type: 'server'
			expect(enriched[0].type).toBe('server');
		});

		test('should handle empty lists', () => {
			expect(enrichWithIdOnRetreat([], [])).toEqual([]);
		});
	});

	describe('extractIdOnRetreatNumbers (input parsing)', () => {
		test('should extract numbers from "agrega 29 26 y 30 a mesa 3"', () => {
			const nums = extractIdOnRetreatNumbers('agrega 29 26 y 30 a mesa 3');
			expect(nums).toEqual([29, 26, 30, 3]);
		});

		test('should extract single number', () => {
			const nums = extractIdOnRetreatNumbers('busca al 15');
			expect(nums).toEqual([15]);
		});

		test('should handle comma-separated numbers', () => {
			const nums = extractIdOnRetreatNumbers('29, 26, 30');
			expect(nums).toEqual([29, 26, 30]);
		});

		test('should return empty array when no numbers', () => {
			const nums = extractIdOnRetreatNumbers('busca a Juan Perez');
			expect(nums).toEqual([]);
		});

		test('should handle mixed text and numbers', () => {
			const nums = extractIdOnRetreatNumbers('mueve el 5 a la mesa 2');
			expect(nums).toEqual([5, 2]);
		});
	});
});
