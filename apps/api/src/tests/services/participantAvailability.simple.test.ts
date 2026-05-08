/**
 * Pure-logic tests for the "angelito availability" feature:
 *  - participantAvailabilityService.replaceAll input validation
 *  - retreatScheduleService.autoAssignAngelitos availability-window filter
 *  - participantAvailabilityController.listEligibleServersForSlot
 *    (mealWindow + ignoreAvailability matrix)
 *
 * Mirrors the relevant algorithms without booting TypeORM. The real service
 * methods live in:
 *   - apps/api/src/services/participantAvailabilityService.ts
 *   - apps/api/src/services/retreatScheduleService.ts (autoAssignAngelitos)
 *   - apps/api/src/controllers/participantAvailabilityController.ts
 */

// ── Types ─────────────────────────────────────────────────────────────────────
interface Slot {
	id: string;
	startTime: Date;
	endTime: Date;
	mealWindow: boolean;
}

interface AvailabilityBlock {
	startTime: Date;
	endTime: Date;
}

// ── Algorithms under test (mirror) ────────────────────────────────────────────

/** Mirror of ParticipantAvailabilityService.replaceAll input normalization */
function normalizeBlocks(
	blocks: Array<{ startTime: Date | string; endTime: Date | string }>,
): AvailabilityBlock[] {
	return blocks.map((b) => {
		const start = b.startTime instanceof Date ? b.startTime : new Date(b.startTime);
		const end = b.endTime instanceof Date ? b.endTime : new Date(b.endTime);
		if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
			throw new Error('invalid datetime');
		}
		if (end <= start) {
			throw new Error('endTime must be greater than startTime');
		}
		return { startTime: start, endTime: end };
	});
}

/** Mirror of `isAvailable(participantId, slot)` from autoAssignAngelitos.
 * Política legacy-compatible: 0 bloques registrados → disponible siempre
 * (preserva el comportamiento previo a la feature). Con ≥1 bloque, exige
 * que alguno cubra el slot completo.
 */
function blockCoversSlot(block: AvailabilityBlock, slot: Slot): boolean {
	return (
		block.startTime.getTime() <= slot.startTime.getTime() &&
		block.endTime.getTime() >= slot.endTime.getTime()
	);
}
function isAvailable(blocks: AvailabilityBlock[] | undefined, slot: Slot): boolean {
	if (!blocks || blocks.length === 0) return true;
	return blocks.some((b) => blockCoversSlot(b, slot));
}

/**
 * Mirror of the angelito-pool filter step inside autoAssignAngelitos:
 * for each meal slot, return the candidate ids whose availability covers it.
 */
function eligibleCandidates(
	pool: Array<{ id: string; availability?: AvailabilityBlock[] }>,
	slot: Slot,
): string[] {
	return pool.filter((p) => isAvailable(p.availability, slot)).map((p) => p.id);
}

/**
 * Mirror of `listEligibleServersForSlot` (controller). Encapsula la matriz:
 *
 * | slot.mealWindow | ignoreAvailability | partial_server                                | server                  |
 * |-----------------|--------------------|-----------------------------------------------|-------------------------|
 * | false           | (cualquiera)       | sin filtro de horario                         | sin filtro              |
 * | true            | true               | sin filtro de horario                         | sin filtro              |
 * | true            | false              | solo si algún bloque cubre el slot (o legacy) | EXCLUIDO (están comiendo) |
 *
 * Política legacy-compatible: angelitos con 0 bloques registrados se
 * consideran disponibles siempre (preserva angelitos previos a la feature).
 */
