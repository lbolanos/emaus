/**
 * Unit tests for AddEditHouseModal bed management logic.
 * Tests the pure algorithms for bed selection, room creation, and next-bed
 * context calculation without mounting the full component.
 */
import { describe, it, expect } from 'vitest';

// ─── Replicated pure functions from AddEditHouseModal.vue ────────────────────

interface Bed {
	id?: string;
	roomNumber: string;
	floor: number;
	bedNumber: string;
	type: 'normal' | 'litera_abajo' | 'litera_arriba' | 'colchon';
	defaultUsage: 'caminante' | 'servidor';
}

const incrementAlphanumeric = (value: string): string => {
	if (!value) return '1';
	const match = value.match(/^(.*?)(\d+)$/);
	if (match) {
		const prefix = match[1] || '';
		const number = parseInt(match[2], 10);
		return `${prefix}${number + 1}`;
	}
	const numValue = parseInt(value, 10);
	if (!isNaN(numValue)) return (numValue + 1).toString();
	return `${value}1`;
};

const findLastBedInLogicalOrder = (beds: Bed[]): Bed | null => {
	if (beds.length === 0) return null;

	const bedsByFloor: { [floor: number]: { [room: string]: Bed[] } } = {};
	beds.forEach((bed) => {
		const floor = bed.floor || 1;
		const room = bed.roomNumber || '1';
		if (!bedsByFloor[floor]) bedsByFloor[floor] = {};
		if (!bedsByFloor[floor][room]) bedsByFloor[floor][room] = [];
		bedsByFloor[floor][room].push(bed);
	});

	const floors = Object.keys(bedsByFloor)
		.map((f) => parseInt(f))
		.sort((a, b) => a - b);
	const lastFloor = floors[floors.length - 1];

	const roomsOnLastFloor = Object.keys(bedsByFloor[lastFloor]);
	const lastRoom = roomsOnLastFloor.sort((a, b) => {
		const aNum = parseInt(a);
		const bNum = parseInt(b);
		if (!isNaN(aNum) && !isNaN(bNum)) return aNum - bNum;
		return a.localeCompare(b);
	})[roomsOnLastFloor.length - 1];

	const bedsInLastRoom = bedsByFloor[lastFloor][lastRoom].sort((a, b) => {
		const aNum = parseInt(a.bedNumber.replace(/\D/g, ''));
		const bNum = parseInt(b.bedNumber.replace(/\D/g, ''));
		if (!isNaN(aNum) && !isNaN(bNum)) return aNum - bNum;
		return a.bedNumber.localeCompare(b.bedNumber);
	});

	return bedsInLastRoom[bedsInLastRoom.length - 1];
};

/** Mirrors selectBed(): given a bed index, compute the nextBedData fields */
const computeSelectBedContext = (beds: Bed[], index: number) => {
	const bed = beds[index];
	if (!bed) return null;

	const floor = bed.floor || 1;
	const room = bed.roomNumber || '1';

	const bedsInSameRoom = beds.filter(
		(b) => (b.floor || 1) === floor && (b.roomNumber || '1') === room
	);

	const sortedBeds = [...bedsInSameRoom].sort((a, b) => {
		const aNum = parseInt(a.bedNumber.replace(/\D/g, ''));
		const bNum = parseInt(b.bedNumber.replace(/\D/g, ''));
		if (!isNaN(aNum) && !isNaN(bNum)) return aNum - bNum;
		return a.bedNumber.localeCompare(b.bedNumber);
	});

	const lastBedInRoom = sortedBeds[sortedBeds.length - 1];
	const newBedNumber = incrementAlphanumeric(lastBedInRoom.bedNumber);

	return {
		floor,
		roomNumber: room,
		bedNumber: newBedNumber,
		type: bed.type,
		defaultUsage: bed.defaultUsage,
	};
};

const alphanumericCompare = (a: string, b: string): number => {
	const aNum = parseInt(a, 10);
	const bNum = parseInt(b, 10);
	if (!isNaN(aNum) && !isNaN(bNum)) return aNum - bNum;
	return a.localeCompare(b);
};

const groupedBeds = (beds: Bed[]): [number, (Bed & { index: number })[]][] => {
	const groups: Map<number, (Bed & { index: number })[]> = new Map();
	beds.forEach((bed, index) => {
		const floor = bed.floor || 1;
		if (!groups.has(floor)) groups.set(floor, []);
		groups.get(floor)!.push({ ...bed, index });
	});
	return [...groups.entries()].sort(([a], [b]) => a - b);
};

