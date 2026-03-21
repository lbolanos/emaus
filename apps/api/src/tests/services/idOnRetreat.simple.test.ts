// Tests for idOnRetreat fix: type coercion, virtual field serialization,
// auto-generation logic, and import/confirm paths.
// Pure function tests — no database dependencies.

// ==================== mapToEnglishKeys id_on_retreat coercion ====================

/**
 * Replicates the fixed mapToEnglishKeys id_on_retreat logic from participantService.ts.
 * Before the fix: `id_on_retreat: str(participant.id)` — returned string "123"
 * After the fix: returns number 123 or undefined
 */
function mapIdOnRetreat(participantId: any): number | undefined {
	return participantId != null
		? parseInt(String(participantId).trim(), 10) || undefined
		: undefined;
}

/**
 * Simulates toJSON() with virtual field inclusion (the fix).
 * Before: virtual fields could be stripped by destructuring.
 * After: explicit assignment ensures they survive serialization.
 */
function toJSONWithVirtualFields(entity: any): any {
	const { ...plainObject } = entity;

	// Computed properties (existing behavior)
	plainObject.totalPaid = entity.totalPaid ?? 0;

	// Fix: ensure virtual fields from retreat_participants are present
	if (entity.id_on_retreat !== undefined) plainObject.id_on_retreat = entity.id_on_retreat;
	if (entity.type !== undefined) plainObject.type = entity.type;

	return plainObject;
}

/**
 * Simulates getNextIdOnRetreat logic.
 * Given a list of existing idOnRetreat values, returns MAX+1.
 */
function getNextIdFromValues(existingIds: (number | null)[]): number {
	const maxId = existingIds.reduce<number>((max, id) => {
		return id != null && id > max ? id : max;
	}, 0);
	return maxId + 1;
}

/**
 * Simulates the import existing-participant path for idOnRetreat assignment.
 * Before: `idOnRetreat: newIdOnRetreat ?? null` — left null when import lacked ID.
 * After: auto-generates when not provided.
 */
function resolveIdOnRetreat(
	newIdOnRetreat: any,
	existingIdOnRetreat: number | null,
	nextAutoId: number,
): number | null {
	if (newIdOnRetreat != null) {
		return typeof newIdOnRetreat === 'string'
			? parseInt(newIdOnRetreat, 10) || existingIdOnRetreat
			: newIdOnRetreat;
	} else if (existingIdOnRetreat == null) {
		return nextAutoId;
	}
	return existingIdOnRetreat;
}

// ==================== TESTS ====================

describe('idOnRetreat Fix — mapToEnglishKeys type coercion', () => {
	test('numeric string "123" returns number 123', () => {
		expect(mapIdOnRetreat('123')).toBe(123);
	});

	test('number 42 returns number 42', () => {
		expect(mapIdOnRetreat(42)).toBe(42);
	});

	test('padded string "  7  " returns number 7', () => {
		expect(mapIdOnRetreat('  7  ')).toBe(7);
	});

	test('null returns undefined', () => {
		expect(mapIdOnRetreat(null)).toBeUndefined();
	});

	test('undefined returns undefined', () => {
		expect(mapIdOnRetreat(undefined)).toBeUndefined();
	});

	test('empty string "" returns undefined (parseInt gives NaN, || undefined)', () => {
		expect(mapIdOnRetreat('')).toBeUndefined();
	});

	test('non-numeric string "abc" returns undefined', () => {
		expect(mapIdOnRetreat('abc')).toBeUndefined();
	});

	test('zero "0" returns undefined (falsy after parseInt)', () => {
		// 0 is falsy so `|| undefined` kicks in — this is acceptable because
		// retreat IDs should be positive integers (Zod: z.number().int().positive())
		expect(mapIdOnRetreat('0')).toBeUndefined();
	});

	test('float "3.7" returns 3 (parseInt truncates)', () => {
		expect(mapIdOnRetreat('3.7')).toBe(3);
	});

	test('Excel numeric cell (number type) passes through correctly', () => {
		// Excel cells can be raw numbers
		expect(mapIdOnRetreat(1)).toBe(1);
		expect(mapIdOnRetreat(999)).toBe(999);
	});

	test('negative number returns the number (not positive-validated here)', () => {
		// Zod schema validates positivity; mapToEnglishKeys just converts type
		expect(mapIdOnRetreat(-5)).toBe(-5);
	});
});

