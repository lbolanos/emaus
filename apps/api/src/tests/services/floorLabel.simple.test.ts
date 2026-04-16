// Tests for floorLabel (sector) grouping and propagation logic
// Pure function tests — no database dependencies

// ---------------------------------------------------------------------------
// Helpers replicated from source files for isolated testing
// ---------------------------------------------------------------------------

/** Composite key used throughout the codebase to group beds by floor+sector */
const makeSectorKey = (floor: number | undefined | null, floorLabel: string | undefined | null): string => {
	const f = floor ?? 0;
	const l = floorLabel || '';
	return `${f}||${l}`;
};

/** Parse a composite key back into its parts */
const parseSectorKey = (key: string): { floor: number; label: string } => {
	const idx = key.indexOf('||');
	return { floor: Number(key.slice(0, idx)), label: key.slice(idx + 2) };
};

/** Sort comparator for sector keys (floor asc, then label asc) */
const compareSectorKeys = (a: string, b: string): number => {
	const pa = parseSectorKey(a);
	const pb = parseSectorKey(b);
	if (pa.floor !== pb.floor) return pa.floor - pb.floor;
	return pa.label.localeCompare(pb.label);
};

/** Group an array of beds into a record keyed by composite sector key */
const groupBedsBySector = (
	beds: Array<{ floor?: number | null; floorLabel?: string | null; roomNumber: string; bedNumber: string }>,
): Record<string, typeof beds> => {
	const groups: Record<string, typeof beds> = {};
	beds.forEach((bed) => {
		const key = makeSectorKey(bed.floor, bed.floorLabel);
		if (!groups[key]) groups[key] = [];
		groups[key].push(bed);
	});
	return groups;
};

/** Simulate copying floorLabel from house bed to retreat bed */
const copyBedToRetreatBed = (bed: {
	roomNumber: string;
	bedNumber: string;
	floor: number;
	type: string;
	defaultUsage: string;
	floorLabel?: string | null;
}) => ({
	roomNumber: bed.roomNumber,
	bedNumber: bed.bedNumber,
	floor: bed.floor,
	type: bed.type,
	defaultUsage: bed.defaultUsage,
	floorLabel: bed.floorLabel,
});

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const sampleBeds = [
	{ floor: 1, floorLabel: 'Ala Norte', roomNumber: 'A1', bedNumber: '1', type: 'normal', defaultUsage: 'caminante' },
	{ floor: 1, floorLabel: 'Ala Norte', roomNumber: 'A1', bedNumber: '2', type: 'normal', defaultUsage: 'caminante' },
	{ floor: 1, floorLabel: 'Ala Sur',   roomNumber: 'B1', bedNumber: '1', type: 'litera_abajo', defaultUsage: 'servidor' },
	{ floor: 1, floorLabel: null,        roomNumber: 'C1', bedNumber: '1', type: 'colchon', defaultUsage: 'caminante' },
	{ floor: 2, floorLabel: 'Sector B',  roomNumber: 'D1', bedNumber: '1', type: 'normal', defaultUsage: 'caminante' },
	{ floor: 2, floorLabel: null,        roomNumber: 'E1', bedNumber: '1', type: 'normal', defaultUsage: 'servidor' },
];

// ---------------------------------------------------------------------------
// makeSectorKey
// ---------------------------------------------------------------------------

describe('makeSectorKey', () => {
	test('floor + label produces composite key', () => {
		expect(makeSectorKey(1, 'Ala Norte')).toBe('1||Ala Norte');
	});

	test('floor with no label uses empty string', () => {
		expect(makeSectorKey(2, null)).toBe('2||');
		expect(makeSectorKey(2, undefined)).toBe('2||');
		expect(makeSectorKey(2, '')).toBe('2||');
	});

	test('null floor falls back to 0', () => {
		expect(makeSectorKey(null, 'Sector A')).toBe('0||Sector A');
	});

	test('same floor different labels produce different keys', () => {
		const k1 = makeSectorKey(1, 'Ala Norte');
		const k2 = makeSectorKey(1, 'Ala Sur');
		expect(k1).not.toBe(k2);
	});

	test('different floor same label produce different keys', () => {
		const k1 = makeSectorKey(1, 'Norte');
		const k2 = makeSectorKey(2, 'Norte');
		expect(k1).not.toBe(k2);
	});
});

