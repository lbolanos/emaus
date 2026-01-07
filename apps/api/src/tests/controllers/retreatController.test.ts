import { setupTestDatabase, teardownTestDatabase, clearTestData } from '../test-setup';
import { TestDataFactory } from '../test-utils/testDataFactory';
import { Retreat } from '../../entities/retreat.entity';
import { House } from '../../entities/house.entity';
import { User } from '../../entities/user.entity';
import * as bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import * as retreatController from '../../controllers/retreatController';
import * as retreatService from '../../services/retreatService';

// Mock the roomService module for exportRoomLabelsToDocx
jest.mock('../../services/roomService', () => ({
	exportRoomLabelsToDocx: jest.fn(),
}));

// Mock the badgeService module for exportBadgesToDocx
jest.mock('../../services/badgeService', () => ({
	exportBadgesToDocx: jest.fn(),
}));

/**
 * Retreat Controller Unit Tests
 *
 * Tests the retreat controller functions directly by mocking Request, Response, and NextFunction.
 * This approach avoids the complexity of setting up passport sessions and HTTP integration tests.
 *
 * Test coverage:
 * - getAllRetreats - list retreats for authenticated user
 * - getRetreatById - get retreat by id
 * - getRetreatByIdPublic - get public retreat flyer data
 * - createRetreat - create retreat (authenticated)
 * - updateRetreat - update retreat
 * - exportRoomLabelsToDocx - export room labels
 * - exportBadgesToDocx - export badges
 * - Authentication requirements
 * - Error handling
 */
