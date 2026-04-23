// Tests for the reception check-in feature (pure unit tests — no database, no mocks).
//
// These tests replicate the core logic of:
//   - setParticipantCheckIn  (apps/api/src/services/participantService.ts)
//   - getReceptionStats      (apps/api/src/services/participantService.ts)
//
// Because participantService creates TypeORM repositories at module-load time
// (a known limitation that causes the integration tests to be skipped), we
// extract and verify the computation logic here without touching the database.

// ── Types ──────────────────────────────────────────────────────────────────

interface RawRetreatParticipant {
	id: string;
	participantId: string | null;
	retreatId: string;
	type: string | null;
	isCancelled: boolean;
	checkedIn: boolean;
	checkedInAt: Date | null;
	idOnRetreat: number | null;
	participant?: {
		firstName: string;
		lastName: string;
		cellPhone: string;
	} | null;
}

// ── Extracted logic ────────────────────────────────────────────────────────

/**
 * Mirrors the filtering + mapping logic in getReceptionStats().
 */
function computeReceptionStats(rows: RawRetreatParticipant[]) {
	const walkers = rows.filter((rp) => !rp.isCancelled && rp.type === 'walker');

	const total = walkers.length;
	const arrived = walkers.filter((rp) => rp.checkedIn).length;
	const pending = total - arrived;

	const toEntry = (rp: RawRetreatParticipant) => ({
		retreatParticipantId: rp.id,
		participantId: rp.participantId,
		idOnRetreat: rp.idOnRetreat,
		firstName: rp.participant?.firstName ?? '',
		lastName: rp.participant?.lastName ?? '',
		cellPhone: rp.participant?.cellPhone ?? '',
		checkedIn: rp.checkedIn,
		checkedInAt: rp.checkedInAt ?? null,
	});

	const pendingList = walkers.filter((rp) => !rp.checkedIn).map(toEntry);
	const arrivedList = walkers.filter((rp) => rp.checkedIn).map(toEntry);

	return { total, arrived, pending, pendingList, arrivedList };
}

/**
 * Mirrors the mutation logic in setParticipantCheckIn().
 */
function applyCheckIn(
	rp: RawRetreatParticipant,
	checkedIn: boolean,
): Pick<RawRetreatParticipant, 'checkedIn' | 'checkedInAt'> {
	return {
		checkedIn,
		checkedInAt: checkedIn ? new Date() : null,
	};
}

// ── Fixtures ───────────────────────────────────────────────────────────────

function makeWalker(overrides: Partial<RawRetreatParticipant> = {}): RawRetreatParticipant {
	return {
		id: `rp-${Math.random().toString(36).slice(2)}`,
		participantId: `p-${Math.random().toString(36).slice(2)}`,
		retreatId: 'retreat-1',
		type: 'walker',
		isCancelled: false,
		checkedIn: false,
		checkedInAt: null,
		idOnRetreat: 1,
		participant: { firstName: 'Juan', lastName: 'Pérez', cellPhone: '5551234567' },
		...overrides,
	};
}

// ── Tests: computeReceptionStats ───────────────────────────────────────────