// ---------------------------------------------------------------------------
// parseSectorKey
// ---------------------------------------------------------------------------

describe('parseSectorKey', () => {
	test('parses floor and label correctly', () => {
		const result = parseSectorKey('1||Ala Norte');
		expect(result.floor).toBe(1);
		expect(result.label).toBe('Ala Norte');
	});

	test('parses key with empty label', () => {
		const result = parseSectorKey('2||');
		expect(result.floor).toBe(2);
		expect(result.label).toBe('');
	});

	test('label with || inside is handled (splits on first occurrence)', () => {
		const key = makeSectorKey(1, 'A||B');
		const parsed = parseSectorKey(key);
		expect(parsed.floor).toBe(1);
		expect(parsed.label).toBe('A||B');
	});

	test('round-trip: make then parse returns original values', () => {
		const floor = 3;
		const label = 'Sector Especial';
		const key = makeSectorKey(floor, label);
		const parsed = parseSectorKey(key);
		expect(parsed.floor).toBe(floor);
		expect(parsed.label).toBe(label);
	});
});

// ---------------------------------------------------------------------------
// compareSectorKeys
// ---------------------------------------------------------------------------

describe('compareSectorKeys', () => {
	test('lower floor sorts first', () => {
		expect(compareSectorKeys('1||A', '2||A')).toBeLessThan(0);
		expect(compareSectorKeys('2||A', '1||A')).toBeGreaterThan(0);
	});

	test('same floor: label sorts alphabetically', () => {
		expect(compareSectorKeys('1||Ala Norte', '1||Ala Sur')).toBeLessThan(0);
		expect(compareSectorKeys('1||Ala Sur', '1||Ala Norte')).toBeGreaterThan(0);
	});

	test('same floor and label: returns 0', () => {
		expect(compareSectorKeys('1||Ala Norte', '1||Ala Norte')).toBe(0);
	});

	test('empty label sorts before non-empty on same floor', () => {
		expect(compareSectorKeys('1||', '1||Ala Norte')).toBeLessThan(0);
	});

	test('sorts array of sector keys correctly', () => {
		const keys = ['2||Sector B', '1||Ala Sur', '1||', '1||Ala Norte', '2||'];
		const sorted = [...keys].sort(compareSectorKeys);
		expect(sorted).toEqual(['1||', '1||Ala Norte', '1||Ala Sur', '2||', '2||Sector B']);
	});
});

// ---------------------------------------------------------------------------
// groupBedsBySector
// ---------------------------------------------------------------------------

describe('groupBedsBySector', () => {
	test('groups beds with the same floor+label together', () => {
		const groups = groupBedsBySector(sampleBeds);
		const key = '1||Ala Norte';
		expect(groups[key]).toHaveLength(2);
		expect(groups[key][0].roomNumber).toBe('A1');
	});

	test('beds with null floorLabel go to the empty-label key', () => {
		const groups = groupBedsBySector(sampleBeds);
		expect(groups['1||']).toHaveLength(1);
		expect(groups['1||'][0].roomNumber).toBe('C1');
	});

	test('different labels on same floor create separate groups', () => {
		const groups = groupBedsBySector(sampleBeds);
		expect(groups['1||Ala Norte']).toBeDefined();
		expect(groups['1||Ala Sur']).toBeDefined();
		expect(groups['1||Ala Norte']).not.toEqual(groups['1||Ala Sur']);
	});

	test('different floors create separate groups even with same label', () => {
		const beds = [
			{ floor: 1, floorLabel: 'Norte', roomNumber: 'A1', bedNumber: '1' },
			{ floor: 2, floorLabel: 'Norte', roomNumber: 'B1', bedNumber: '1' },
		];
		const groups = groupBedsBySector(beds);
		expect(groups['1||Norte']).toHaveLength(1);
		expect(groups['2||Norte']).toHaveLength(1);
	});

	test('empty input returns empty object', () => {
		expect(groupBedsBySector([])).toEqual({});
	});

	test('all beds without floorLabel go into a single group per floor', () => {
		const beds = [
			{ floor: 1, floorLabel: null, roomNumber: 'A1', bedNumber: '1' },
			{ floor: 1, floorLabel: null, roomNumber: 'A1', bedNumber: '2' },
			{ floor: 1, floorLabel: undefined, roomNumber: 'B1', bedNumber: '1' },
		];
		const groups = groupBedsBySector(beds);
		expect(Object.keys(groups)).toHaveLength(1);
		expect(groups['1||']).toHaveLength(3);
	});

	test('produces correct sector keys for all sample beds', () => {
		const groups = groupBedsBySector(sampleBeds);
		const keys = Object.keys(groups).sort(compareSectorKeys);
		expect(keys).toEqual(['1||', '1||Ala Norte', '1||Ala Sur', '2||', '2||Sector B']);
	});
});

