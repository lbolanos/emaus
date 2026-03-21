/**
 * Tests for the self-update participant endpoint (PUT /participants/self).
 * Verifies that regular_server users can update their own participant data
 * with only safe fields, and that unauthorized/invalid requests are rejected.
 *
 * Database-independent: uses Jest mocks.
 */

// Mock TypeORM before any imports
jest.mock('typeorm', () => {
	const actual = jest.requireActual('typeorm');
	return {
		...actual,
		DataSource: jest.fn().mockImplementation(() => ({
			getRepository: jest.fn().mockReturnValue({
				findOne: jest.fn(),
				find: jest.fn(),
				save: jest.fn(),
				create: jest.fn(),
				findOneBy: jest.fn(),
				merge: jest.fn(),
			}),
			initialize: jest.fn().mockResolvedValue(undefined),
			isInitialized: true,
			transaction: jest.fn(),
		})),
	};
});

jest.mock('../../data-source', () => ({
	AppDataSource: {
		getRepository: jest.fn().mockReturnValue({
			findOne: jest.fn(),
			find: jest.fn(),
			save: jest.fn(),
			create: jest.fn(),
			findOneBy: jest.fn(),
			merge: jest.fn(),
		}),
		initialize: jest.fn().mockResolvedValue(undefined),
		isInitialized: true,
		transaction: jest.fn(),
	},
}));

jest.mock('../../services/recaptchaService', () => ({
	RecaptchaService: jest.fn().mockImplementation(() => ({
		verifyToken: jest.fn().mockResolvedValue({ valid: true }),
	})),
}));

const mockFindAllParticipants = jest.fn();
const mockUpdateParticipant = jest.fn();
jest.mock('../../services/participantService', () => ({
	findAllParticipants: mockFindAllParticipants,
	updateParticipant: mockUpdateParticipant,
	checkParticipantExists: jest.fn(),
	createParticipant: jest.fn(),
	confirmExistingParticipant: jest.fn(),
}));

import { Request, Response, NextFunction } from 'express';
import { updateSelfParticipant } from '../../controllers/participantController';

describe('updateSelfParticipant controller', () => {
	let mockReq: Partial<Request>;
	let mockRes: Partial<Response>;
	let mockNext: NextFunction;
	let statusFn: jest.Mock;
	let jsonFn: jest.Mock;

	beforeEach(() => {
		jest.clearAllMocks();
		jsonFn = jest.fn();
		statusFn = jest.fn().mockReturnValue({ json: jsonFn });
		mockRes = {
			json: jsonFn,
			status: statusFn,
		};
		mockNext = jest.fn();
	});

	it('should return 401 if user is not authenticated', async () => {
		mockReq = { user: undefined, body: {} };
		await updateSelfParticipant(mockReq as Request, mockRes as Response, mockNext);
		expect(statusFn).toHaveBeenCalledWith(401);
	});

	it('should return 404 if no participant is linked to the user', async () => {
		mockReq = {
			user: { id: 'user-1' } as any,
			body: { retreatId: 'retreat-1', phone: '555-1234' },
		};
		mockFindAllParticipants.mockResolvedValue([
			{ id: 'p-2', userId: 'user-other' },
		]);

		await updateSelfParticipant(mockReq as Request, mockRes as Response, mockNext);
		expect(statusFn).toHaveBeenCalledWith(404);
	});

	it('should return 400 if no valid fields are provided', async () => {
		mockReq = {
			user: { id: 'user-1' } as any,
			body: { retreatId: 'retreat-1', type: 'admin', status: 'active' },
		};
		mockFindAllParticipants.mockResolvedValue([
			{ id: 'p-1', userId: 'user-1' },
		]);

		await updateSelfParticipant(mockReq as Request, mockRes as Response, mockNext);
		expect(statusFn).toHaveBeenCalledWith(400);
		expect(jsonFn).toHaveBeenCalledWith({ message: 'No valid fields to update' });
	});

	it('should filter out unsafe fields (type, status, tableId)', async () => {
		mockReq = {
			user: { id: 'user-1' } as any,
			body: {
				retreatId: 'retreat-1',
				phone: '555-9999',
				type: 'walker',
				tableId: 'table-hack',
				isCancelled: true,
			},
		};
		mockFindAllParticipants.mockResolvedValue([
			{ id: 'p-1', userId: 'user-1' },
		]);
		mockUpdateParticipant.mockResolvedValue({ id: 'p-1', phone: '555-9999' });

		await updateSelfParticipant(mockReq as Request, mockRes as Response, mockNext);

		expect(mockUpdateParticipant).toHaveBeenCalledWith('p-1', { phone: '555-9999' });
		expect(jsonFn).toHaveBeenCalledWith({ id: 'p-1', phone: '555-9999' });
	});

	it('should allow updating safe fields (phone, medicalConditions, etc.)', async () => {
		const safeData = {
			phone: '555-0000',
			emergencyContactName: 'Jane Doe',
			emergencyContactPhone: '555-1111',
			medicalConditions: 'None',
			allergies: 'Pollen',
			notes: 'Arrives late',
		};
		mockReq = {
			user: { id: 'user-1' } as any,
			body: { retreatId: 'retreat-1', ...safeData },
		};
		mockFindAllParticipants.mockResolvedValue([
			{ id: 'p-1', userId: 'user-1' },
		]);
		mockUpdateParticipant.mockResolvedValue({ id: 'p-1', ...safeData });

		await updateSelfParticipant(mockReq as Request, mockRes as Response, mockNext);

		expect(mockUpdateParticipant).toHaveBeenCalledWith('p-1', safeData);
		expect(jsonFn).toHaveBeenCalledWith({ id: 'p-1', ...safeData });
	});

	it('should return 404 if updateParticipant returns null', async () => {
		mockReq = {
			user: { id: 'user-1' } as any,
			body: { retreatId: 'retreat-1', phone: '555-1234' },
		};
		mockFindAllParticipants.mockResolvedValue([
			{ id: 'p-1', userId: 'user-1' },
		]);
		mockUpdateParticipant.mockResolvedValue(null);

		await updateSelfParticipant(mockReq as Request, mockRes as Response, mockNext);
		expect(statusFn).toHaveBeenCalledWith(404);
	});

	it('should call next on unexpected errors', async () => {
		const testError = new Error('DB connection failed');
		mockReq = {
			user: { id: 'user-1' } as any,
			body: { retreatId: 'retreat-1', phone: '555-1234' },
		};
		mockFindAllParticipants.mockRejectedValue(testError);

		await updateSelfParticipant(mockReq as Request, mockRes as Response, mockNext);
		expect(mockNext).toHaveBeenCalledWith(testError);
	});
});
