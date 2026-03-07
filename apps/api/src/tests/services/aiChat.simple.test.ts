/**
 * AI Chat Service - Pure Logic Tests
 *
 * Tests the extracted business logic from aiChatService without DB or AI SDK dependencies.
 * Follows the same pattern as fieldMapping.simple.test.ts.
 */

// ---- Extracted logic: birthday date matching (string-based, timezone-safe) ----

const toYMD = (d: Date | string): string => {
	const s = typeof d === 'string' ? d : d.toISOString();
	return s.split('T')[0]; // "YYYY-MM-DD"
};

function filterBirthdays(
	startDate: string,
	endDate: string,
	participants: Array<{ birthDate: string | Date | null }>,
): number[] {
	const startMMDD = startDate.slice(5);
	const endMMDD = endDate.slice(5);
	const indices: number[] = [];
	participants.forEach((p, i) => {
		if (!p.birthDate) return;
		const birthStr = toYMD(p.birthDate);
		const birthMMDD = birthStr.slice(5);
		if (startMMDD <= endMMDD) {
			if (birthMMDD >= startMMDD && birthMMDD <= endMMDD) indices.push(i);
		} else {
			if (birthMMDD >= startMMDD || birthMMDD <= endMMDD) indices.push(i);
		}
	});
	return indices;
}

// ---- Extracted logic: snoring conflict detection ----

interface BedEntry {
	roomNumber: string;
	floor?: number;
	type: string;
	participant?: { firstName: string; lastName: string; snores: boolean; birthDate: string } | null;
}

function detectSnoringConflicts(beds: BedEntry[]) {
	const roomMap = new Map<string, { snorers: string[]; nonSnorers: string[] }>();
	for (const b of beds) {
		if (!b.participant) continue;
		const name = `${b.participant.firstName} ${b.participant.lastName}`;
		const key = `${b.floor ?? ''}-${b.roomNumber}`;
		if (!roomMap.has(key)) roomMap.set(key, { snorers: [], nonSnorers: [] });
		const room = roomMap.get(key)!;
		if (b.participant.snores) {
			room.snorers.push(name);
		} else {
			room.nonSnorers.push(name);
		}
	}
	return Array.from(roomMap.entries())
		.filter(([, r]) => r.snorers.length > 0 && r.nonSnorers.length > 0)
		.map(([key, r]) => ({ room: key, snorers: r.snorers, nonSnorers: r.nonSnorers }));
}

// ---- Extracted logic: age conflict detection (older people on upper bunks) ----

function getAge(birthDate: Date | string | null | undefined, now: Date = new Date()): number | null {
	if (!birthDate) return null;
	const birth = new Date(birthDate);
	let age = now.getFullYear() - birth.getFullYear();
	const m = now.getMonth() - birth.getMonth();
	if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--;
	return age;
}

function detectAgeConflicts(beds: BedEntry[], now: Date = new Date()) {
	const conflicts: { name: string; age: number; room: string }[] = [];
	for (const b of beds) {
		if (!b.participant) continue;
		const age = getAge(b.participant.birthDate, now);
		if (b.type === 'litera_arriba' && age !== null && age >= 50) {
			conflicts.push({
				name: `${b.participant.firstName} ${b.participant.lastName}`,
				age,
				room: b.roomNumber,
			});
		}
	}
	return conflicts;
}

// ---- Extracted logic: palancas filtering ----

interface PalancaParticipant {
	firstName: string;
	lastName: string;
	type: string;
	palancasReceived?: string | null;
	palancasRequested?: boolean | null;
	palancasCoordinator?: string | null;
}

function filterPalancas(participants: PalancaParticipant[]) {
	const walkers = participants.filter((p) => p.type === 'walker');
	const withPalancas = walkers.filter((p) => p.palancasReceived && p.palancasReceived.trim() !== '');
	const withoutPalancas = walkers.filter((p) => !p.palancasReceived || p.palancasReceived.trim() === '');
	const requested = walkers.filter((p) => p.palancasRequested);
	return { totalWalkers: walkers.length, withPalancas: withPalancas.length, withoutPalancas: withoutPalancas.length, requested: requested.length };
}

// ---- Extracted logic: isConfigured ----