describe('idOnRetreat Fix — toJSON virtual field serialization', () => {
	test('includes id_on_retreat when set on entity', () => {
		const entity = {
			id: 'p-001',
			firstName: 'Juan',
			totalPaid: 100,
			id_on_retreat: 42,
			type: 'walker',
		};

		const json = toJSONWithVirtualFields(entity);

		expect(json.id_on_retreat).toBe(42);
		expect(json.type).toBe('walker');
	});

	test('does not overwrite id_on_retreat when undefined on entity', () => {
		const entity = {
			id: 'p-001',
			firstName: 'Juan',
			totalPaid: 0,
			id_on_retreat: undefined,
			type: undefined,
		};

		const json = toJSONWithVirtualFields(entity);

		// The spread copies the key with undefined value, but the conditional
		// `if (entity.id_on_retreat !== undefined)` prevents forced assignment.
		// The key may still exist from the spread, but its value is undefined.
		expect(json.id_on_retreat).toBeUndefined();
		expect(json.type).toBeUndefined();

		// When serialized to JSON, undefined values are stripped
		const parsed = JSON.parse(JSON.stringify(json));
		expect('id_on_retreat' in parsed).toBe(false);
		expect('type' in parsed).toBe(false);
	});

	test('preserves id_on_retreat=0 edge case (truthy check vs undefined check)', () => {
		const entity = {
			id: 'p-001',
			firstName: 'Juan',
			totalPaid: 0,
			id_on_retreat: 0, // edge case: 0 is defined but falsy
			type: 'server',
		};

		const json = toJSONWithVirtualFields(entity);

		// 0 !== undefined, so it should be included
		expect(json.id_on_retreat).toBe(0);
		expect(json.type).toBe('server');
	});

	test('all participant types are serialized correctly', () => {
		const types = ['walker', 'server', 'waiting', 'partial_server'] as const;

		for (const type of types) {
			const entity = { id: 'p-001', totalPaid: 0, id_on_retreat: 1, type };
			const json = toJSONWithVirtualFields(entity);
			expect(json.type).toBe(type);
		}
	});
});

describe('idOnRetreat Fix — getNextIdOnRetreat helper logic', () => {
	test('returns 1 when no existing IDs', () => {
		expect(getNextIdFromValues([])).toBe(1);
	});

	test('returns MAX+1 with existing IDs', () => {
		expect(getNextIdFromValues([1, 2, 3])).toBe(4);
	});

	test('returns MAX+1 with non-sequential IDs', () => {
		expect(getNextIdFromValues([5, 10, 3])).toBe(11);
	});

	test('ignores null values in the list', () => {
		expect(getNextIdFromValues([null, 2, null, 5, null])).toBe(6);
	});

	test('returns 1 when all values are null', () => {
		expect(getNextIdFromValues([null, null, null])).toBe(1);
	});

	test('handles single existing ID', () => {
		expect(getNextIdFromValues([42])).toBe(43);
	});
});

describe('idOnRetreat Fix — import existing-participant path', () => {
	const NEXT_AUTO_ID = 10; // simulated MAX+1

	describe('when newIdOnRetreat is provided', () => {
		test('numeric value is used directly', () => {
			expect(resolveIdOnRetreat(7, null, NEXT_AUTO_ID)).toBe(7);
		});

		test('string numeric value is parsed to number', () => {
			expect(resolveIdOnRetreat('15', null, NEXT_AUTO_ID)).toBe(15);
		});

		test('invalid string falls back to existing value', () => {
			expect(resolveIdOnRetreat('abc', 5, NEXT_AUTO_ID)).toBe(5);
		});

		test('invalid string with null existing returns null', () => {
			expect(resolveIdOnRetreat('abc', null, NEXT_AUTO_ID)).toBeNull();
		});
	});

	describe('when newIdOnRetreat is null/undefined (import without ID column)', () => {
		test('auto-generates when existing is also null', () => {
			expect(resolveIdOnRetreat(null, null, NEXT_AUTO_ID)).toBe(NEXT_AUTO_ID);
		});

		test('auto-generates when existing is also null (undefined variant)', () => {
			expect(resolveIdOnRetreat(undefined, null, NEXT_AUTO_ID)).toBe(NEXT_AUTO_ID);
		});

		test('keeps existing value when it is already set', () => {
			expect(resolveIdOnRetreat(null, 5, NEXT_AUTO_ID)).toBe(5);
		});

		test('keeps existing value when undefined provided', () => {
			expect(resolveIdOnRetreat(undefined, 42, NEXT_AUTO_ID)).toBe(42);
		});
	});
});

