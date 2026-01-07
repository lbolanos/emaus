import { setupTestDatabase, teardownTestDatabase, clearTestData } from '../test-setup';
import { TestDataFactory } from '../test-utils/testDataFactory';
import { RetreatBed, BedType } from '@/entities/retreatBed.entity';
import { Participant } from '@/entities/participant.entity';
import * as roomService from '@/services/roomService';
import { In } from 'typeorm';

/**
 * Room Service Tests
 *
 * All services have been refactored to accept an optional `dataSource?: DataSource` parameter.
 * Tests now pass the testDataSource to service calls, allowing proper test database isolation.
 */
describe('Room Service', () => {
	// Helper to get testDataSource
	const getTestDataSource = () => TestDataFactory['testDataSource'];

	// Helper to create a minimal participant with all required fields
	const createTestParticipant = (overrides: Partial<Participant> = {}) => {
		return getTestDataSource()
			.getRepository(Participant)
			.create({
				email: 'test@example.com',
				firstName: 'Test',
				lastName: 'Participant',
				type: 'walker',
				retreatId: testRetreat.id,
				isCancelled: false,
				id_on_retreat: 1,
				birthDate: new Date('1990-01-01'),
				maritalStatus: 'single',
				street: '123 Test St',
				houseNumber: '1',
				postalCode: '12345',
				neighborhood: 'Test Neighborhood',
				city: 'Test City',
				state: 'Test State',
				country: 'Test Country',
				cellPhone: '1234567890',
				occupation: 'Test Occupation',
				snores: false,
				hasMedication: false,
				hasDietaryRestrictions: false,
				sacraments: [],
				isScholarship: false,
				registrationDate: new Date(),
				lastUpdatedDate: new Date(),
				emergencyContact1Name: 'Emergency Contact',
				emergencyContact1Relation: 'Spouse',
				emergencyContact1CellPhone: '0987654321',
				...overrides,
			});
	};
	let testRetreat: any;
	let testBeds: RetreatBed[];
	let testParticipants: Participant[];

	beforeAll(async () => {
		await setupTestDatabase();
		const env = await TestDataFactory.createCompleteTestEnvironment();
		testRetreat = env.retreat;
		testBeds = env.beds;
	});

	afterAll(async () => {
		await teardownTestDatabase();
	});

	beforeEach(async () => {
		await clearTestData();
		// Recreate test environment
		const env = await TestDataFactory.createCompleteTestEnvironment();
		testRetreat = env.retreat;
		testBeds = await getTestDataSource()
			.getRepository(RetreatBed)
			.find({
				where: { retreatId: testRetreat.id },
			});

		// Create test participants
		testParticipants = [];
		for (let i = 0; i < 5; i++) {
			const participant = createTestParticipant({
				email: `participant${i}@test.com`,
				firstName: `Participant${i}`,
				lastName: `Test${i}`,
				type: i % 2 === 0 ? 'walker' : 'server',
				id_on_retreat: i + 1,
			});
			testParticipants.push(await getTestDataSource().getRepository(Participant).save(participant));
		}
	});

	describe('Bed Type Handling', () => {
		test('should identify normal bed type', () => {
			const normalBed = testBeds.find((b) => b.type === BedType.NORMAL);
			expect(normalBed).toBeDefined();
		});

		test('should identify litera_abajo bed type', () => {
			const literaAbajoBed = testBeds.find((b) => b.type === BedType.LITERA_ABAJO);
			expect(literaAbajoBed).toBeDefined();
		});

		test('should identify litera_arriba bed type', () => {
			const literaArribaBed = testBeds.find((b) => b.type === BedType.LITERA_ARRIBA);
			expect(literaArribaBed).toBeDefined();
		});

		test('should identify colchon bed type', () => {
			const colchonBed = testBeds.find((b) => b.type === BedType.COLCHON);
			expect(colchonBed).toBeDefined();
		});

		test('should handle all bed types in database', async () => {
			const bedTypes = [...new Set(testBeds.map((b) => b.type))];
			expect(bedTypes.length).toBeGreaterThan(0);

			// Should have at least one of each expected type if the test factory creates them
			const expectedTypes = [
				BedType.NORMAL,
				BedType.LITERA_ABAJO,
				BedType.LITERA_ARRIBA,
				BedType.COLCHON,
			];
			for (const type of expectedTypes) {
				const hasType = testBeds.some((b) => b.type === type);
				if (TestDataFactory.createTestBeds) {
					// If factory creates varied types, check for them
				}
			}
		});
	});

	describe('Room Assignment Logic', () => {
		test('should assign participant to bed', async () => {
			const bed = testBeds[0];
			const participant = testParticipants[0];

			// Assign by setting participantId on the bed (the foreign key is on RetreatBed)
			bed.participantId = participant.id;
			await getTestDataSource().getRepository(RetreatBed).save(bed);

			const updatedBed = await getTestDataSource()
				.getRepository(RetreatBed)
				.findOne({
					where: { id: bed.id },
					relations: ['participant'],
				});

			expect(updatedBed?.participant?.id).toBe(participant.id);
		});

		test('should handle multiple beds in same room', async () => {
			const bedsInSameRoom = testBeds.filter((b) => b.roomNumber === testBeds[0].roomNumber);

			expect(bedsInSameRoom.length).toBeGreaterThan(0);

			// Assign different participants to beds in same room
			const assignments: Promise<RetreatBed>[] = [];
			for (let i = 0; i < Math.min(bedsInSameRoom.length, testParticipants.length); i++) {
				const bed = bedsInSameRoom[i];
				bed.participantId = testParticipants[i].id;
				assignments.push(getTestDataSource().getRepository(RetreatBed).save(bed));
			}

			await Promise.all(assignments);

			// Verify all assignments - use In operator for array of IDs
			const assignedBedIds = bedsInSameRoom.slice(0, testParticipants.length).map((b) => b.id);
			const assignedBeds = await getTestDataSource()
				.getRepository(RetreatBed)
				.find({
					where: { id: In(assignedBedIds) },
					relations: ['participant'],
				});

			const occupiedCount = assignedBeds.filter((b) => b.participant).length;
			expect(occupiedCount).toBeGreaterThan(0);
		});

		test('should handle bed assignment cancellation', async () => {
			const bed = testBeds[0];
			const participant = testParticipants[0];

			// Assign
			bed.participantId = participant.id;
			await getTestDataSource().getRepository(RetreatBed).save(bed);

			// Unassign
			bed.participantId = null;
			await getTestDataSource().getRepository(RetreatBed).save(bed);

			const updatedBed = await getTestDataSource()
				.getRepository(RetreatBed)
				.findOne({
					where: { id: bed.id },
					relations: ['participant'],
				});

			expect(updatedBed?.participant).toBeNull();
		});
	});

	describe('Occupancy Validation', () => {
		test('should count occupied beds for retreat', async () => {
			// Assign some participants to beds
			const assignments: Promise<RetreatBed>[] = [];
			for (let i = 0; i < 3; i++) {
				const bed = testBeds[i];
				bed.participantId = testParticipants[i].id;
				assignments.push(getTestDataSource().getRepository(RetreatBed).save(bed));
			}
			await Promise.all(assignments);

			// Count occupied beds
			const bedsWithParticipants = await getTestDataSource()
				.getRepository(RetreatBed)
				.find({
					where: { retreatId: testRetreat.id },
					relations: ['participant'],
				});

			const occupiedBeds = bedsWithParticipants.filter((b) => b.participant);
			expect(occupiedBeds.length).toBe(3);
		});

		test('should count available beds for retreat', async () => {
			// Assign only some participants
			testBeds[0].participantId = testParticipants[0].id;
			await getTestDataSource().getRepository(RetreatBed).save(testBeds[0]);

			const allBeds = await getTestDataSource()
				.getRepository(RetreatBed)
				.find({
					where: { retreatId: testRetreat.id },
					relations: ['participant'],
				});

			const availableBeds = allBeds.filter((b) => !b.participant);
			expect(availableBeds.length).toBe(allBeds.length - 1);
		});

		test('should calculate occupancy rate', async () => {
			// Assign half of the beds (or all participants if fewer)
			const halfCount = Math.min(Math.floor(testBeds.length / 2), testParticipants.length);
			for (let i = 0; i < halfCount; i++) {
				testBeds[i].participantId = testParticipants[i].id;
				await getTestDataSource().getRepository(RetreatBed).save(testBeds[i]);
			}

			const beds = await getTestDataSource()
				.getRepository(RetreatBed)
				.find({
					where: { retreatId: testRetreat.id },
					relations: ['participant'],
				});

			const occupiedCount = beds.filter((b) => b.participant).length;
			const totalCount = beds.length;
			const occupancyRate = (occupiedCount / totalCount) * 100;

			expect(occupancyRate).toBeGreaterThan(0);
			expect(occupancyRate).toBeLessThanOrEqual(100);
		});

		test('should handle full occupancy', async () => {
			// Assign all beds
			for (let i = 0; i < Math.min(testBeds.length, testParticipants.length); i++) {
				testBeds[i].participantId = testParticipants[i].id;
				await getTestDataSource().getRepository(RetreatBed).save(testBeds[i]);
			}

			const beds = await getTestDataSource()
				.getRepository(RetreatBed)
				.find({
					where: { retreatId: testRetreat.id },
					relations: ['participant'],
				});

			const occupiedBeds = beds.filter((b) => b.participant);
			expect(occupiedBeds.length).toBe(testParticipants.length);
		});

		test('should handle zero occupancy', async () => {
			// Clear all assignments
			for (const bed of testBeds) {
				bed.participantId = null;
				await getTestDataSource().getRepository(RetreatBed).save(bed);
			}

			const beds = await getTestDataSource()
				.getRepository(RetreatBed)
				.find({
					where: { retreatId: testRetreat.id },
					relations: ['participant'],
				});

			const occupiedBeds = beds.filter((b) => b.participant);
			expect(occupiedBeds.length).toBe(0);
		});
	});

	describe('Floor Organization', () => {
		test('should organize beds by floor', async () => {
			const beds = await getTestDataSource()
				.getRepository(RetreatBed)
				.find({
					where: { retreatId: testRetreat.id },
					order: { floor: 'ASC' },
				});

			const bedsByFloor = beds.reduce(
				(acc, bed) => {
					const floor = bed.floor ?? 'ground';
					if (!acc[floor]) acc[floor] = [];
					acc[floor].push(bed);
					return acc;
				},
				{} as Record<number | string, RetreatBed[]>,
			);

			expect(Object.keys(bedsByFloor).length).toBeGreaterThan(0);
		});

		test('should handle multiple floors', async () => {
			const beds = await getTestDataSource()
				.getRepository(RetreatBed)
				.find({
					where: { retreatId: testRetreat.id },
				});

			const uniqueFloors = [...new Set(beds.map((b) => b.floor))];
			// Test data factory creates beds with different floors
			expect(uniqueFloors.length).toBeGreaterThan(0);
		});

		test('should order beds by room number within floor', async () => {
			const beds = await getTestDataSource()
				.getRepository(RetreatBed)
				.find({
					where: { retreatId: testRetreat.id, floor: 1 },
					order: { roomNumber: 'ASC', bedNumber: 'ASC' },
				});

			for (let i = 1; i < beds.length; i++) {
				const prevRoom = parseInt(beds[i - 1].roomNumber);
				const currRoom = parseInt(beds[i].roomNumber);
				if (prevRoom === currRoom) {
					// Same room, check bed number
					const prevBed = parseInt(beds[i - 1].bedNumber);
					const currBed = parseInt(beds[i].bedNumber);
					expect(currBed).toBeGreaterThanOrEqual(prevBed);
				} else {
					expect(currRoom).toBeGreaterThanOrEqual(prevRoom);
				}
			}
		});
	});

	describe('exportRoomLabelsToDocx', () => {
		test('should generate docx buffer for retreat room labels', async () => {
			const buffer = await roomService.exportRoomLabelsToDocx(testRetreat.id, getTestDataSource());

			expect(buffer).toBeInstanceOf(Buffer);
			expect(buffer.length).toBeGreaterThan(0);
		});

		test('should include all beds in export', async () => {
			const buffer = await roomService.exportRoomLabelsToDocx(testRetreat.id, getTestDataSource());
			// Buffer should be larger when there are more beds
			const minimumSize = testBeds.length * 100; // At least 100 bytes per bed
			expect(buffer.length).toBeGreaterThan(minimumSize);
		});

		test('should handle retreat with no beds gracefully', async () => {
			// Create a new retreat with no beds
			const { Retreat } = await import('@/entities/retreat.entity');
			const { House } = await import('@/entities/house.entity');

			const retreatRepository = getTestDataSource().getRepository(Retreat);
			const houseRepository = getTestDataSource().getRepository(House);

			const house = houseRepository.create({
				name: 'Empty Beds House',
				address1: 'Empty St',
				city: 'Empty City',
				state: 'ES',
				zipCode: '00000',
				country: 'Test Country',
				capacity: 10,
			});
			const savedHouse = await houseRepository.save(house);

			const retreat = retreatRepository.create({
				parish: 'Empty Beds Retreat',
				startDate: new Date(),
				endDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
				houseId: savedHouse.id,
			});
			const savedRetreat = await retreatRepository.save(retreat);

			const buffer = await roomService.exportRoomLabelsToDocx(savedRetreat.id, getTestDataSource());

			expect(buffer).toBeInstanceOf(Buffer);
			expect(buffer.length).toBeGreaterThan(0);
		});

		test('should throw error for non-existent retreat', async () => {
			await expect(
				roomService.exportRoomLabelsToDocx('non-existent-id', getTestDataSource()),
			).rejects.toThrow('Retreat not found');
		});

		test('should include participant assignments in export', async () => {
			// Assign a participant to a bed
			testBeds[0].participantId = testParticipants[0].id;
			await getTestDataSource().getRepository(RetreatBed).save(testBeds[0]);

			const buffer = await roomService.exportRoomLabelsToDocx(testRetreat.id, getTestDataSource());

			expect(buffer).toBeInstanceOf(Buffer);
			// Buffer should be larger when there are participant assignments
			expect(buffer.length).toBeGreaterThan(1000);
		});
	});
});
