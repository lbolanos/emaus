import { describe, it, expect } from 'vitest';
import {
	calculateAge,
	sortUnassigned,
	filterUnassignedBySearch,
	computeIncompatibleBedIds,
	getProgressColor,
} from '../bedAssignmentUtils';

describe('calculateAge', () => {
	it('returns null for nullish input', () => {
		expect(calculateAge(null)).toBeNull();
		expect(calculateAge(undefined)).toBeNull();
		expect(calculateAge('')).toBeNull();
	});

	it('calculates age from YYYY-MM-DD string without timezone shift', () => {
		const today = new Date();
		const yyyy = today.getFullYear() - 40;
		const birth = `${yyyy}-01-15`;
		const age = calculateAge(birth);
		// Should be 39 or 40 depending on current date
		expect(age === 39 || age === 40).toBe(true);
	});

	it('returns null for invalid date string', () => {
		expect(calculateAge('not-a-date')).toBeNull();
	});

	it('accepts a Date object', () => {
		const d = new Date();
		d.setFullYear(d.getFullYear() - 25);
		const age = calculateAge(d);
		expect(age === 24 || age === 25).toBe(true);
	});
});

describe('sortUnassigned', () => {
	const base = [
		{ id: '1', firstName: 'Carlos', lastName: 'Zurita', birthDate: '1990-05-10', snores: false, id_on_retreat: 3 },
		{ id: '2', firstName: 'Ana', lastName: 'Álvarez', birthDate: '1985-03-20', snores: true, id_on_retreat: 1 },
		{ id: '3', firstName: 'Bruno', lastName: 'Mendez', birthDate: '2000-12-01', snores: false, id_on_retreat: 2 },
	] as any;

	it('sorts by age (oldest first = earliest birthDate)', () => {
		const sorted = sortUnassigned(base, 'age');
		expect(sorted.map((p) => p.id)).toEqual(['2', '1', '3']);
	});

	it('sorts by idOnRetreat ascending; nulls go last', () => {
		const withNull = [...base, { id: '4', firstName: 'Xx', lastName: 'Yy', id_on_retreat: null } as any];
		const sorted = sortUnassigned(withNull, 'idOnRetreat');
		expect(sorted.map((p) => p.id)).toEqual(['2', '3', '1', '4']);
	});

	it('sorts by name using Spanish collation (accent-insensitive)', () => {
		const sorted = sortUnassigned(base, 'name');
		expect(sorted.map((p) => p.id)).toEqual(['2', '3', '1']);
	});

	it('sorts by snores (true first)', () => {
		const sorted = sortUnassigned(base, 'snores');
		expect(sorted[0].id).toBe('2');
	});

	it('does not mutate input array', () => {
		const copy = [...base];
		sortUnassigned(base, 'age');
		expect(base).toEqual(copy);
	});
});

describe('filterUnassignedBySearch', () => {
	const list = [
		{ id: '1', firstName: 'Juan', lastName: 'Perez', id_on_retreat: 10 },
		{ id: '2', firstName: 'Ana', lastName: 'Gomez', id_on_retreat: 11 },
		{ id: '3', firstName: 'Maria', lastName: 'Perez', id_on_retreat: 12 },
	] as any;

	it('returns the full list for empty query', () => {
		expect(filterUnassignedBySearch(list, '')).toHaveLength(3);
		expect(filterUnassignedBySearch(list, '   ')).toHaveLength(3);
	});

	it('matches by firstName (case-insensitive)', () => {
		const r = filterUnassignedBySearch(list, 'juan');
		expect(r).toHaveLength(1);
		expect(r[0].id).toBe('1');
	});

	it('matches by lastName', () => {
		const r = filterUnassignedBySearch(list, 'perez');
		expect(r.map((p) => p.id).sort()).toEqual(['1', '3']);
	});

	it('matches by id_on_retreat', () => {
		const r = filterUnassignedBySearch(list, '11');
		expect(r).toHaveLength(1);
		expect(r[0].id).toBe('2');
	});

	it('returns empty when nothing matches', () => {
		expect(filterUnassignedBySearch(list, 'zzz')).toHaveLength(0);
	});
});

describe('computeIncompatibleBedIds', () => {
	const makeBed = (id: string, room: string, floor: number, participant: any = null): any => ({
		id,
		roomNumber: room,
		bedNumber: id,
		floor,
		participant,
	});

	it('returns empty set when no participant tapped', () => {
		const beds = [makeBed('b1', '101', 1)];
		expect(computeIncompatibleBedIds(beds, null).size).toBe(0);
	});

	it('returns empty when the room has no other occupants', () => {
		const beds = [makeBed('b1', '101', 1), makeBed('b2', '101', 1)];
		const result = computeIncompatibleBedIds(beds, { id: 'p1', snores: false });
		expect(result.size).toBe(0);
	});

	it('marks empty beds as incompatible when room has opposite-snoring occupant', () => {
		const beds = [
			makeBed('b1', '101', 1, { id: 'p2', snores: true }),
			makeBed('b2', '101', 1),
			makeBed('b3', '102', 1, { id: 'p3', snores: false }),
			makeBed('b4', '102', 1),
		];
		// Tapped participant is non-snorer; room 101 has a snorer → b2 is incompatible
		// Room 102 has only non-snorer → b4 is compatible
		const result = computeIncompatibleBedIds(beds, { id: 'p1', snores: false });
		expect(result.has('b2')).toBe(true);
		expect(result.has('b4')).toBe(false);
	});

	it('does not mark the bed already occupied by the participant itself', () => {
		const beds = [
			makeBed('b1', '101', 1, { id: 'p1', snores: false }),
			makeBed('b2', '101', 1, { id: 'p2', snores: true }),
		];
		// No empty beds, so no incompatibles; and the logic should ignore tapped participant as occupant
		const result = computeIncompatibleBedIds(beds, { id: 'p1', snores: false });
		expect(result.size).toBe(0);
	});

	it('treats different floors with same room number as different rooms', () => {
		const beds = [
			makeBed('b1', '101', 1, { id: 'pA', snores: true }),
			makeBed('b2', '101', 2), // different floor — clean room
		];
		const result = computeIncompatibleBedIds(beds, { id: 'p1', snores: false });
		expect(result.has('b2')).toBe(false);
	});
});

describe('getProgressColor', () => {
	it('returns expected color for each threshold', () => {
		expect(getProgressColor(0)).toBe('bg-gray-300');
		expect(getProgressColor(5)).toBe('bg-orange-400');
		expect(getProgressColor(50)).toBe('bg-yellow-500');
		expect(getProgressColor(74)).toBe('bg-yellow-500');
		expect(getProgressColor(75)).toBe('bg-blue-500');
		expect(getProgressColor(99)).toBe('bg-blue-500');
		expect(getProgressColor(100)).toBe('bg-green-500');
		expect(getProgressColor(150)).toBe('bg-green-500');
	});
});