// ---------------------------------------------------------------------------
// floorLabel propagation (simulating retreatService.refreshRetreatBedsFromHouse)
// ---------------------------------------------------------------------------

describe('floorLabel propagation to retreat beds', () => {
	test('copies floorLabel from house bed to retreat bed', () => {
		const houseBed = { roomNumber: 'A1', bedNumber: '1', floor: 1, type: 'normal', defaultUsage: 'caminante', floorLabel: 'Ala Norte' };
		const retreatBed = copyBedToRetreatBed(houseBed);
		expect(retreatBed.floorLabel).toBe('Ala Norte');
	});

	test('null floorLabel is preserved as null in retreat bed', () => {
		const houseBed = { roomNumber: 'A1', bedNumber: '1', floor: 1, type: 'normal', defaultUsage: 'caminante', floorLabel: null };
		const retreatBed = copyBedToRetreatBed(houseBed);
		expect(retreatBed.floorLabel).toBeNull();
	});

	test('undefined floorLabel is preserved as undefined in retreat bed', () => {
		const houseBed = { roomNumber: 'A1', bedNumber: '1', floor: 1, type: 'normal', defaultUsage: 'caminante' };
		const retreatBed = copyBedToRetreatBed(houseBed);
		expect(retreatBed.floorLabel).toBeUndefined();
	});

	test('all other bed fields are also copied correctly', () => {
		const houseBed = { roomNumber: 'B2', bedNumber: '3', floor: 2, type: 'litera_abajo', defaultUsage: 'servidor', floorLabel: 'Sector B' };
		const retreatBed = copyBedToRetreatBed(houseBed);
		expect(retreatBed.roomNumber).toBe('B2');
		expect(retreatBed.bedNumber).toBe('3');
		expect(retreatBed.floor).toBe(2);
		expect(retreatBed.type).toBe('litera_abajo');
		expect(retreatBed.defaultUsage).toBe('servidor');
	});

	test('bulk copy preserves floorLabel across all beds', () => {
		const houseBeds = sampleBeds;
		const retreatBeds = houseBeds.map(copyBedToRetreatBed);
		retreatBeds.forEach((rb, i) => {
			// floorLabel is copied as-is (null stays null, string stays string)
			expect(rb.floorLabel).toBe(houseBeds[i].floorLabel);
		});
	});
});

// ---------------------------------------------------------------------------
// Sector rename logic (simulating saveFloorLabel / saveRoomSector)
// ---------------------------------------------------------------------------