function isConfigured(ai: { provider: string; anthropicApiKey?: string; googleApiKey?: string; openaiApiKey?: string }): boolean {
	switch (ai.provider) {
		case 'anthropic':
			return !!ai.anthropicApiKey;
		case 'google':
			return !!ai.googleApiKey;
		case 'openai':
			return !!ai.openaiApiKey;
		default:
			return false;
	}
}

// ============= TESTS =============

describe('AI Chat Service - Pure Logic Tests', () => {
	describe('Birthday During Retreat', () => {
		const participants = [
			{ birthDate: '1988-02-20' }, // Feb 20
			{ birthDate: '1990-02-15' }, // Feb 15
			{ birthDate: '1995-03-01' }, // Mar 1
			{ birthDate: '1985-02-13' }, // Feb 13
			{ birthDate: null },
			{ birthDate: '2000-12-30' }, // Dec 30
			{ birthDate: '1992-01-02' }, // Jan 2
		];

		test('should find birthdays within retreat date range', () => {
			const result = filterBirthdays('2026-02-13', '2026-02-22', participants);
			// Feb 13, 15, 20 are within range
			expect(result).toEqual([0, 1, 3]);
		});

		test('should exclude birthdays outside range', () => {
			const result = filterBirthdays('2026-02-13', '2026-02-22', participants);
			// Mar 1 (index 2) is outside, null (4) is skipped, Dec 30 (5) is outside, Jan 2 (6) is outside
			expect(result).not.toContain(2);
			expect(result).not.toContain(4);
			expect(result).not.toContain(5);
			expect(result).not.toContain(6);
		});

		test('should handle year boundary retreat (Dec-Jan)', () => {
			const result = filterBirthdays('2025-12-28', '2026-01-03', participants);
			// Dec 30 and Jan 2 should match
			expect(result).toEqual([5, 6]);
		});

		test('should handle single-day retreat', () => {
			const result = filterBirthdays('2026-02-20', '2026-02-20', participants);
			expect(result).toEqual([0]); // Only Feb 20
		});

		test('should skip participants with null birthDate', () => {
			const result = filterBirthdays('2026-01-01', '2026-12-31', participants);
			expect(result).not.toContain(4);
		});

		test('should handle Date objects as birthDate', () => {
			const withDateObj = [{ birthDate: new Date('1988-02-20T00:00:00Z') }];
			const result = filterBirthdays('2026-02-18', '2026-02-22', withDateObj);
			expect(result).toEqual([0]);
		});

		test('should include boundary dates (start and end)', () => {
			const result = filterBirthdays('2026-02-15', '2026-02-20', participants);
			expect(result).toContain(0); // Feb 20 (end boundary)
			expect(result).toContain(1); // Feb 15 (start boundary)
		});
	});

	describe('Snoring Conflict Detection', () => {
		test('should detect rooms with mixed snoring', () => {
			const beds: BedEntry[] = [
				{ roomNumber: '101', floor: 1, type: 'normal', participant: { firstName: 'Juan', lastName: 'Perez', snores: true, birthDate: '1980-01-01' } },
				{ roomNumber: '101', floor: 1, type: 'normal', participant: { firstName: 'Pedro', lastName: 'Lopez', snores: false, birthDate: '1985-01-01' } },
			];
			const conflicts = detectSnoringConflicts(beds);
			expect(conflicts).toHaveLength(1);
			expect(conflicts[0].room).toBe('1-101');
			expect(conflicts[0].snorers).toEqual(['Juan Perez']);
			expect(conflicts[0].nonSnorers).toEqual(['Pedro Lopez']);
		});

		test('should not flag rooms where everyone snores', () => {
			const beds: BedEntry[] = [
				{ roomNumber: '101', floor: 1, type: 'normal', participant: { firstName: 'Juan', lastName: 'A', snores: true, birthDate: '1980-01-01' } },
				{ roomNumber: '101', floor: 1, type: 'normal', participant: { firstName: 'Pedro', lastName: 'B', snores: true, birthDate: '1985-01-01' } },
			];
			const conflicts = detectSnoringConflicts(beds);
			expect(conflicts).toHaveLength(0);
		});

		test('should not flag rooms where nobody snores', () => {
			const beds: BedEntry[] = [
				{ roomNumber: '101', floor: 1, type: 'normal', participant: { firstName: 'Juan', lastName: 'A', snores: false, birthDate: '1980-01-01' } },
				{ roomNumber: '101', floor: 1, type: 'normal', participant: { firstName: 'Pedro', lastName: 'B', snores: false, birthDate: '1985-01-01' } },
			];
			const conflicts = detectSnoringConflicts(beds);
			expect(conflicts).toHaveLength(0);
		});

		test('should skip unassigned beds', () => {
			const beds: BedEntry[] = [
				{ roomNumber: '101', floor: 1, type: 'normal', participant: { firstName: 'Juan', lastName: 'A', snores: true, birthDate: '1980-01-01' } },
				{ roomNumber: '101', floor: 1, type: 'normal', participant: null },
			];
			const conflicts = detectSnoringConflicts(beds);
			expect(conflicts).toHaveLength(0); // Only one person, no conflict
		});

		test('should handle multiple rooms independently', () => {
			const beds: BedEntry[] = [
				{ roomNumber: '101', floor: 1, type: 'normal', participant: { firstName: 'Juan', lastName: 'A', snores: true, birthDate: '1980-01-01' } },
				{ roomNumber: '101', floor: 1, type: 'normal', participant: { firstName: 'Pedro', lastName: 'B', snores: false, birthDate: '1985-01-01' } },
				{ roomNumber: '102', floor: 1, type: 'normal', participant: { firstName: 'Carlos', lastName: 'C', snores: true, birthDate: '1980-01-01' } },
				{ roomNumber: '102', floor: 1, type: 'normal', participant: { firstName: 'Luis', lastName: 'D', snores: true, birthDate: '1985-01-01' } },
			];
			const conflicts = detectSnoringConflicts(beds);
			expect(conflicts).toHaveLength(1); // Only room 101
			expect(conflicts[0].room).toBe('1-101');
		});
	});

	describe('Age Conflict Detection (Upper Bunk)', () => {
		const now = new Date('2026-03-07');

		test('should detect person 50+ on upper bunk', () => {
			const beds: BedEntry[] = [
				{ roomNumber: '101', floor: 1, type: 'litera_arriba', participant: { firstName: 'Maria', lastName: 'Garcia', snores: false, birthDate: '1970-06-15' } },
			];
			const conflicts = detectAgeConflicts(beds, now);
			expect(conflicts).toHaveLength(1);
			expect(conflicts[0].name).toBe('Maria Garcia');
			expect(conflicts[0].age).toBe(55);
		});

		test('should not flag person under 50 on upper bunk', () => {
			const beds: BedEntry[] = [
				{ roomNumber: '101', floor: 1, type: 'litera_arriba', participant: { firstName: 'Ana', lastName: 'Lopez', snores: false, birthDate: '1990-01-01' } },
			];
			const conflicts = detectAgeConflicts(beds, now);
			expect(conflicts).toHaveLength(0);
		});

		test('should not flag person 50+ on normal bed', () => {
			const beds: BedEntry[] = [
				{ roomNumber: '101', floor: 1, type: 'normal', participant: { firstName: 'Maria', lastName: 'Garcia', snores: false, birthDate: '1970-06-15' } },
			];
			const conflicts = detectAgeConflicts(beds, now);
			expect(conflicts).toHaveLength(0);
		});

		test('should not flag person 50+ on lower bunk', () => {
			const beds: BedEntry[] = [
				{ roomNumber: '101', floor: 1, type: 'litera_abajo', participant: { firstName: 'Maria', lastName: 'Garcia', snores: false, birthDate: '1970-06-15' } },
			];
			const conflicts = detectAgeConflicts(beds, now);
			expect(conflicts).toHaveLength(0);
		});

		test('should skip unassigned beds', () => {
			const beds: BedEntry[] = [
				{ roomNumber: '101', floor: 1, type: 'litera_arriba', participant: null },
			];
			const conflicts = detectAgeConflicts(beds, now);
			expect(conflicts).toHaveLength(0);
		});

		test('should detect exactly 50 years old', () => {
			const beds: BedEntry[] = [
				{ roomNumber: '101', floor: 1, type: 'litera_arriba', participant: { firstName: 'Rosa', lastName: 'M', snores: false, birthDate: '1976-03-07' } },
			];
			const conflicts = detectAgeConflicts(beds, now);
			expect(conflicts).toHaveLength(1);
			expect(conflicts[0].age).toBe(50);
		});

		test('should not flag person turning 50 later this year', () => {
			const beds: BedEntry[] = [
				{ roomNumber: '101', floor: 1, type: 'litera_arriba', participant: { firstName: 'Rosa', lastName: 'M', snores: false, birthDate: '1976-12-01' } },
			];
			const conflicts = detectAgeConflicts(beds, now);
			expect(conflicts).toHaveLength(0); // Still 49
		});
	});

	describe('Palancas Filtering', () => {
		const participants: PalancaParticipant[] = [
			{ firstName: 'Juan', lastName: 'A', type: 'walker', palancasReceived: 'carta de mama', palancasRequested: true, palancasCoordinator: 'Pedro' },
			{ firstName: 'Maria', lastName: 'B', type: 'walker', palancasReceived: null, palancasRequested: true, palancasCoordinator: 'Ana' },
			{ firstName: 'Carlos', lastName: 'C', type: 'walker', palancasReceived: '', palancasRequested: false, palancasCoordinator: null },
			{ firstName: 'Luis', lastName: 'D', type: 'server', palancasReceived: null, palancasRequested: false, palancasCoordinator: null },
			{ firstName: 'Ana', lastName: 'E', type: 'walker', palancasReceived: '  ', palancasRequested: false, palancasCoordinator: null },
		];

		test('should count only walkers', () => {
			const result = filterPalancas(participants);
			expect(result.totalWalkers).toBe(4); // Luis is server
		});

		test('should identify walkers with palancas', () => {
			const result = filterPalancas(participants);
			expect(result.withPalancas).toBe(1); // Only Juan
		});

		test('should identify walkers without palancas', () => {
			const result = filterPalancas(participants);
			expect(result.withoutPalancas).toBe(3); // Maria (null), Carlos (empty), Ana (whitespace)
		});

		test('should count requested palancas', () => {
			const result = filterPalancas(participants);
			expect(result.requested).toBe(2); // Juan and Maria
		});

		test('should treat whitespace-only as no palancas', () => {
			const result = filterPalancas(participants);
			// Ana has '  ' (whitespace only) - should count as withoutPalancas
			expect(result.withoutPalancas).toBe(3);
		});
	});

	describe('isConfigured', () => {
		test('should return true for anthropic with API key', () => {
			expect(isConfigured({ provider: 'anthropic', anthropicApiKey: 'sk-ant-123' })).toBe(true);
		});

		test('should return false for anthropic without API key', () => {
			expect(isConfigured({ provider: 'anthropic' })).toBe(false);
		});

		test('should return true for openai with API key', () => {
			expect(isConfigured({ provider: 'openai', openaiApiKey: 'sk-123' })).toBe(true);
		});

		test('should return false for openai without API key', () => {
			expect(isConfigured({ provider: 'openai' })).toBe(false);
		});

		test('should return true for google with API key', () => {
			expect(isConfigured({ provider: 'google', googleApiKey: 'gk-123' })).toBe(true);
		});

		test('should return false for google without API key', () => {
			expect(isConfigured({ provider: 'google' })).toBe(false);
		});

		test('should return false for unknown provider', () => {
			expect(isConfigured({ provider: 'unknown' })).toBe(false);
		});

		test('should return false for empty API key', () => {
			expect(isConfigured({ provider: 'anthropic', anthropicApiKey: '' })).toBe(false);
		});
	});

	describe('toYMD helper', () => {
		test('should extract YYYY-MM-DD from ISO string', () => {
			expect(toYMD('1988-02-20T00:00:00.000Z')).toBe('1988-02-20');
		});

		test('should keep plain date string as-is', () => {
			expect(toYMD('1988-02-20')).toBe('1988-02-20');
		});

		test('should convert Date object to YYYY-MM-DD', () => {
			expect(toYMD(new Date('1988-02-20T00:00:00Z'))).toBe('1988-02-20');
		});
	});

	describe('getAge helper', () => {
		const now = new Date('2026-03-07');

		test('should calculate age correctly', () => {
			expect(getAge('1988-02-20', now)).toBe(38);
		});

		test('should handle birthday not yet passed this year', () => {
			expect(getAge('1988-12-20', now)).toBe(37);
		});

		test('should handle birthday today', () => {
			expect(getAge('1988-03-07', now)).toBe(38);
		});

		test('should return null for null birthDate', () => {
			expect(getAge(null)).toBeNull();
		});

		test('should return null for undefined birthDate', () => {
			expect(getAge(undefined)).toBeNull();
		});
	});
});
