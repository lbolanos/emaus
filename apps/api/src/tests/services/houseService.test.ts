import { setupTestDatabase, teardownTestDatabase, clearTestData } from '../test-setup';
import { TestDataFactory } from '../test-utils/testDataFactory';
import { House } from '@/entities/house.entity';
import { Bed, BedType } from '@/entities/bed.entity';
import * as houseService from '@/services/houseService';

/**
 * House Service Tests
 *
 * All services have been refactored to accept an optional `dataSource?: DataSource` parameter.
 * Tests now pass the testDataSource to service calls, allowing proper test database isolation.
 */
describe('House Service', () => {
	let testHouse: House;

	// Helper to get testDataSource
	const getTestDataSource = () => TestDataFactory['testDataSource'];

	beforeAll(async () => {
		await setupTestDatabase();
		const env = await TestDataFactory.createCompleteTestEnvironment();
		testHouse = (await getTestDataSource()
			.getRepository(House)
			.findOne({
				where: { id: env.retreat.houseId },
			})) as House;
	});

	afterAll(async () => {
		await teardownTestDatabase();
	});

	beforeEach(async () => {
		await clearTestData();
		// Recreate test house after clearing
		const houseRepository = getTestDataSource().getRepository(House);
		testHouse = houseRepository.create({
			name: 'Test House',
			address1: '123 Test Street',
			city: 'Test City',
			state: 'Test State',
			zipCode: '12345',
			country: 'Test Country',
			capacity: 100,
		});
		await houseRepository.save(testHouse);
	});

	describe('getHouses', () => {
		test('should return all houses with beds relations', async () => {
			const houses = await houseService.getHouses(getTestDataSource());

			expect(Array.isArray(houses)).toBe(true);
			expect(houses.length).toBeGreaterThan(0);
			expect(houses[0]).toHaveProperty('beds');
		});

		test('should return houses with empty bed array if no beds', async () => {
			const newHouse = await houseService.createHouse({
				name: 'Empty House',
				address1: '456 Empty St',
				city: 'Empty City',
				state: 'Empty State',
				zipCode: '54321',
				country: 'Test Country',
				capacity: 50,
			});

			const houses = await houseService.getHouses(getTestDataSource());
			const emptyHouse = houses.find((h) => h.id === newHouse.id);

			expect(emptyHouse).toBeDefined();
			expect(emptyHouse?.beds).toEqual([]);
		});
	});

	describe('findById', () => {
		test('should return house with beds by id', async () => {
			const house = await houseService.findById(testHouse.id, getTestDataSource());

			expect(house).toBeTruthy();
			expect(house?.id).toBe(testHouse.id);
			expect(house?.beds).toBeDefined();
		});

		test('should return null for non-existent house', async () => {
			const house = await houseService.findById('non-existent-id', getTestDataSource());

			expect(house).toBeNull();
		});
	});

	describe('createHouse', () => {
		test('should create house with valid data', async () => {
			const houseData = {
				name: 'New Test House',
				address1: '789 New Street',
				city: 'New City',
				state: 'New State',
				zipCode: '67890',
				country: 'Test Country',
				capacity: 75,
			};

			const newHouse = await houseService.createHouse(houseData, getTestDataSource());

			expect(newHouse).toBeTruthy();
			expect(newHouse.name).toBe(houseData.name);
			expect(newHouse.capacity).toBe(houseData.capacity);
		});

		test('should reject house with duplicate name', async () => {
			const houseData = {
				name: testHouse.name, // Same name as existing house
				address1: 'Different Address',
				city: 'Different City',
				state: 'Different State',
				zipCode: '11111',
				country: 'Test Country',
				capacity: 50,
			};

			await expect(houseService.createHouse(houseData, getTestDataSource())).rejects.toThrow(
				'House with the same name already exists',
			);
		});

		test('should create house with beds', async () => {
			const bedsData = [
				{ roomNumber: '101', bedNumber: '1', floor: 1, type: BedType.NORMAL },
				{ roomNumber: '101', bedNumber: '2', floor: 1, type: BedType.NORMAL },
				{ roomNumber: '102', bedNumber: '1', floor: 1, type: BedType.LITERA_ABAJO },
				{ roomNumber: '102', bedNumber: '2', floor: 1, type: BedType.LITERA_ARRIBA },
			];

			const houseData = {
				name: 'House with Beds',
				address1: '321 Bed St',
				city: 'Bed City',
				state: 'Bed State',
				zipCode: '33333',
				country: 'Test Country',
				capacity: 20,
				beds: bedsData,
			};

			const newHouse = await houseService.createHouse(houseData, getTestDataSource());

			expect(newHouse.beds).toHaveLength(4);
			expect(newHouse.beds[0].roomNumber).toBe('101');
			expect(newHouse.beds[2].type).toBe(BedType.LITERA_ABAJO);
		});
	});

	describe('updateHouse', () => {
		test('should update house properties', async () => {
			const updatedName = 'Updated House Name';
			const updatedCapacity = 120;

			const updatedHouse = await houseService.updateHouse(testHouse.id, {
				name: updatedName,
				capacity: updatedCapacity,
			});

			expect(updatedHouse).toBeTruthy();
			expect(updatedHouse?.name).toBe(updatedName);
			expect(updatedHouse?.capacity).toBe(updatedCapacity);
		});

		test('should return null when updating non-existent house', async () => {
			const result = await houseService.updateHouse('non-existent-id', {
				name: 'New Name',
			});

			expect(result).toBeNull();
		});

		test('should reject update to existing house name', async () => {
			const otherHouse = await houseService.createHouse({
				name: 'Other House',
				address1: 'Other Address',
				city: 'Other City',
				state: 'Other State',
				zipCode: '99999',
				country: 'Test Country',
				capacity: 30,
			});

			await expect(
				houseService.updateHouse(testHouse.id, {
					name: otherHouse.name,
				}),
			).rejects.toThrow('House with the same name already exists');
		});

		test('should allow updating to same house name', async () => {
			const updatedHouse = await houseService.updateHouse(testHouse.id, {
				name: testHouse.name, // Same name
				capacity: 200,
			});

			expect(updatedHouse).toBeTruthy();
			expect(updatedHouse?.capacity).toBe(200);
		});
	});

	describe('deleteHouse', () => {
		test('should delete house successfully', async () => {
			const newHouse = await houseService.createHouse({
				name: 'House to Delete',
				address1: 'Delete St',
				city: 'Delete City',
				state: 'Delete State',
				zipCode: '77777',
				country: 'Test Country',
				capacity: 25,
			});

			await houseService.deleteHouse(newHouse.id, getTestDataSource());

			const deletedHouse = await houseService.findById(newHouse.id, getTestDataSource());
			expect(deletedHouse).toBeNull();
		});

		test('should delete house with beds', async () => {
			const newHouse = await houseService.createHouse({
				name: 'House with Beds to Delete',
				address1: 'Delete Bed St',
				city: 'Delete Bed City',
				state: 'Delete Bed State',
				zipCode: '88888',
				country: 'Test Country',
				capacity: 15,
				beds: [
					{ roomNumber: '201', bedNumber: '1', floor: 2, type: BedType.NORMAL },
					{ roomNumber: '201', bedNumber: '2', floor: 2, type: BedType.COLCHON },
				],
			});

			await houseService.deleteHouse(newHouse.id, getTestDataSource());

			const deletedHouse = await houseService.findById(newHouse.id, getTestDataSource());
			expect(deletedHouse).toBeNull();
		});

		test('should handle deleting non-existent house gracefully', async () => {
			// Should not throw error
			await expect(
				houseService.deleteHouse('non-existent-id', getTestDataSource()),
			).resolves.toBeUndefined();
		});
	});

	describe('Capacity Validation', () => {
		test('should create house with positive capacity', async () => {
			const houseData = {
				name: 'Positive Capacity House',
				address1: 'Cap St',
				city: 'Cap City',
				state: 'Cap State',
				zipCode: '11111',
				country: 'Test Country',
				capacity: 100,
			};

			const newHouse = await houseService.createHouse(houseData, getTestDataSource());
			expect(newHouse.capacity).toBe(100);
		});

		test('should create house with zero capacity', async () => {
			const houseData = {
				name: 'Zero Capacity House',
				address1: 'Zero St',
				city: 'Zero City',
				state: 'Zero State',
				zipCode: '22222',
				country: 'Test Country',
				capacity: 0,
			};

			const newHouse = await houseService.createHouse(houseData, getTestDataSource());
			expect(newHouse.capacity).toBe(0);
		});

		test('should update house capacity', async () => {
			const newCapacity = 150;
			const updatedHouse = await houseService.updateHouse(testHouse.id, {
				capacity: newCapacity,
			});

			expect(updatedHouse?.capacity).toBe(newCapacity);
		});
	});

	describe('Bed Inventory Management', () => {
		test('should add beds to existing house', async () => {
			const initialHouse = await houseService.findById(testHouse.id, getTestDataSource());
			const initialBedCount = initialHouse?.beds.length || 0;

			const newBeds = [
				{ roomNumber: '301', bedNumber: '1', floor: 3, type: BedType.NORMAL },
				{ roomNumber: '301', bedNumber: '2', floor: 3, type: BedType.NORMAL },
			];

			const updatedHouse = await houseService.updateHouse(testHouse.id, {
				beds: [...(initialHouse?.beds || []), ...newBeds],
			});

			expect(updatedHouse?.beds.length).toBe(initialBedCount + 2);
		});

		test('should update existing bed information', async () => {
			const houseWithBeds = await houseService.createHouse({
				name: 'Bed Update Test',
				address1: 'Bed Update St',
				city: 'Bed Update City',
				state: 'Bed Update State',
				zipCode: '44444',
				country: 'Test Country',
				capacity: 10,
				beds: [{ id: 'bed-1', roomNumber: '401', bedNumber: '1', floor: 4, type: BedType.NORMAL }],
			});

			const updatedBeds = [
				{
					id: 'bed-1',
					roomNumber: '402', // Changed room number
					bedNumber: '1',
					floor: 4,
					type: BedType.LITERA_ABAJO, // Changed type
				},
			];

			const updatedHouse = await houseService.updateHouse(houseWithBeds.id, {
				beds: updatedBeds,
			});

			expect(updatedHouse?.beds[0].roomNumber).toBe('402');
			expect(updatedHouse?.beds[0].type).toBe(BedType.LITERA_ABAJO);
		});

		test('should remove beds when updating with smaller bed list', async () => {
			const houseWithBeds = await houseService.createHouse({
				name: 'Bed Removal Test',
				address1: 'Bed Removal St',
				city: 'Bed Removal City',
				state: 'Bed Removal State',
				zipCode: '55555',
				country: 'Test Country',
				capacity: 20,
				beds: [
					{ id: 'bed-a', roomNumber: '501', bedNumber: '1', floor: 5, type: BedType.NORMAL },
					{ id: 'bed-b', roomNumber: '501', bedNumber: '2', floor: 5, type: BedType.NORMAL },
					{ id: 'bed-c', roomNumber: '502', bedNumber: '1', floor: 5, type: BedType.COLCHON },
				],
			});

			// Update with only 2 beds (remove bed-c)
			const updatedBeds = [
				{ id: 'bed-a', roomNumber: '501', bedNumber: '1', floor: 5, type: BedType.NORMAL },
				{ id: 'bed-b', roomNumber: '501', bedNumber: '2', floor: 5, type: BedType.NORMAL },
			];

			const updatedHouse = await houseService.updateHouse(houseWithBeds.id, {
				beds: updatedBeds,
			});

			expect(updatedHouse?.beds).toHaveLength(2);
		});

		test('should handle empty bed list when updating', async () => {
			const houseWithBeds = await houseService.createHouse({
				name: 'Empty Bed List Test',
				address1: 'Empty Bed St',
				city: 'Empty Bed City',
				state: 'Empty Bed State',
				zipCode: '66666',
				country: 'Test Country',
				capacity: 30,
				beds: [{ id: 'bed-x', roomNumber: '601', bedNumber: '1', floor: 6, type: BedType.NORMAL }],
			});

			const updatedHouse = await houseService.updateHouse(houseWithBeds.id, {
				beds: [],
			});

			expect(updatedHouse?.beds).toHaveLength(0);
		});
	});
});
