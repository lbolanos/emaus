// Bed scoring tests - pure function tests without database dependencies
// Tests the scoring-based bed assignment system that replaces the hard age cutoff

// Extract the scoring functions by re-implementing them here (same as in participantService.ts)
const BED_SCORING_CONFIG = {
	ageSigmoidMidpoint: 55,
	ageSigmoidSteepness: 0.15,
	snoringMatchBonus: 25,
	snoringMismatchPenalty: -30,
	floorPenaltyPerLevel: 5,
	walkerYoungPrefs: { litera_arriba: 100, litera_abajo: 80, normal: 60, colchon: 20 } as Record<string, number>,
	walkerOldPrefs: { normal: 100, litera_abajo: 85, colchon: 40, litera_arriba: 5 } as Record<string, number>,
	serverYoungPrefs: { colchon: 100, litera_abajo: 80, litera_arriba: 60, normal: 40 } as Record<string, number>,
	serverOldPrefs: { litera_abajo: 100, normal: 90, colchon: 50, litera_arriba: 30 } as Record<string, number>,
};

const computeAgePenaltyFactor = (age: number): number => {
	return 1 / (1 + Math.exp(-BED_SCORING_CONFIG.ageSigmoidSteepness * (age - BED_SCORING_CONFIG.ageSigmoidMidpoint)));
};

type RoomSnoreStatusMap = Map<string, 'snorer' | 'non-snorer' | 'empty'>;

const scoreBedForParticipant = (
	participant: any,
	bed: any,
	roomSnoreStatus: RoomSnoreStatusMap,
): number => {
	const age = participant.birthDate
		? new Date().getFullYear() - new Date(participant.birthDate).getFullYear()
		: 30;
	const ageFactor = computeAgePenaltyFactor(age);

	const isWalker = participant.type === 'walker';
	const youngPrefs = isWalker ? BED_SCORING_CONFIG.walkerYoungPrefs : BED_SCORING_CONFIG.serverYoungPrefs;
	const oldPrefs = isWalker ? BED_SCORING_CONFIG.walkerOldPrefs : BED_SCORING_CONFIG.serverOldPrefs;
	const youngScore = youngPrefs[bed.type] ?? 50;
	const oldScore = oldPrefs[bed.type] ?? 50;
	const bedTypeScore = youngScore * (1 - ageFactor) + oldScore * ageFactor;

	const floorsAboveGround = Math.max(0, (bed.floor ?? 1) - 1);
	const floorScore = -floorsAboveGround * BED_SCORING_CONFIG.floorPenaltyPerLevel * ageFactor;

	let snoringScore = 0;
	const roomStatus = roomSnoreStatus.get(bed.roomNumber);
	if (roomStatus && participant.snores !== undefined && participant.snores !== null) {
		const participantIsSnorer = !!participant.snores;
		const roomIsSnorer = roomStatus === 'snorer';
		if (participantIsSnorer === roomIsSnorer) {
			snoringScore = BED_SCORING_CONFIG.snoringMatchBonus;
		} else {
			snoringScore = BED_SCORING_CONFIG.snoringMismatchPenalty;
		}
	}

	return bedTypeScore + floorScore + snoringScore;
};

// Helper to create a mock participant
const makeParticipant = (overrides: any = {}) => ({
	id: 'p1',
	type: 'walker',
	birthDate: '1990-01-01',
	snores: false,
	isCancelled: false,
	retreatId: 'r1',
	lastName: 'Test',
	...overrides,
});

// Helper to create a mock bed
const makeBed = (overrides: any = {}) => ({
	id: 'b1',
	roomNumber: '101',
	bedNumber: '1',
	floor: 1,
	type: 'normal',
	defaultUsage: 'caminante',
	retreatId: 'r1',
	participantId: null,
	...overrides,
});

const currentYear = new Date().getFullYear();