describe('idOnRetreat Fix — confirmExistingParticipant path', () => {
	/**
	 * Simulates the confirmExistingParticipant logic for idOnRetreat:
	 * - New RP record: always set idOnRetreat to nextId
	 * - Existing RP record: backfill if null, leave alone if already set
	 */
	function confirmIdOnRetreat(
		existingRpIdOnRetreat: number | null | undefined,
		nextId: number,
		isNewRecord: boolean,
	): number {
		if (isNewRecord) {
			return nextId;
		}
		// Existing record: backfill only if null
		if (existingRpIdOnRetreat == null) {
			return nextId;
		}
		return existingRpIdOnRetreat;
	}

	test('new RP record gets auto-generated ID', () => {
		expect(confirmIdOnRetreat(null, 5, true)).toBe(5);
	});

	test('new RP record ignores any "existing" value (always uses nextId)', () => {
		expect(confirmIdOnRetreat(99, 5, true)).toBe(5);
	});

	test('existing RP with null idOnRetreat gets backfilled', () => {
		expect(confirmIdOnRetreat(null, 5, false)).toBe(5);
	});

	test('existing RP with undefined idOnRetreat gets backfilled', () => {
		expect(confirmIdOnRetreat(undefined, 5, false)).toBe(5);
	});

	test('existing RP with valid idOnRetreat is preserved', () => {
		expect(confirmIdOnRetreat(42, 5, false)).toBe(42);
	});
});

describe('idOnRetreat Fix — migration backfill logic', () => {
	/**
	 * Simulates the migration backfill: for a retreat, find null rows
	 * ordered by createdAt, assign sequential IDs starting from MAX+1.
	 */
	function backfillNulls(
		rows: { id: string; idOnRetreat: number | null; createdAt: string }[],
	): { id: string; idOnRetreat: number }[] {
		const maxExisting = rows.reduce<number>((max, r) => {
			return r.idOnRetreat != null && r.idOnRetreat > max ? r.idOnRetreat : max;
		}, 0);

		let nextId = maxExisting + 1;
		const sorted = rows
			.filter((r) => r.idOnRetreat == null)
			.sort((a, b) => a.createdAt.localeCompare(b.createdAt));

		return sorted.map((r) => ({ id: r.id, idOnRetreat: nextId++ }));
	}

	test('backfills null rows starting from MAX+1', () => {
		const rows = [
			{ id: 'a', idOnRetreat: 1, createdAt: '2024-01-01' },
			{ id: 'b', idOnRetreat: 3, createdAt: '2024-01-02' },
			{ id: 'c', idOnRetreat: null, createdAt: '2024-01-03' },
			{ id: 'd', idOnRetreat: null, createdAt: '2024-01-04' },
		];

		const result = backfillNulls(rows);

		expect(result).toEqual([
			{ id: 'c', idOnRetreat: 4 },
			{ id: 'd', idOnRetreat: 5 },
		]);
	});

	test('backfills starting from 1 when all are null', () => {
		const rows = [
			{ id: 'a', idOnRetreat: null, createdAt: '2024-01-02' },
			{ id: 'b', idOnRetreat: null, createdAt: '2024-01-01' },
		];

		const result = backfillNulls(rows);

		// Sorted by createdAt, so 'b' first
		expect(result).toEqual([
			{ id: 'b', idOnRetreat: 1 },
			{ id: 'a', idOnRetreat: 2 },
		]);
	});

	test('returns empty array when no nulls', () => {
		const rows = [
			{ id: 'a', idOnRetreat: 1, createdAt: '2024-01-01' },
			{ id: 'b', idOnRetreat: 2, createdAt: '2024-01-02' },
		];

		expect(backfillNulls(rows)).toEqual([]);
	});

	test('handles single null row', () => {
		const rows = [
			{ id: 'a', idOnRetreat: 10, createdAt: '2024-01-01' },
			{ id: 'b', idOnRetreat: null, createdAt: '2024-01-05' },
		];

		expect(backfillNulls(rows)).toEqual([{ id: 'b', idOnRetreat: 11 }]);
	});

	test('orders by createdAt for deterministic assignment', () => {
		const rows = [
			{ id: 'late', idOnRetreat: null, createdAt: '2024-06-15' },
			{ id: 'early', idOnRetreat: null, createdAt: '2024-01-01' },
			{ id: 'mid', idOnRetreat: null, createdAt: '2024-03-10' },
		];

		const result = backfillNulls(rows);

		expect(result[0].id).toBe('early');
		expect(result[1].id).toBe('mid');
		expect(result[2].id).toBe('late');
		expect(result.map((r) => r.idOnRetreat)).toEqual([1, 2, 3]);
	});
});