type Candidate = {
	id: string;
	type: 'server' | 'partial_server';
	availability?: AvailabilityBlock[];
};
function listEligibleServersForSlot(
	pool: Candidate[],
	slot: Slot,
	ignoreAvailability = false,
): string[] {
	const out: string[] = [];
	for (const c of pool) {
		if (c.type === 'partial_server') {
			const blocks = c.availability ?? [];
			const covers =
				ignoreAvailability ||
				blocks.length === 0 ||
				blocks.some((b) => blockCoversSlot(b, slot));
			if (covers) out.push(c.id);
		} else {
			// servidor regular: en mealWindow con filtro activo, está comiendo → excluir.
			if (slot.mealWindow && !ignoreAvailability) continue;
			out.push(c.id);
		}
	}
	return out;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const D = (iso: string) => new Date(iso);
const block = (s: string, e: string): AvailabilityBlock => ({ startTime: D(s), endTime: D(e) });
const mkSlot = (id: string, s: string, e: string, meal = true): Slot => ({
	id,
	startTime: D(s),
	endTime: D(e),
	mealWindow: meal,
});

// ── replaceAll validation ─────────────────────────────────────────────────────
describe('participantAvailabilityService.replaceAll - validation', () => {
	it('accepts a list with valid blocks', () => {
		const out = normalizeBlocks([
			{ startTime: '2026-06-05T08:00:00.000Z', endTime: '2026-06-05T14:00:00.000Z' },
		]);
		expect(out).toHaveLength(1);
		expect(out[0].startTime.toISOString()).toBe('2026-06-05T08:00:00.000Z');
	});

	it('rejects when endTime <= startTime', () => {
		expect(() =>
			normalizeBlocks([
				{ startTime: '2026-06-05T14:00:00.000Z', endTime: '2026-06-05T08:00:00.000Z' },
			]),
		).toThrow(/endTime must be greater/);
	});

	it('rejects when endTime equals startTime (zero-length range)', () => {
		expect(() =>
			normalizeBlocks([
				{ startTime: '2026-06-05T08:00:00.000Z', endTime: '2026-06-05T08:00:00.000Z' },
			]),
		).toThrow(/endTime must be greater/);
	});

	it('rejects malformed dates', () => {
		expect(() =>
			normalizeBlocks([{ startTime: 'not-a-date', endTime: '2026-06-05T14:00:00.000Z' }]),
		).toThrow(/invalid datetime/);
	});

	it('returns empty array when input is empty (idempotent clear)', () => {
		const out = normalizeBlocks([]);
		expect(out).toHaveLength(0);
	});
});

// ── isAvailable matrix ────────────────────────────────────────────────────────
describe('autoAssignAngelitos.isAvailable - block covers slot', () => {
	const slot = mkSlot('s1', '2026-06-05T12:00:00.000Z', '2026-06-05T14:00:00.000Z');

	it('returns true with no blocks (legacy-compatible: opt-in filter)', () => {
		expect(isAvailable([], slot)).toBe(true);
		expect(isAvailable(undefined, slot)).toBe(true);
	});

	it('returns true when a block fully covers the slot', () => {
		expect(isAvailable([block('2026-06-05T08:00:00.000Z', '2026-06-05T18:00:00.000Z')], slot))
			.toBe(true);
	});

	it('returns true when block exactly equals slot bounds', () => {
		expect(isAvailable([block('2026-06-05T12:00:00.000Z', '2026-06-05T14:00:00.000Z')], slot))
			.toBe(true);
	});

	it('returns false when block starts after slot start', () => {
		expect(isAvailable([block('2026-06-05T13:00:00.000Z', '2026-06-05T18:00:00.000Z')], slot))
			.toBe(false);
	});

	it('returns false when block ends before slot end', () => {
		expect(isAvailable([block('2026-06-05T08:00:00.000Z', '2026-06-05T13:30:00.000Z')], slot))
			.toBe(false);
	});

	it('returns false when block is on a different day entirely', () => {
		expect(isAvailable([block('2026-06-06T08:00:00.000Z', '2026-06-06T18:00:00.000Z')], slot))
			.toBe(false);
	});

	it('returns true when ANY block covers the slot (multi-window angelito)', () => {
		const blocks = [
			block('2026-06-05T08:00:00.000Z', '2026-06-05T11:00:00.000Z'), // miss
			block('2026-06-05T11:30:00.000Z', '2026-06-05T15:00:00.000Z'), // covers
		];
		expect(isAvailable(blocks, slot)).toBe(true);
	});
});

// ── eligibleCandidates integration ────────────────────────────────────────────
describe('autoAssignAngelitos.candidates - filter by availability', () => {
	const slot = mkSlot('s1', '2026-06-05T12:00:00.000Z', '2026-06-05T14:00:00.000Z');

	it('returns angelitos whose blocks cover the slot, plus those without blocks (legacy)', () => {
		const pool = [
			{
				id: 'a1',
				availability: [block('2026-06-05T08:00:00.000Z', '2026-06-05T18:00:00.000Z')],
			},
			{
				id: 'a2',
				availability: [block('2026-06-06T08:00:00.000Z', '2026-06-06T18:00:00.000Z')],
			},
			{ id: 'a3', availability: [] }, // legacy opt-in: still eligible
		];
		expect(eligibleCandidates(pool, slot)).toEqual(['a1', 'a3']);
	});

	it('returns angelitos without blocks (legacy) when no one covers the slot', () => {
		const pool = [
			{ id: 'a1', availability: [block('2026-06-04T08:00:00.000Z', '2026-06-04T18:00:00.000Z')] },
			{ id: 'a2', availability: [] },
		];
		expect(eligibleCandidates(pool, slot)).toEqual(['a2']);
	});

	it('returns empty when ALL angelitos have blocks that miss the slot', () => {
		const pool = [
			{ id: 'a1', availability: [block('2026-06-04T08:00:00.000Z', '2026-06-04T18:00:00.000Z')] },
			{ id: 'a2', availability: [block('2026-06-06T08:00:00.000Z', '2026-06-06T18:00:00.000Z')] },
		];
		expect(eligibleCandidates(pool, slot)).toEqual([]);
	});

	it('handles angelitos with multiple blocks, picking those that match', () => {
		const pool = [
			{
				id: 'a1',
				availability: [
					block('2026-06-05T06:00:00.000Z', '2026-06-05T10:00:00.000Z'),
					block('2026-06-05T11:30:00.000Z', '2026-06-05T15:00:00.000Z'),
				],
			},
			{
				id: 'a2',
				availability: [block('2026-06-05T16:00:00.000Z', '2026-06-05T20:00:00.000Z')],
			},
		];
		expect(eligibleCandidates(pool, slot)).toEqual(['a1']);
	});
});

// ── listEligibleServersForSlot matrix ────────────────────────────────────────
describe('listEligibleServersForSlot - mealWindow + ignoreAvailability matrix', () => {
	const mealSlot: Slot = mkSlot('m', '2026-06-05T13:00:00.000Z', '2026-06-05T14:00:00.000Z', true);
	const adoreSlot: Slot = mkSlot('a', '2026-06-05T22:00:00.000Z', '2026-06-05T23:00:00.000Z', false);

	const pool: Candidate[] = [
		{ id: 's1', type: 'server' },
		{ id: 's2', type: 'server' },
		{
			id: 'a1',
			type: 'partial_server',
			availability: [block('2026-06-05T08:00:00.000Z', '2026-06-05T18:00:00.000Z')],
		},
		{
			id: 'a2',
			type: 'partial_server',
			availability: [block('2026-06-06T08:00:00.000Z', '2026-06-06T14:00:00.000Z')],
		},
		{ id: 'a3', type: 'partial_server', availability: [] }, // legacy
	];

	describe('non-mealWindow slot (Santísimo regular)', () => {
		it('shows all servers but still filters angelitos by their availability', () => {
			// adoreSlot es vie 22-23 UTC. a1 (vie 08-18) y a2 (sáb 08-14) NO cubren.
			// Solo a3 (legacy sin bloques) pasa el filtro de angelitos.
			const filtered = listEligibleServersForSlot(pool, adoreSlot, false);
			expect(filtered).toContain('s1');
			expect(filtered).toContain('s2');
			expect(filtered).toContain('a3');
			expect(filtered).not.toContain('a1');
			expect(filtered).not.toContain('a2');
		});

		it('with ignoreAvailability=true shows everyone in non-mealWindow', () => {
			expect(listEligibleServersForSlot(pool, adoreSlot, true).sort()).toEqual(
				['a1', 'a2', 'a3', 's1', 's2'].sort(),
			);
		});
	});

	describe('mealWindow slot, filter ON (ignoreAvailability=false)', () => {
		it('excludes regular servers (están comiendo)', () => {
			const result = listEligibleServersForSlot(pool, mealSlot, false);
			expect(result).not.toContain('s1');
			expect(result).not.toContain('s2');
		});

		it('includes only angelitos whose blocks cover the slot (+ legacy with no blocks)', () => {
			const result = listEligibleServersForSlot(pool, mealSlot, false);
			expect(result.sort()).toEqual(['a1', 'a3'].sort()); // a2 está fuera de horario
		});

		it('returns empty when no angelito covers the slot and no legacy angelito exists', () => {
			const onlyOutOfRange: Candidate[] = [
				{ id: 's1', type: 'server' },
				{
					id: 'a1',
					type: 'partial_server',
					availability: [block('2026-06-06T08:00:00.000Z', '2026-06-06T14:00:00.000Z')],
				},
			];
			expect(listEligibleServersForSlot(onlyOutOfRange, mealSlot, false)).toEqual([]);
		});
	});

	describe('mealWindow slot, filter OFF (ignoreAvailability=true)', () => {
		it('shows everyone: all servers + all angelitos including ones outside their availability', () => {
			expect(listEligibleServersForSlot(pool, mealSlot, true).sort()).toEqual(
				['a1', 'a2', 'a3', 's1', 's2'].sort(),
			);
		});
	});

	describe('use cases', () => {
		it('default behavior in admin signup modal: meal slot opens with filter ON → solo angelitos elegibles', () => {
			const result = listEligibleServersForSlot(pool, mealSlot, false);
			// solo angelitos
			expect(result.every((id) => id.startsWith('a'))).toBe(true);
			// los que cubren el slot (a1) y los legacy (a3); a2 fuera de horario excluido
			expect(result).toContain('a1');
			expect(result).toContain('a3');
			expect(result).not.toContain('a2');
		});

		it('user clicks "Quitar filtro" → mismo slot ahora muestra todos', () => {
			const filtered = listEligibleServersForSlot(pool, mealSlot, false);
			const unfiltered = listEligibleServersForSlot(pool, mealSlot, true);
			expect(unfiltered.length).toBeGreaterThan(filtered.length);
			expect(unfiltered).toEqual(expect.arrayContaining(filtered));
		});
	});
});