describe('Retreat Controller', () => {
	// Helper to get testDataSource
	const getTestDataSource = () => TestDataFactory['testDataSource'];

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

	// Helper to create a test user
	const createTestUser = async (): Promise<User> => {
		const userRepository = getTestDataSource().getRepository(User);
		const hashedPassword = await bcrypt.hash('password123', 10);
		const user = userRepository.create({
			id: uuidv4(),
			email: 'testuser@example.com',
			displayName: 'Test User',
			password: hashedPassword,
			isPending: false,
		});
		await userRepository.save(user);
		return user;
	};

	let testUser: User;

	beforeAll(async () => {
		await setupTestDatabase();
		testUser = await createTestUser();
	});

	afterAll(async () => {
		await teardownTestDatabase();
	});

	beforeEach(async () => {
		await clearTestData();
		// Recreate test user after clearing
		testUser = await createTestUser();
		jest.clearAllMocks();
	});

	describe('getAllRetreats', () => {
		test('should return 401 when user is not authenticated', async () => {
			const req = createMockRequest({ user: null });
			const res = createMockResponse();
			const next = mockNext;

			await retreatController.getAllRetreats(req, res, next);

			expect(res.status).toHaveBeenCalledWith(401);
			expect(res.json).toHaveBeenCalledWith({ message: 'Unauthorized' });
			expect(next).not.toHaveBeenCalled();
		});

		test('should return empty array when no retreats exist', async () => {
			const req = createMockRequest({ user: { id: testUser.id } });
			const res = createMockResponse();
			const next = mockNext;

			await retreatController.getAllRetreats(req, res, next);

			expect(res.json).toHaveBeenCalledWith([]);
			expect(res.status).not.toHaveBeenCalled();
		});

		test('should return list of retreats for authenticated user', async () => {
			// Create a test retreat
			const env = await TestDataFactory.createCompleteTestEnvironment();
			const retreat = env.retreat;

			const req = createMockRequest({ user: { id: testUser.id } });
			const res = createMockResponse();
			const next = mockNext;

			// Mock getRetreatsForUser to return the created retreat
			jest.spyOn(retreatService, 'getRetreatsForUser').mockResolvedValue([retreat]);

			await retreatController.getAllRetreats(req, res, next);

			expect(res.json).toHaveBeenCalled();
			const retreats = res.json.mock.calls[0][0];
			expect(Array.isArray(retreats)).toBe(true);
			expect(retreats.length).toBeGreaterThan(0);
		});

		test('should call next with error when service throws', async () => {
			const req = createMockRequest({ user: { id: testUser.id } });
			const res = createMockResponse();
			const next = mockNext;

			// Mock service to throw error
			jest
				.spyOn(retreatService, 'getRetreatsForUser')
				.mockRejectedValue(new Error('Database error'));

			await retreatController.getAllRetreats(req, res, next);

			expect(next).toHaveBeenCalledWith(expect.any(Error));
			expect(res.status).not.toHaveBeenCalled();
		});
	});

	describe('getRetreatById', () => {
		test('should return 404 for non-existent retreat', async () => {
			const req = createMockRequest({ params: { id: uuidv4() } });
			const res = createMockResponse();
			const next = mockNext;

			jest.spyOn(retreatService, 'findById').mockResolvedValue(null);

			await retreatController.getRetreatById(req, res, next);

			expect(res.status).toHaveBeenCalledWith(404);
			expect(res.json).toHaveBeenCalledWith({ message: 'Retreat not found' });
		});

		test('should return retreat data for valid id', async () => {
			const env = await TestDataFactory.createCompleteTestEnvironment();
			const retreat = env.retreat;

			const req = createMockRequest({ params: { id: retreat.id } });
			const res = createMockResponse();
			const next = mockNext;

			// Mock findById to return the created retreat
			jest.spyOn(retreatService, 'findById').mockResolvedValue(retreat);

			await retreatController.getRetreatById(req, res, next);

			expect(res.json).toHaveBeenCalled();
			const result = res.json.mock.calls[0][0];
			expect(result).toHaveProperty('id', retreat.id);
		});
	});

	describe('getRetreatByIdPublic', () => {
		test('should return 404 for non-existent retreat', async () => {
			const req = createMockRequest({ params: { id: uuidv4() } });
			const res = createMockResponse();
			const next = mockNext;

			jest.spyOn(retreatService, 'findById').mockResolvedValue(null);

			await retreatController.getRetreatByIdPublic(req, res, next);

			expect(res.status).toHaveBeenCalledWith(404);
			expect(res.json).toHaveBeenCalledWith({ message: 'Retreat not found' });
		});

		test('should return public flyer data for public endpoint', async () => {
			const env = await TestDataFactory.createCompleteTestEnvironment();
			const retreat = env.retreat;

			const req = createMockRequest({ params: { id: retreat.id } });
			const res = createMockResponse();
			const next = mockNext;

			// Mock findById to return the created retreat
			jest.spyOn(retreatService, 'findById').mockResolvedValue(retreat);

			await retreatController.getRetreatByIdPublic(req, res, next);

			expect(res.json).toHaveBeenCalled();
			const result = res.json.mock.calls[0][0];
			expect(result).toHaveProperty('id', retreat.id);
			expect(result).toHaveProperty('parish');
			expect(result).toHaveProperty('isPublic');
			expect(result).toHaveProperty('startDate');
			expect(result).toHaveProperty('endDate');
			expect(result).toHaveProperty('flyer_options');
		});

		test('should not include sensitive data in public response', async () => {
			const env = await TestDataFactory.createCompleteTestEnvironment();
			const retreat = env.retreat;

			const req = createMockRequest({ params: { id: retreat.id } });
			const res = createMockResponse();
			const next = mockNext;

			// Mock findById to return the created retreat
			jest.spyOn(retreatService, 'findById').mockResolvedValue(retreat);

			await retreatController.getRetreatByIdPublic(req, res, next);

			const result = res.json.mock.calls[0][0];
			// Should not include these fields
			expect(result).not.toHaveProperty('createdBy');
			expect(result).not.toHaveProperty('notes');
			expect(result).not.toHaveProperty('flyer_data');
		});
	});

	describe('createRetreat', () => {
		test('should return 401 when user is not authenticated', async () => {
			const req = createMockRequest({ user: null, body: { parish: 'Test' } });
			const res = createMockResponse();
			const next = mockNext;

			await retreatController.createRetreat(req, res, next);

			expect(res.status).toHaveBeenCalledWith(401);
			expect(res.json).toHaveBeenCalledWith({ message: 'Unauthorized' });
		});

		test('should create retreat when authenticated', async () => {
			const env = await TestDataFactory.createCompleteTestEnvironment();

			const retreatData = {
				parish: 'New Retreat Parish',
				startDate: new Date(),
				endDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
				houseId: env.retreat.houseId,
			};

			const req = createMockRequest({ user: { id: testUser.id }, body: retreatData });
			const res = createMockResponse();
			const next = mockNext;

			jest.spyOn(retreatService, 'createRetreat').mockResolvedValue({
				id: uuidv4(),
				...retreatData,
				createdBy: testUser.id,
			});

			await retreatController.createRetreat(req, res, next);

			expect(res.status).toHaveBeenCalledWith(201);
			expect(res.json).toHaveBeenCalled();
			const result = res.json.mock.calls[0][0];
			expect(result).toHaveProperty('parish', 'New Retreat Parish');
		});

		test('should add createdBy to retreat data', async () => {
			const env = await TestDataFactory.createCompleteTestEnvironment();

			const retreatData = {
				parish: 'Test Parish',
				startDate: new Date(),
				endDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
				houseId: env.retreat.houseId,
			};

			const req = createMockRequest({ user: { id: testUser.id }, body: retreatData });
			const res = createMockResponse();
			const next = mockNext;

			const mockRetreat = { id: uuidv4(), ...retreatData, createdBy: testUser.id };
			jest.spyOn(retreatService, 'createRetreat').mockResolvedValue(mockRetreat);

			await retreatController.createRetreat(req, res, next);

			const createRetreatSpy = retreatService.createRetreat as jest.Mock;
			expect(createRetreatSpy).toHaveBeenCalled();
			const callArg = createRetreatSpy.mock.calls[0][0];
			expect(callArg).toHaveProperty('createdBy', testUser.id);
		});
	});

	describe('updateRetreat', () => {
		test('should return 404 for non-existent retreat', async () => {
			const req = createMockRequest({ params: { id: uuidv4() }, body: { parish: 'Updated' } });
			const res = createMockResponse();
			const next = mockNext;

			jest.spyOn(retreatService, 'update').mockResolvedValue(null);

			await retreatController.updateRetreat(req, res, next);

			expect(res.status).toHaveBeenCalledWith(404);
			expect(res.json).toHaveBeenCalledWith({ message: 'Retreat not found' });
		});

		test('should update retreat when valid', async () => {
			const env = await TestDataFactory.createCompleteTestEnvironment();
			const retreat = env.retreat;

			const req = createMockRequest({
				params: { id: retreat.id },
				body: { parish: 'Updated Parish' },
			});
			const res = createMockResponse();
			const next = mockNext;

			const updatedRetreat = { ...retreat, parish: 'Updated Parish' };
			jest.spyOn(retreatService, 'update').mockResolvedValue(updatedRetreat);

			await retreatController.updateRetreat(req, res, next);

			expect(res.json).toHaveBeenCalled();
			const result = res.json.mock.calls[0][0];
			expect(result).toHaveProperty('parish', 'Updated Parish');
		});
	});

	describe('exportRoomLabelsToDocx', () => {
		test('should return 400 for invalid retreat ID format', async () => {
			const req = createMockRequest({ params: { id: 'invalid-id-format' } });
			const res = createMockResponse();
			const next = mockNext;

			await retreatController.exportRoomLabelsToDocx(req, res, next);

			expect(res.status).toHaveBeenCalledWith(400);
			expect(res.json).toHaveBeenCalledWith({ message: 'Invalid retreat ID' });
		});

		test('should return DOCX buffer for valid retreat', async () => {
			const env = await TestDataFactory.createCompleteTestEnvironment();
			const retreat = env.retreat;
			const mockBuffer = Buffer.from('mock docx content');

			const req = createMockRequest({ params: { id: retreat.id } });
			const res = createMockResponse();
			const next = mockNext;

			// Get the mocked function
			const roomService = require('../../services/roomService');
			roomService.exportRoomLabelsToDocx.mockResolvedValue(mockBuffer);

			await retreatController.exportRoomLabelsToDocx(req, res, next);

			expect(res.setHeader).toHaveBeenCalledWith(
				'Content-Type',
				'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
			);
			expect(res.setHeader).toHaveBeenCalledWith(
				'Content-Disposition',
				expect.stringContaining('attachment'),
			);
			expect(res.setHeader).toHaveBeenCalledWith('Content-Length', mockBuffer.length);
			expect(res.send).toHaveBeenCalledWith(mockBuffer);
		});

		test('should call next with error on service error', async () => {
			const env = await TestDataFactory.createCompleteTestEnvironment();
			const retreat = env.retreat;

			const req = createMockRequest({ params: { id: retreat.id } });
			const res = createMockResponse();
			const next = mockNext;

			// Get the mocked function
			const roomService = require('../../services/roomService');
			roomService.exportRoomLabelsToDocx.mockRejectedValue(new Error('Export failed'));

			await retreatController.exportRoomLabelsToDocx(req, res, next);

			expect(next).toHaveBeenCalledWith(expect.any(Error));
		});
	});

	describe('exportBadgesToDocx', () => {
		test('should return 400 for invalid retreat ID format', async () => {
			const req = createMockRequest({ params: { id: 'invalid-id' } });
			const res = createMockResponse();
			const next = mockNext;

			await retreatController.exportBadgesToDocx(req, res, next);

			expect(res.status).toHaveBeenCalledWith(400);
			expect(res.json).toHaveBeenCalledWith({ message: 'Invalid retreat ID' });
		});

		test('should return DOCX buffer for valid retreat with participants', async () => {
			const env = await TestDataFactory.createCompleteTestEnvironment();
			const retreat = env.retreat;
			const mockBuffer = Buffer.from('mock badges content');

			const req = createMockRequest({ params: { id: retreat.id } });
			const res = createMockResponse();
			const next = mockNext;

			// Get the mocked function
			const badgeService = require('../../services/badgeService');
			badgeService.exportBadgesToDocx.mockResolvedValue(mockBuffer);

			await retreatController.exportBadgesToDocx(req, res, next);

			expect(res.setHeader).toHaveBeenCalledWith(
				'Content-Type',
				'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
			);
			expect(res.setHeader).toHaveBeenCalledWith(
				'Content-Disposition',
				expect.stringContaining('gafetes-participantes'),
			);
			expect(res.send).toHaveBeenCalledWith(mockBuffer);
		});

		test('should return 404 when no participants are assigned', async () => {
			const env = await TestDataFactory.createCompleteTestEnvironment();
			const retreat = env.retreat;

			const req = createMockRequest({ params: { id: retreat.id } });
			const res = createMockResponse();
			const next = mockNext;

			// Get the mocked function
			const badgeService = require('../../services/badgeService');
			badgeService.exportBadgesToDocx.mockResolvedValue(null);

			await retreatController.exportBadgesToDocx(req, res, next);

			expect(res.status).toHaveBeenCalledWith(404);
			expect(res.json).toHaveBeenCalled();
			const response = res.json.mock.calls[0][0];
			expect(response).toHaveProperty('message');
			expect(response.message).toContain('gafetes');
		});
	});
});