describe('sector rename logic', () => {
	const makeBeds = () => sampleBeds.map((b) => ({ ...b }));

	test('renames all beds in a sector to new label', () => {
		const beds = makeBeds();
		const floor = 1;
		const oldLabel = 'Ala Norte';
		const newLabel = 'Ala Este';
		beds.forEach((bed) => {
			if ((bed.floor || 1) === floor && (bed.floorLabel || '') === oldLabel) {
				bed.floorLabel = newLabel;
			}
		});
		const groups = groupBedsBySector(beds);
		expect(groups['1||Ala Este']).toHaveLength(2);
		expect(groups['1||Ala Norte']).toBeUndefined();
	});

	test('does not affect beds in other sectors on the same floor', () => {
		const beds = makeBeds();
		beds.forEach((bed) => {
			if ((bed.floor || 1) === 1 && (bed.floorLabel || '') === 'Ala Norte') {
				bed.floorLabel = 'Ala Este';
			}
		});
		const groups = groupBedsBySector(beds);
		expect(groups['1||Ala Sur']).toHaveLength(1);
		expect(groups['1||']).toHaveLength(1);
	});

	test('clears label when new value is empty string', () => {
		const beds = makeBeds();
		beds.forEach((bed) => {
			if ((bed.floor || 1) === 1 && (bed.floorLabel || '') === 'Ala Norte') {
				bed.floorLabel = '' || undefined;
			}
		});
		const groups = groupBedsBySector(beds);
		// Beds previously in 'Ala Norte' now in the unlabelled group for floor 1
		expect(groups['1||']).toHaveLength(3); // was 1 (C1), now + 2 from Ala Norte
	});

	test('changing room sector reassigns only beds in that room', () => {
		const beds = makeBeds();
		const targetFloor = 1;
		const targetRoom = 'A1';
		const newLabel = 'Sector Nuevo';
		beds.forEach((bed) => {
			if ((bed.floor || 1) === targetFloor && bed.roomNumber === targetRoom) {
				bed.floorLabel = newLabel;
			}
		});
		const groups = groupBedsBySector(beds);
		expect(groups['1||Sector Nuevo']).toHaveLength(2);
		expect(groups['1||Ala Norte']).toBeUndefined();
		// Other rooms on floor 1 unchanged
		expect(groups['1||Ala Sur']).toHaveLength(1);
		expect(groups['1||']).toHaveLength(1);
	});
});

// ---------------------------------------------------------------------------
// docx export grouping (simulating roomService.exportRoomLabelsToDocx)
// ---------------------------------------------------------------------------

describe('docx export sector grouping', () => {
	const groupBedsForDocx = (
		beds: Array<{ floor?: number | null; floorLabel?: string | null; roomNumber: string }>,
	): Record<string, Record<string, typeof beds>> => {
		return beds.reduce(
			(acc, bed) => {
				const floor = bed.floor !== undefined && bed.floor !== null ? String(bed.floor) : 'PB';
				const label = bed.floorLabel || '';
				const key = `${floor}||${label}`;
				const roomNumber = bed.roomNumber;
				if (!acc[key]) acc[key] = {};
				if (!acc[key][roomNumber]) acc[key][roomNumber] = [];
				acc[key][roomNumber].push(bed);
				return acc;
			},
			{} as Record<string, Record<string, typeof beds>>,
		);
	};

	const buildFloorTitle = (sectorKey: string): string => {
		const [floorNum, sectorLabel = ''] = sectorKey.split('||');
		const floorTitle = floorNum === 'PB' ? 'PLANTA BAJA' : `PISO ${floorNum}`;
		return sectorLabel ? `${floorTitle} — ${sectorLabel.toUpperCase()}` : floorTitle;
	};

	test('sectors on same floor produce separate docx sections', () => {
		const groups = groupBedsForDocx(sampleBeds);
		expect(groups['1||Ala Norte']).toBeDefined();
		expect(groups['1||Ala Sur']).toBeDefined();
	});

	test('floor title without sector shows plain floor label', () => {
		expect(buildFloorTitle('1||')).toBe('PISO 1');
		expect(buildFloorTitle('2||')).toBe('PISO 2');
	});

	test('floor title with sector appends sector in uppercase', () => {
		expect(buildFloorTitle('1||Ala Norte')).toBe('PISO 1 — ALA NORTE');
		expect(buildFloorTitle('2||Sector B')).toBe('PISO 2 — SECTOR B');
	});

	test('null floor maps to PB', () => {
		const beds = [{ floor: null, floorLabel: null, roomNumber: 'A1' }];
		const groups = groupBedsForDocx(beds);
		expect(groups['PB||']).toBeDefined();
		expect(buildFloorTitle('PB||')).toBe('PLANTA BAJA');
	});

	test('each room is nested inside its sector group', () => {
		const groups = groupBedsForDocx(sampleBeds);
		expect(groups['1||Ala Norte']['A1']).toHaveLength(2);
		expect(groups['1||Ala Sur']['B1']).toHaveLength(1);
	});
});
