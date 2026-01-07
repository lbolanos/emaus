import { House } from '../../entities/house.entity';
import { v4 as uuidv4 } from 'uuid';
import * as houseController from '../../controllers/houseController';
import * as houseService from '../../services/houseService';

/**
 * House Controller Unit Tests
 *
 * Tests the house controller functions directly by mocking Request, Response, and NextFunction.
 *
 * Test coverage:
 * - getHouses - list all houses
 * - getHouseById - get house by id
 * - createHouse - create new house
 * - updateHouse - update house
 * - deleteHouse - delete house
 * - Error handling
 */
describe('House Controller', () => {
	// Helper to create mock Request object
	const createMockRequest = (overrides: any = {}) => ({
		params: {},
		body: {},
		query: {},
		user: null,
		...overrides,
	});

	// Helper to create mock Response object
	const createMockResponse = () => {
		const res: any = {
			status: jest.fn().mockReturnThis(),
			json: jest.fn().mockReturnThis(),
			send: jest.fn().mockReturnThis(),
			setHeader: jest.fn().mockReturnThis(),
			get: jest.fn().mockReturnThis(),
		};
		return res;
	};

	// Helper to create mock NextFunction
	const mockNext = jest.fn();

	beforeEach(() => {
		jest.clearAllMocks();
	});

	describe('getHouses', () => {
		test('should return empty array when no houses exist', async () => {
			const req = createMockRequest();
			const res = createMockResponse();
			const next = mockNext;

			// Mock getHouses to return empty array
			jest.spyOn(houseService, 'getHouses').mockResolvedValue([]);

			await houseController.getHouses(req, res, next);

			expect(res.json).toHaveBeenCalledWith([]);
		});

		test('should return list of houses', async () => {
			const mockHouse: House = {
				id: uuidv4(),
				name: 'Test House',
				address: '123 Test St',
				city: 'Test City',
				capacity: 50,
				coordinates: null,
				googleMapsLink: null,
				notes: null,
			} as House;

			const req = createMockRequest();
			const res = createMockResponse();
			const next = mockNext;

			// Mock getHouses to return the created house
			jest.spyOn(houseService, 'getHouses').mockResolvedValue([mockHouse]);

			await houseController.getHouses(req, res, next);

			expect(res.json).toHaveBeenCalled();
			const houses = res.json.mock.calls[0][0];
			expect(Array.isArray(houses)).toBe(true);
			expect(houses.length).toBe(1);
		});

		test('should call next on service error', async () => {
			const req = createMockRequest();
			const res = createMockResponse();
			const next = mockNext;

			// Mock getHouses to throw error
			jest.spyOn(houseService, 'getHouses').mockRejectedValue(new Error('Database error'));

			await houseController.getHouses(req, res, next);

			expect(next).toHaveBeenCalledWith(expect.any(Error));
		});
	});

	describe('getHouseById', () => {
		test('should return 404 for non-existent house', async () => {
			const req = createMockRequest({ params: { id: uuidv4() } });
			const res = createMockResponse();
			const next = mockNext;

			jest.spyOn(houseService, 'findById').mockResolvedValue(null);

			await houseController.getHouseById(req, res, next);

			expect(res.status).toHaveBeenCalledWith(404);
			expect(res.json).toHaveBeenCalledWith({ message: 'House not found' });
		});

		test('should return house data for valid id', async () => {
			const mockHouse: House = {
				id: uuidv4(),
				name: 'Test House',
				address: '123 Test St',
				city: 'Test City',
				capacity: 50,
				coordinates: null,
				googleMapsLink: null,
				notes: null,
			} as House;

			const req = createMockRequest({ params: { id: mockHouse.id } });
			const res = createMockResponse();
			const next = mockNext;

			jest.spyOn(houseService, 'findById').mockResolvedValue(mockHouse);

			await houseController.getHouseById(req, res, next);

			expect(res.json).toHaveBeenCalled();
			const result = res.json.mock.calls[0][0];
			expect(result).toHaveProperty('id', mockHouse.id);
		});

		test('should call next on service error', async () => {
			const req = createMockRequest({ params: { id: uuidv4() } });
			const res = createMockResponse();
			const next = mockNext;

			jest.spyOn(houseService, 'findById').mockRejectedValue(new Error('Database error'));

			await houseController.getHouseById(req, res, next);

			expect(next).toHaveBeenCalledWith(expect.any(Error));
		});
	});

	describe('createHouse', () => {
		test('should create new house with valid data', async () => {
			const houseData = {
				name: 'New House',
				address: '123 Test St',
				city: 'Test City',
				capacity: 50,
			};

			const req = createMockRequest({ body: houseData });
			const res = createMockResponse();
			const next = mockNext;

			const mockHouse = { id: uuidv4(), ...houseData };
			jest.spyOn(houseService, 'createHouse').mockResolvedValue(mockHouse);

			await houseController.createHouse(req, res, next);

			expect(res.status).toHaveBeenCalledWith(201);
			expect(res.json).toHaveBeenCalledWith(mockHouse);
		});

		test('should call next on service error', async () => {
			const houseData = {
				name: 'Error House',
			};

			const req = createMockRequest({ body: houseData });
			const res = createMockResponse();
			const next = mockNext;

			jest.spyOn(houseService, 'createHouse').mockRejectedValue(new Error('Validation error'));

			await houseController.createHouse(req, res, next);

			expect(next).toHaveBeenCalledWith(expect.any(Error));
		});
	});

	describe('updateHouse', () => {
		test('should return 404 for non-existent house', async () => {
			const req = createMockRequest({ params: { id: uuidv4() }, body: { name: 'Updated' } });
			const res = createMockResponse();
			const next = mockNext;

			jest.spyOn(houseService, 'updateHouse').mockResolvedValue(null);

			await houseController.updateHouse(req, res, next);

			expect(res.status).toHaveBeenCalledWith(404);
			expect(res.json).toHaveBeenCalledWith({ message: 'House not found' });
		});

		test('should update house with valid data', async () => {
			const mockHouse: House = {
				id: uuidv4(),
				name: 'Test House',
				address: '123 Test St',
				city: 'Test City',
				capacity: 50,
				coordinates: null,
				googleMapsLink: null,
				notes: null,
			} as House;

			const req = createMockRequest({
				params: { id: mockHouse.id },
				body: { name: 'Updated House' },
			});
			const res = createMockResponse();
			const next = mockNext;

			const updatedHouse = { ...mockHouse, name: 'Updated House' };
			jest.spyOn(houseService, 'updateHouse').mockResolvedValue(updatedHouse);

			await houseController.updateHouse(req, res, next);

			expect(res.json).toHaveBeenCalledWith(updatedHouse);
		});

		test('should call next on service error', async () => {
			const req = createMockRequest({ params: { id: uuidv4() }, body: { name: 'Error' } });
			const res = createMockResponse();
			const next = mockNext;

			jest.spyOn(houseService, 'updateHouse').mockRejectedValue(new Error('Database error'));

			await houseController.updateHouse(req, res, next);

			expect(next).toHaveBeenCalledWith(expect.any(Error));
		});
	});

	describe('deleteHouse', () => {
		test('should delete house and return 204', async () => {
			const houseId = uuidv4();

			const req = createMockRequest({ params: { id: houseId } });
			const res = createMockResponse();
			const next = mockNext;

			// Mock deleteHouse to resolve (no return value)
			jest.spyOn(houseService, 'deleteHouse').mockResolvedValue(undefined);

			await houseController.deleteHouse(req, res, next);

			expect(res.status).toHaveBeenCalledWith(204);
			expect(res.send).toHaveBeenCalled();
		});

		test('should call next on service error', async () => {
			const req = createMockRequest({ params: { id: uuidv4() } });
			const res = createMockResponse();
			const next = mockNext;

			jest.spyOn(houseService, 'deleteHouse').mockRejectedValue(new Error('Database error'));

			await houseController.deleteHouse(req, res, next);

			expect(next).toHaveBeenCalledWith(expect.any(Error));
		});
	});
});