describe('Bed Scoring System', () => {
	describe('computeAgePenaltyFactor (sigmoid)', () => {
		it('should return ~0 for very young participants', () => {
			const factor = computeAgePenaltyFactor(20);
			expect(factor).toBeLessThan(0.01);
		});

		it('should return ~0.5 at the midpoint age (55)', () => {
			const factor = computeAgePenaltyFactor(55);
			expect(factor).toBeCloseTo(0.5, 2);
		});

		it('should return ~1 for very old participants', () => {
			const factor = computeAgePenaltyFactor(80);
			expect(factor).toBeGreaterThan(0.97);
		});

		it('should be monotonically increasing', () => {
			const ages = [20, 30, 40, 50, 55, 60, 70, 80];
			const factors = ages.map(computeAgePenaltyFactor);
			for (let i = 1; i < factors.length; i++) {
				expect(factors[i]).toBeGreaterThan(factors[i - 1]);
			}
		});

		it('should have a smooth transition around 55 (no cliff edge)', () => {
			const at54 = computeAgePenaltyFactor(54);
			const at55 = computeAgePenaltyFactor(55);
			const at56 = computeAgePenaltyFactor(56);

			// The difference between consecutive ages should be small
			const diff54_55 = Math.abs(at55 - at54);
			const diff55_56 = Math.abs(at56 - at55);

			expect(diff54_55).toBeLessThan(0.05);
			expect(diff55_56).toBeLessThan(0.05);
		});
	});

	describe('Young walker (age 25) bed scoring', () => {
		const youngWalker = makeParticipant({
			birthDate: `${currentYear - 25}-06-15`,
			type: 'walker',
		});
		const emptySnoreMap: RoomSnoreStatusMap = new Map();

		it('should prefer top bunk over normal bed', () => {
			const topBunk = makeBed({ type: 'litera_arriba', roomNumber: '101' });
			const normalBed = makeBed({ type: 'normal', roomNumber: '102' });

			const topScore = scoreBedForParticipant(youngWalker, topBunk, emptySnoreMap);
			const normalScore = scoreBedForParticipant(youngWalker, normalBed, emptySnoreMap);

			expect(topScore).toBeGreaterThan(normalScore);
		});

		it('should prefer top bunk over bottom bunk', () => {
			const topBunk = makeBed({ type: 'litera_arriba', roomNumber: '101' });
			const bottomBunk = makeBed({ type: 'litera_abajo', roomNumber: '102' });

			const topScore = scoreBedForParticipant(youngWalker, topBunk, emptySnoreMap);
			const bottomScore = scoreBedForParticipant(youngWalker, bottomBunk, emptySnoreMap);

			expect(topScore).toBeGreaterThan(bottomScore);
		});

		it('should least prefer mattress', () => {
			const mattress = makeBed({ type: 'colchon', roomNumber: '101' });
			const normalBed = makeBed({ type: 'normal', roomNumber: '102' });

			const mattressScore = scoreBedForParticipant(youngWalker, mattress, emptySnoreMap);
			const normalScore = scoreBedForParticipant(youngWalker, normalBed, emptySnoreMap);

			expect(mattressScore).toBeLessThan(normalScore);
		});
	});

	describe('Old walker (age 70) bed scoring', () => {
		const oldWalker = makeParticipant({
			birthDate: `${currentYear - 70}-03-20`,
			type: 'walker',
		});
		const emptySnoreMap: RoomSnoreStatusMap = new Map();

		it('should strongly prefer normal bed over top bunk', () => {
			const topBunk = makeBed({ type: 'litera_arriba', roomNumber: '101' });
			const normalBed = makeBed({ type: 'normal', roomNumber: '102' });

			const topScore = scoreBedForParticipant(oldWalker, topBunk, emptySnoreMap);
			const normalScore = scoreBedForParticipant(oldWalker, normalBed, emptySnoreMap);

			expect(normalScore).toBeGreaterThan(topScore);
			// The difference should be large for a 70-year-old
			expect(normalScore - topScore).toBeGreaterThan(50);
		});

		it('should prefer bottom bunk over top bunk', () => {
			const topBunk = makeBed({ type: 'litera_arriba', roomNumber: '101' });
			const bottomBunk = makeBed({ type: 'litera_abajo', roomNumber: '102' });

			const topScore = scoreBedForParticipant(oldWalker, topBunk, emptySnoreMap);
			const bottomScore = scoreBedForParticipant(oldWalker, bottomBunk, emptySnoreMap);

			expect(bottomScore).toBeGreaterThan(topScore);
		});

		it('should still give a positive score to top bunk (no hard exclusion)', () => {
			const topBunk = makeBed({ type: 'litera_arriba', roomNumber: '101' });

			const topScore = scoreBedForParticipant(oldWalker, topBunk, emptySnoreMap);

			// Score should be positive (bed is still assignable, just low priority)
			expect(topScore).toBeGreaterThan(0);
		});

		it('should penalize higher floors more than for young walkers', () => {
			const youngWalker = makeParticipant({
				birthDate: `${currentYear - 25}-06-15`,
				type: 'walker',
			});

			const groundFloorBed = makeBed({ type: 'normal', floor: 1, roomNumber: '101' });
			const thirdFloorBed = makeBed({ type: 'normal', floor: 3, roomNumber: '301' });

			const oldGroundScore = scoreBedForParticipant(oldWalker, groundFloorBed, emptySnoreMap);
			const oldThirdScore = scoreBedForParticipant(oldWalker, thirdFloorBed, emptySnoreMap);
			const oldFloorPenalty = oldGroundScore - oldThirdScore;

			const youngGroundScore = scoreBedForParticipant(youngWalker, groundFloorBed, emptySnoreMap);
			const youngThirdScore = scoreBedForParticipant(youngWalker, thirdFloorBed, emptySnoreMap);
			const youngFloorPenalty = youngGroundScore - youngThirdScore;

			expect(oldFloorPenalty).toBeGreaterThan(youngFloorPenalty);
		});
	});

	describe('Middle-aged walker (age 50) - near midpoint', () => {
		const midWalker = makeParticipant({
			birthDate: `${currentYear - 50}-01-01`,
			type: 'walker',
		});
		const emptySnoreMap: RoomSnoreStatusMap = new Map();

		it('should have moderate preference for normal bed vs top bunk', () => {
			const topBunk = makeBed({ type: 'litera_arriba', roomNumber: '101' });
			const normalBed = makeBed({ type: 'normal', roomNumber: '102' });

			const topScore = scoreBedForParticipant(midWalker, topBunk, emptySnoreMap);
			const normalScore = scoreBedForParticipant(midWalker, normalBed, emptySnoreMap);

			// At age 50, scores should be relatively close (no extreme preference)
			const diff = Math.abs(normalScore - topScore);
			expect(diff).toBeLessThan(40);
		});
	});

	describe('Young server (age 22) bed scoring', () => {
		const youngServer = makeParticipant({
			birthDate: `${currentYear - 22}-08-10`,
			type: 'server',
		});
		const emptySnoreMap: RoomSnoreStatusMap = new Map();

		it('should prefer mattress (colchon) over other types', () => {
			const mattress = makeBed({ type: 'colchon', defaultUsage: 'servidor', roomNumber: '101' });
			const normalBed = makeBed({ type: 'normal', defaultUsage: 'servidor', roomNumber: '102' });
			const bottomBunk = makeBed({ type: 'litera_abajo', defaultUsage: 'servidor', roomNumber: '103' });

			const mattressScore = scoreBedForParticipant(youngServer, mattress, emptySnoreMap);
			const normalScore = scoreBedForParticipant(youngServer, normalBed, emptySnoreMap);
			const bottomScore = scoreBedForParticipant(youngServer, bottomBunk, emptySnoreMap);

			expect(mattressScore).toBeGreaterThan(normalScore);
			expect(mattressScore).toBeGreaterThan(bottomScore);
		});
	});

	describe('Old server (age 60) bed scoring', () => {
		const oldServer = makeParticipant({
			birthDate: `${currentYear - 60}-04-05`,
			type: 'server',
		});
		const emptySnoreMap: RoomSnoreStatusMap = new Map();

		it('should prefer bottom bunk over mattress', () => {
			const mattress = makeBed({ type: 'colchon', defaultUsage: 'servidor', roomNumber: '101' });
			const bottomBunk = makeBed({ type: 'litera_abajo', defaultUsage: 'servidor', roomNumber: '102' });

			const mattressScore = scoreBedForParticipant(oldServer, mattress, emptySnoreMap);
			const bottomScore = scoreBedForParticipant(oldServer, bottomBunk, emptySnoreMap);

			expect(bottomScore).toBeGreaterThan(mattressScore);
		});

		it('should prefer normal bed over top bunk', () => {
			const topBunk = makeBed({ type: 'litera_arriba', defaultUsage: 'servidor', roomNumber: '101' });
			const normalBed = makeBed({ type: 'normal', defaultUsage: 'servidor', roomNumber: '102' });

			const topScore = scoreBedForParticipant(oldServer, topBunk, emptySnoreMap);
			const normalScore = scoreBedForParticipant(oldServer, normalBed, emptySnoreMap);

			expect(normalScore).toBeGreaterThan(topScore);
		});
	});

	describe('Snoring compatibility scoring', () => {
		const snoringWalker = makeParticipant({
			birthDate: `${currentYear - 40}-01-01`,
			type: 'walker',
			snores: true,
		});
		const nonSnoringWalker = makeParticipant({
			birthDate: `${currentYear - 40}-01-01`,
			type: 'walker',
			snores: false,
		});
		const bed = makeBed({ type: 'normal', roomNumber: '101' });

		it('should give bonus when snorer is placed in snorer room', () => {
			const snoreMap: RoomSnoreStatusMap = new Map([['101', 'snorer']]);
			const emptyMap: RoomSnoreStatusMap = new Map();

			const scoreInSnorerRoom = scoreBedForParticipant(snoringWalker, bed, snoreMap);
			const scoreInEmptyRoom = scoreBedForParticipant(snoringWalker, bed, emptyMap);

			expect(scoreInSnorerRoom).toBeGreaterThan(scoreInEmptyRoom);
			expect(scoreInSnorerRoom - scoreInEmptyRoom).toBe(BED_SCORING_CONFIG.snoringMatchBonus);
		});

		it('should penalize when snorer is placed in non-snorer room', () => {
			const nonSnorerRoom: RoomSnoreStatusMap = new Map([['101', 'non-snorer']]);
			const emptyMap: RoomSnoreStatusMap = new Map();

			const scoreInNonSnorerRoom = scoreBedForParticipant(snoringWalker, bed, nonSnorerRoom);
			const scoreInEmptyRoom = scoreBedForParticipant(snoringWalker, bed, emptyMap);

			expect(scoreInNonSnorerRoom).toBeLessThan(scoreInEmptyRoom);
			expect(scoreInEmptyRoom - scoreInNonSnorerRoom).toBe(Math.abs(BED_SCORING_CONFIG.snoringMismatchPenalty));
		});

		it('should give bonus when non-snorer is placed in non-snorer room', () => {
			const nonSnorerRoom: RoomSnoreStatusMap = new Map([['101', 'non-snorer']]);
			const emptyMap: RoomSnoreStatusMap = new Map();

			const scoreInNonSnorerRoom = scoreBedForParticipant(nonSnoringWalker, bed, nonSnorerRoom);
			const scoreInEmptyRoom = scoreBedForParticipant(nonSnoringWalker, bed, emptyMap);

			expect(scoreInNonSnorerRoom).toBeGreaterThan(scoreInEmptyRoom);
		});

		it('should penalize when non-snorer is placed in snorer room', () => {
			const snorerRoom: RoomSnoreStatusMap = new Map([['101', 'snorer']]);
			const emptyMap: RoomSnoreStatusMap = new Map();

			const scoreInSnorerRoom = scoreBedForParticipant(nonSnoringWalker, bed, snorerRoom);
			const scoreInEmptyRoom = scoreBedForParticipant(nonSnoringWalker, bed, emptyMap);

			expect(scoreInSnorerRoom).toBeLessThan(scoreInEmptyRoom);
		});

		it('should not apply snoring score when participant snoring status is undefined', () => {
			const unknownSnorer = makeParticipant({
				birthDate: `${currentYear - 40}-01-01`,
				type: 'walker',
				snores: undefined,
			});
			const snorerRoom: RoomSnoreStatusMap = new Map([['101', 'snorer']]);
			const emptyMap: RoomSnoreStatusMap = new Map();

			const scoreInSnorerRoom = scoreBedForParticipant(unknownSnorer, bed, snorerRoom);
			const scoreInEmptyRoom = scoreBedForParticipant(unknownSnorer, bed, emptyMap);

			expect(scoreInSnorerRoom).toBe(scoreInEmptyRoom);
		});
	});

	describe('Best bed selection (simulating assignBedToParticipant)', () => {
		const selectBestBed = (participant: any, beds: any[], snoreMap: RoomSnoreStatusMap) => {
			let bestBed: any = null;
			let bestScore = -Infinity;
			for (const bed of beds) {
				const score = scoreBedForParticipant(participant, bed, snoreMap);
				if (score > bestScore) {
					bestScore = score;
					bestBed = bed;
				}
			}
			return bestBed;
		};

		it('should assign top bunk to 20-year-old walker', () => {
			const walker = makeParticipant({ birthDate: `${currentYear - 20}-01-01`, type: 'walker' });
			const beds = [
				makeBed({ id: 'top', type: 'litera_arriba', roomNumber: '101' }),
				makeBed({ id: 'normal', type: 'normal', roomNumber: '102' }),
				makeBed({ id: 'bottom', type: 'litera_abajo', roomNumber: '103' }),
			];
			const best = selectBestBed(walker, beds, new Map());
			expect(best.id).toBe('top');
		});

		it('should assign normal bed to 70-year-old walker', () => {
			const walker = makeParticipant({ birthDate: `${currentYear - 70}-01-01`, type: 'walker' });
			const beds = [
				makeBed({ id: 'top', type: 'litera_arriba', roomNumber: '101' }),
				makeBed({ id: 'normal', type: 'normal', roomNumber: '102' }),
				makeBed({ id: 'bottom', type: 'litera_abajo', roomNumber: '103' }),
			];
			const best = selectBestBed(walker, beds, new Map());
			expect(best.id).toBe('normal');
		});

		it('should assign top bunk to 80-year-old walker when only option', () => {
			const walker = makeParticipant({ birthDate: `${currentYear - 80}-01-01`, type: 'walker' });
			const beds = [
				makeBed({ id: 'top', type: 'litera_arriba', roomNumber: '101' }),
			];
			const best = selectBestBed(walker, beds, new Map());
			expect(best.id).toBe('top');
		});

		it('should assign mattress to young server', () => {
			const server = makeParticipant({ birthDate: `${currentYear - 22}-01-01`, type: 'server' });
			const beds = [
				makeBed({ id: 'mattress', type: 'colchon', defaultUsage: 'servidor', roomNumber: '101' }),
				makeBed({ id: 'normal', type: 'normal', defaultUsage: 'servidor', roomNumber: '102' }),
				makeBed({ id: 'top', type: 'litera_arriba', defaultUsage: 'servidor', roomNumber: '103' }),
			];
			const best = selectBestBed(server, beds, new Map());
			expect(best.id).toBe('mattress');
		});

		it('should prefer snoring-compatible room even when bed type is slightly worse', () => {
			const snoringWalker = makeParticipant({
				birthDate: `${currentYear - 30}-01-01`,
				type: 'walker',
				snores: true,
			});
			// Bottom bunk in a snorer room vs top bunk in an empty room
			const beds = [
				makeBed({ id: 'bottom-snorer', type: 'litera_abajo', roomNumber: '101' }),
				makeBed({ id: 'top-empty', type: 'litera_arriba', roomNumber: '102' }),
			];
			const snoreMap: RoomSnoreStatusMap = new Map([['101', 'snorer']]);

			const best = selectBestBed(snoringWalker, beds, snoreMap);
			// The snoring bonus (+25) should outweigh the bed type difference
			// litera_arriba=100 vs litera_abajo=80, diff=20 < snoringBonus=25
			expect(best.id).toBe('bottom-snorer');
		});

		it('should prefer lower floor for older participants between same bed types', () => {
			const oldWalker = makeParticipant({ birthDate: `${currentYear - 65}-01-01`, type: 'walker' });
			const beds = [
				makeBed({ id: 'floor3', type: 'normal', floor: 3, roomNumber: '301' }),
				makeBed({ id: 'floor1', type: 'normal', floor: 1, roomNumber: '101' }),
			];
			const best = selectBestBed(oldWalker, beds, new Map());
			expect(best.id).toBe('floor1');
		});
	});

	describe('Graduated scoring vs hard cutoff', () => {
		const emptySnoreMap: RoomSnoreStatusMap = new Map();

		it('should have smooth score transition from age 54 to 56 (no cliff)', () => {
			const topBunk = makeBed({ type: 'litera_arriba', roomNumber: '101' });

			const score54 = scoreBedForParticipant(
				makeParticipant({ birthDate: `${currentYear - 54}-01-01` }),
				topBunk,
				emptySnoreMap,
			);
			const score55 = scoreBedForParticipant(
				makeParticipant({ birthDate: `${currentYear - 55}-01-01` }),
				topBunk,
				emptySnoreMap,
			);
			const score56 = scoreBedForParticipant(
				makeParticipant({ birthDate: `${currentYear - 56}-01-01` }),
				topBunk,
				emptySnoreMap,
			);

			// Changes should be gradual, not abrupt
			const diff54_55 = Math.abs(score55 - score54);
			const diff55_56 = Math.abs(score56 - score55);

			expect(diff54_55).toBeLessThan(5);
			expect(diff55_56).toBeLessThan(5);

			// Scores should decrease monotonically with age for top bunk
			expect(score54).toBeGreaterThan(score55);
			expect(score55).toBeGreaterThan(score56);
		});

		it('top bunk score should decrease smoothly across all ages', () => {
			const topBunk = makeBed({ type: 'litera_arriba', roomNumber: '101' });
			const ages = [20, 30, 40, 45, 50, 52, 54, 55, 56, 58, 60, 65, 70, 80];

			const scores = ages.map((age) =>
				scoreBedForParticipant(
					makeParticipant({ birthDate: `${currentYear - age}-01-01` }),
					topBunk,
					emptySnoreMap,
				),
			);

			// Should be monotonically decreasing
			for (let i = 1; i < scores.length; i++) {
				expect(scores[i]).toBeLessThan(scores[i - 1]);
			}

			// No single step should be larger than 20 points (no cliff)
			for (let i = 1; i < scores.length; i++) {
				const step = scores[i - 1] - scores[i];
				expect(step).toBeLessThan(20);
			}
		});
	});
});