const groupBedsByRoom = (floorBeds: (Bed & { index: number })[]): [string, (Bed & { index: number })[]][] => {
	const rooms: Map<string, (Bed & { index: number })[]> = new Map();
	floorBeds.forEach(bed => {
		const roomNum = bed.roomNumber || '1';
		if (!rooms.has(roomNum)) rooms.set(roomNum, []);
		rooms.get(roomNum)!.push(bed);
	});
	return [...rooms.entries()]
		.sort(([a], [b]) => alphanumericCompare(a, b))
		.map(([roomNum, bs]) => [
			roomNum,
			[...bs].sort((a, b) => alphanumericCompare(a.bedNumber, b.bedNumber)),
		]);
};

/** Mirrors addNewRoom(): find next unused room number on the current floor */
const computeNextAvailableRoom = (beds: Bed[], currentFloor: number, currentRoom: string): string => {
	const existingRooms = new Set(
		beds
			.filter((b) => (b.floor || 1) === currentFloor)
			.map((b) => b.roomNumber || '1')
	);

	let candidateRoom = incrementAlphanumeric(currentRoom);
	let maxAttempts = 100;
	while (existingRooms.has(candidateRoom) && maxAttempts > 0) {
		candidateRoom = incrementAlphanumeric(candidateRoom);
		maxAttempts--;
	}
	return candidateRoom;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

const makeBed = (floor: number, room: string, bedNumber: string, overrides: Partial<Bed> = {}): Bed => ({
	floor,
	roomNumber: room,
	bedNumber,
	type: 'normal',
	defaultUsage: 'caminante',
	...overrides,
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('incrementAlphanumeric', () => {
	it('increments a simple numeric string', () => {
		expect(incrementAlphanumeric('1')).toBe('2');
		expect(incrementAlphanumeric('9')).toBe('10');
		expect(incrementAlphanumeric('99')).toBe('100');
	});

	it('increments a numeric suffix with alphabetic prefix', () => {
		expect(incrementAlphanumeric('A1')).toBe('A2');
		expect(incrementAlphanumeric('hab3')).toBe('hab4');
		expect(incrementAlphanumeric('room10')).toBe('room11');
	});

	it('returns "1" for empty string', () => {
		expect(incrementAlphanumeric('')).toBe('1');
	});

	it('appends "1" for purely alphabetic strings with no numeric part', () => {
		expect(incrementAlphanumeric('A')).toBe('A1');
		expect(incrementAlphanumeric('hab')).toBe('hab1');
	});

	it('handles string "0"', () => {
		expect(incrementAlphanumeric('0')).toBe('1');
	});
});

describe('findLastBedInLogicalOrder', () => {
	it('returns null for empty beds array', () => {
		expect(findLastBedInLogicalOrder([])).toBeNull();
	});

	it('returns the single bed when only one exists', () => {
		const beds = [makeBed(1, '1', '1')];
		expect(findLastBedInLogicalOrder(beds)).toEqual(beds[0]);
	});

	it('returns the bed with the highest floor', () => {
		const beds = [
			makeBed(1, '1', '1'),
			makeBed(2, '1', '1'),
			makeBed(3, '1', '1'),
		];
		expect(findLastBedInLogicalOrder(beds)?.floor).toBe(3);
	});

	it('returns the bed in the highest room on the highest floor', () => {
		const beds = [
			makeBed(1, '1', '1'),
			makeBed(1, '2', '1'),
			makeBed(1, '3', '2'),
		];
		const last = findLastBedInLogicalOrder(beds);
		expect(last?.floor).toBe(1);
		expect(last?.roomNumber).toBe('3');
		expect(last?.bedNumber).toBe('2');
	});

	it('ignores lower floors when higher floors exist', () => {
		const beds = [
			makeBed(1, '5', '10'), // high room/bed on low floor
			makeBed(2, '1', '1'),
		];
		const last = findLastBedInLogicalOrder(beds);
		expect(last?.floor).toBe(2);
		expect(last?.roomNumber).toBe('1');
	});

	it('returns the last bed numerically within the last room', () => {
		const beds = [
			makeBed(1, '1', '3'),
			makeBed(1, '1', '1'),
			makeBed(1, '1', '10'),
			makeBed(1, '1', '2'),
		];
		const last = findLastBedInLogicalOrder(beds);
		expect(last?.bedNumber).toBe('10');
	});
});

describe('computeSelectBedContext (selectBed logic)', () => {
	it('sets context to the clicked bed\'s floor and room', () => {
		const beds = [
			makeBed(1, '1', '1'),
			makeBed(1, '2', '1'),
			makeBed(1, '2', '2'),
		];
		// Click bed at index 1 (floor 1, room 2, bed 1)
		const ctx = computeSelectBedContext(beds, 1);
		expect(ctx?.floor).toBe(1);
		expect(ctx?.roomNumber).toBe('2');
	});

	it('sets next bed number as one after the highest in that room', () => {
		const beds = [
			makeBed(1, '2', '1'),
			makeBed(1, '2', '3'),
			makeBed(1, '2', '2'),
		];
		// Click any bed in room 2 — next should be 4
		const ctx = computeSelectBedContext(beds, 0);
		expect(ctx?.bedNumber).toBe('4');
	});

	it('inherits type and usage from the clicked bed', () => {
		const beds = [
			makeBed(1, '1', '1', { type: 'litera_abajo', defaultUsage: 'servidor' }),
		];
		const ctx = computeSelectBedContext(beds, 0);
		expect(ctx?.type).toBe('litera_abajo');
		expect(ctx?.defaultUsage).toBe('servidor');
	});

	it('targets the correct room when multiple rooms exist on same floor', () => {
		const beds = [
			makeBed(1, '1', '1'),
			makeBed(1, '1', '2'),
			makeBed(1, '3', '1'), // room 3
			makeBed(1, '3', '5'), // highest in room 3
		];
		// Click index 2 (room 3, bed 1) → next should be 6 (after bed 5)
		const ctx = computeSelectBedContext(beds, 2);
		expect(ctx?.roomNumber).toBe('3');
		expect(ctx?.bedNumber).toBe('6');
	});

	it('returns null for out-of-range index', () => {
		const beds = [makeBed(1, '1', '1')];
		expect(computeSelectBedContext(beds, 5)).toBeNull();
	});

	it('works correctly for beds on a different floor', () => {
		const beds = [
			makeBed(1, '1', '1'),
			makeBed(2, '1', '1'),
			makeBed(2, '1', '2'),
		];
		// Click index 1 (floor 2, room 1, bed 1) → next should be 3
		const ctx = computeSelectBedContext(beds, 1);
		expect(ctx?.floor).toBe(2);
		expect(ctx?.bedNumber).toBe('3');
	});
});

describe('computeNextAvailableRoom (addNewRoom logic)', () => {
	it('returns the next numeric room when it does not exist', () => {
		const beds = [makeBed(1, '1', '1')];
		expect(computeNextAvailableRoom(beds, 1, '1')).toBe('2');
	});

	it('skips rooms that already exist on the same floor', () => {
		const beds = [
			makeBed(1, '1', '1'),
			makeBed(1, '2', '1'),
			makeBed(1, '3', '1'),
		];
		// Current room is 1 → candidate 2 exists → candidate 3 exists → candidate 4 is free
		expect(computeNextAvailableRoom(beds, 1, '1')).toBe('4');
	});

	it('does not skip rooms from other floors', () => {
		const beds = [
			makeBed(1, '1', '1'), // floor 1, room 1 only
			makeBed(2, '2', '1'), // floor 2, room 2 — should NOT block floor 1
			makeBed(2, '3', '1'), // floor 2, room 3 — should NOT block floor 1
		];
		// On floor 1, only room 1 exists; rooms 2 and 3 are on floor 2 — not blocked
		expect(computeNextAvailableRoom(beds, 1, '1')).toBe('2');
	});

	it('handles gaps in room numbers (only skips existing, not gaps)', () => {
		const beds = [
			makeBed(1, '1', '1'),
			makeBed(1, '3', '1'), // room 2 is missing
		];
		// Current is room 1 → candidate 2 does NOT exist → use 2
		expect(computeNextAvailableRoom(beds, 1, '1')).toBe('2');
	});

	it('works with alphanumeric room identifiers', () => {
		const beds = [
			makeBed(1, 'A1', '1'),
			makeBed(1, 'A2', '1'),
		];
		expect(computeNextAvailableRoom(beds, 1, 'A1')).toBe('A3');
	});

	it('finds next room when current room is the only one on the floor', () => {
		const beds = [
			makeBed(1, '5', '1'),
			makeBed(2, '1', '1'), // different floor
		];
		expect(computeNextAvailableRoom(beds, 1, '5')).toBe('6');
	});
});

describe('alphanumericCompare', () => {
	it('sorts pure numbers numerically (not lexicographically)', () => {
		const rooms = ['10', '2', '1', '9'];
		expect([...rooms].sort(alphanumericCompare)).toEqual(['1', '2', '9', '10']);
	});

	it('sorts alphabetic strings with localeCompare', () => {
		const rooms = ['C', 'A', 'B'];
		expect([...rooms].sort(alphanumericCompare)).toEqual(['A', 'B', 'C']);
	});

	it('returns 0 for equal values', () => {
		expect(alphanumericCompare('3', '3')).toBe(0);
	});

	it('treats mixed alpha-numeric as strings (localeCompare)', () => {
		const rooms = ['A2', 'A10', 'A1'];
		// parseInt('A2') is NaN so falls back to localeCompare
		const sorted = [...rooms].sort(alphanumericCompare);
		expect(sorted).toEqual(['A1', 'A10', 'A2']);
	});
});

describe('groupedBeds (floor grouping and sort)', () => {
	it('returns an empty array for no beds', () => {
		expect(groupedBeds([])).toEqual([]);
	});

	it('groups beds by floor', () => {
		const beds = [
			makeBed(1, '1', '1'),
			makeBed(2, '1', '1'),
			makeBed(1, '2', '1'),
		];
		const result = groupedBeds(beds);
		expect(result).toHaveLength(2);
		expect(result[0][0]).toBe(1);
		expect(result[1][0]).toBe(2);
	});

	it('sorts floors numerically even when inserted out of order', () => {
		const beds = [
			makeBed(3, '1', '1'),
			makeBed(1, '1', '1'),
			makeBed(2, '1', '1'),
		];
		const result = groupedBeds(beds);
		expect(result.map(([f]) => f)).toEqual([1, 2, 3]);
	});

	it('preserves original array index in each bed entry', () => {
		const beds = [makeBed(1, '1', '1'), makeBed(2, '1', '1')];
		const result = groupedBeds(beds);
		const floor1Beds = result[0][1];
		expect(floor1Beds[0].index).toBe(0);
		const floor2Beds = result[1][1];
		expect(floor2Beds[0].index).toBe(1);
	});

	it('puts all beds from the same floor in the same group', () => {
		const beds = [
			makeBed(1, '1', '1'),
			makeBed(1, '1', '2'),
			makeBed(1, '2', '1'),
		];
		const result = groupedBeds(beds);
		expect(result).toHaveLength(1);
		expect(result[0][1]).toHaveLength(3);
	});
});

describe('groupBedsByRoom (room grouping, sort, and bed sort)', () => {
	const withIndex = (beds: Bed[]): (Bed & { index: number })[] =>
		beds.map((b, i) => ({ ...b, index: i }));

	it('returns an empty array for no floor beds', () => {
		expect(groupBedsByRoom([])).toEqual([]);
	});

	it('groups beds by room number', () => {
		const floorBeds = withIndex([
			makeBed(1, '1', '1'),
			makeBed(1, '2', '1'),
			makeBed(1, '1', '2'),
		]);
		const result = groupBedsByRoom(floorBeds);
		expect(result).toHaveLength(2);
		expect(result[0][0]).toBe('1');
		expect(result[0][1]).toHaveLength(2);
		expect(result[1][0]).toBe('2');
	});

	it('sorts rooms numerically even when inserted out of order', () => {
		const floorBeds = withIndex([
			makeBed(1, '3', '1'),
			makeBed(1, '1', '1'),
			makeBed(1, '10', '1'),
			makeBed(1, '2', '1'),
		]);
		const result = groupBedsByRoom(floorBeds);
		expect(result.map(([r]) => r)).toEqual(['1', '2', '3', '10']);
	});

	it('sorts beds within each room by bed number', () => {
		const floorBeds = withIndex([
			makeBed(1, '1', '3'),
			makeBed(1, '1', '1'),
			makeBed(1, '1', '10'),
			makeBed(1, '1', '2'),
		]);
		const result = groupBedsByRoom(floorBeds);
		const bedNumbers = result[0][1].map((b) => b.bedNumber);
		expect(bedNumbers).toEqual(['1', '2', '3', '10']);
	});

	it('does not mutate the original floorBeds array', () => {
		const floorBeds = withIndex([
			makeBed(1, '2', '1'),
			makeBed(1, '1', '1'),
		]);
		const original = floorBeds.map((b) => b.roomNumber);
		groupBedsByRoom(floorBeds);
		expect(floorBeds.map((b) => b.roomNumber)).toEqual(original);
	});
});