describe('computeReceptionStats', () => {
	describe('counters', () => {
		it('returns zeros when there are no participants', () => {
			const result = computeReceptionStats([]);
			expect(result.total).toBe(0);
			expect(result.arrived).toBe(0);
			expect(result.pending).toBe(0);
		});

		it('counts all walkers as pending when none have checked in', () => {
			const rows = [makeWalker(), makeWalker(), makeWalker()];
			const result = computeReceptionStats(rows);
			expect(result.total).toBe(3);
			expect(result.arrived).toBe(0);
			expect(result.pending).toBe(3);
		});

		it('counts arrived and pending correctly with mixed check-in state', () => {
			const rows = [
				makeWalker({ checkedIn: true, checkedInAt: new Date() }),
				makeWalker({ checkedIn: false }),
				makeWalker({ checkedIn: true, checkedInAt: new Date() }),
			];
			const result = computeReceptionStats(rows);
			expect(result.total).toBe(3);
			expect(result.arrived).toBe(2);
			expect(result.pending).toBe(1);
		});

		it('returns all arrived when everyone has checked in', () => {
			const now = new Date();
			const rows = [
				makeWalker({ checkedIn: true, checkedInAt: now }),
				makeWalker({ checkedIn: true, checkedInAt: now }),
			];
			const result = computeReceptionStats(rows);
			expect(result.arrived).toBe(2);
			expect(result.pending).toBe(0);
		});

		it('total === arrived + pending always', () => {
			const rows = [
				makeWalker({ checkedIn: true, checkedInAt: new Date() }),
				makeWalker(),
				makeWalker(),
				makeWalker({ checkedIn: true, checkedInAt: new Date() }),
			];
			const result = computeReceptionStats(rows);
			expect(result.arrived + result.pending).toBe(result.total);
		});
	});

	describe('filtering', () => {
		it('ignores cancelled walkers', () => {
			const rows = [
				makeWalker({ isCancelled: true }),
				makeWalker({ isCancelled: false }),
			];
			const result = computeReceptionStats(rows);
			expect(result.total).toBe(1);
		});

		it('ignores non-walker types (server, waiting, partial_server)', () => {
			const rows = [
				makeWalker({ type: 'server' }),
				makeWalker({ type: 'waiting' }),
				makeWalker({ type: 'partial_server' }),
				makeWalker({ type: 'walker' }),
			];
			const result = computeReceptionStats(rows);
			expect(result.total).toBe(1);
		});

		it('ignores rows with null type', () => {
			const rows = [makeWalker({ type: null }), makeWalker()];
			const result = computeReceptionStats(rows);
			expect(result.total).toBe(1);
		});
	});

	describe('pendingList', () => {
		it('pendingList contains only non-arrived walkers', () => {
			const rows = [
				makeWalker({ checkedIn: true, checkedInAt: new Date() }),
				makeWalker({ checkedIn: false }),
			];
			const result = computeReceptionStats(rows);
			expect(result.pendingList).toHaveLength(1);
			expect(result.pendingList[0].checkedIn).toBe(false);
		});

		it('each pendingList entry has the expected shape', () => {
			const walker = makeWalker({
				idOnRetreat: 7,
				participant: { firstName: 'María', lastName: 'López', cellPhone: '5559876543' },
			});
			const result = computeReceptionStats([walker]);
			const entry = result.pendingList[0];

			expect(entry).toHaveProperty('retreatParticipantId');
			expect(entry).toHaveProperty('participantId');
			expect(entry).toHaveProperty('idOnRetreat', 7);
			expect(entry).toHaveProperty('firstName', 'María');
			expect(entry).toHaveProperty('lastName', 'López');
			expect(entry).toHaveProperty('cellPhone', '5559876543');
			expect(entry).toHaveProperty('checkedIn', false);
			expect(entry).toHaveProperty('checkedInAt', null);
		});

		it('falls back to empty strings when participant relation is missing', () => {
			const walker = makeWalker({ participant: null });
			const result = computeReceptionStats([walker]);
			const entry = result.pendingList[0];
			expect(entry.firstName).toBe('');
			expect(entry.lastName).toBe('');
			expect(entry.cellPhone).toBe('');
		});
	});

	describe('arrivedList', () => {
		it('arrivedList contains only checked-in walkers', () => {
			const now = new Date();
			const rows = [
				makeWalker({ checkedIn: true, checkedInAt: now }),
				makeWalker({ checkedIn: false }),
			];
			const result = computeReceptionStats(rows);
			expect(result.arrivedList).toHaveLength(1);
			expect(result.arrivedList[0].checkedIn).toBe(true);
			expect(result.arrivedList[0].checkedInAt).toBe(now);
		});

		it('is empty when no one has arrived yet', () => {
			const result = computeReceptionStats([makeWalker(), makeWalker()]);
			expect(result.arrivedList).toHaveLength(0);
		});
	});
});

// ── Tests: applyCheckIn ────────────────────────────────────────────────────

describe('applyCheckIn', () => {
	it('sets checkedIn to true and records a timestamp', () => {
		const before = Date.now();
		const rp = makeWalker({ checkedIn: false, checkedInAt: null });
		const result = applyCheckIn(rp, true);
		const after = Date.now();

		expect(result.checkedIn).toBe(true);
		expect(result.checkedInAt).toBeInstanceOf(Date);
		expect(result.checkedInAt!.getTime()).toBeGreaterThanOrEqual(before);
		expect(result.checkedInAt!.getTime()).toBeLessThanOrEqual(after);
	});

	it('clears checkedIn and nullifies timestamp when undoing check-in', () => {
		const rp = makeWalker({ checkedIn: true, checkedInAt: new Date() });
		const result = applyCheckIn(rp, false);

		expect(result.checkedIn).toBe(false);
		expect(result.checkedInAt).toBeNull();
	});

	it('is idempotent: checking in twice keeps checkedIn true', () => {
		const rp = makeWalker({ checkedIn: true, checkedInAt: new Date('2025-01-01') });
		const result = applyCheckIn(rp, true);

		expect(result.checkedIn).toBe(true);
		expect(result.checkedInAt).toBeInstanceOf(Date);
	});

	it('is idempotent: undoing twice keeps checkedIn false and checkedInAt null', () => {
		const rp = makeWalker({ checkedIn: false, checkedInAt: null });
		const result = applyCheckIn(rp, false);

		expect(result.checkedIn).toBe(false);
		expect(result.checkedInAt).toBeNull();
	});
});

// ── Tests: receptionPercent (UI computation) ───────────────────────────────

describe('receptionPercent (frontend progress bar)', () => {
	function receptionPercent(arrived: number, total: number): number {
		return total > 0 ? Math.round((arrived / total) * 100) : 0;
	}

	it('is 0 when no participants exist', () => {
		expect(receptionPercent(0, 0)).toBe(0);
	});

	it('is 0 when no one has arrived', () => {
		expect(receptionPercent(0, 10)).toBe(0);
	});

	it('is 100 when everyone has arrived', () => {
		expect(receptionPercent(10, 10)).toBe(100);
	});

	it('rounds correctly at 1/3', () => {
		expect(receptionPercent(1, 3)).toBe(33);
	});

	it('rounds correctly at 2/3', () => {
		expect(receptionPercent(2, 3)).toBe(67);
	});

	it('rounds correctly at 1/2', () => {
		expect(receptionPercent(5, 10)).toBe(50);
	});
});
