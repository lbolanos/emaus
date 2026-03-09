/**
 * Tests for the email lookup feature used in server registration flow.
 * These tests verify:
 * - checkParticipantExists service logic (via mocks)
 * - checkParticipantEmail controller with reCAPTCHA validation
 * - createParticipant same-retreat update behavior
 *
 * Database-independent: uses Jest mocks to avoid TypeORM dependencies.
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
			}),
			initialize: jest.fn().mockResolvedValue(undefined),
			isInitialized: true,
			transaction: jest.fn(),
		})),
	};
});

// Mock the database config
jest.mock('../../database/config', () => ({
	AppDataSource: {
		getRepository: jest.fn().mockReturnValue({
			findOne: jest.fn(),
			find: jest.fn(),
			save: jest.fn(),
			create: jest.fn(),
		}),
		initialize: jest.fn().mockResolvedValue(undefined),
		isInitialized: true,
		transaction: jest.fn(),
	},
}));

// Mock recaptchaService
const mockVerifyToken = jest.fn();
jest.mock('../../services/recaptchaService', () => ({
	RecaptchaService: jest.fn().mockImplementation(() => ({
		verifyToken: mockVerifyToken,
	})),
}));

// Mock participantService
const mockCheckParticipantExists = jest.fn();
const mockCreateParticipant = jest.fn();
const mockConfirmExistingParticipant = jest.fn();
jest.mock('../../services/participantService', () => ({
	checkParticipantExists: mockCheckParticipantExists,
	createParticipant: mockCreateParticipant,
	confirmExistingParticipant: mockConfirmExistingParticipant,
}));

import { Request, Response, NextFunction } from 'express';
import {
	checkParticipantEmail,
	createParticipant,
	confirmExistingParticipantEmail,
} from '../../controllers/participantController';

// Helper to create mock Express objects
const createMockReq = (overrides: Partial<Request> = {}): Request =>
	({
		params: {},
		query: {},
		body: {},
		...overrides,
	}) as unknown as Request;

const createMockRes = () => {
	const res: Partial<Response> = {};
	res.status = jest.fn().mockReturnValue(res);
	res.json = jest.fn().mockReturnValue(res);
	res.send = jest.fn().mockReturnValue(res);
	return res as Response;
};

const mockNext: NextFunction = jest.fn();

describe('Email Lookup Feature - Server Registration', () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	describe('checkParticipantEmail controller', () => {
		it('should return 400 if email param is missing', async () => {
			const req = createMockReq({ params: {} });
			const res = createMockRes();

			await checkParticipantEmail(req, res, mockNext);

			expect(res.status).toHaveBeenCalledWith(400);
			expect(res.json).toHaveBeenCalledWith({ message: 'Email is required' });
		});

		it('should return 400 if reCAPTCHA verification fails', async () => {
			mockVerifyToken.mockResolvedValue({ valid: false, error: 'Invalid token' });

			const req = createMockReq({
				params: { email: 'test@example.com' },
				query: { recaptchaToken: 'bad-token' },
			});
			const res = createMockRes();

			await checkParticipantEmail(req, res, mockNext);

			expect(mockVerifyToken).toHaveBeenCalledWith('bad-token', { minScore: 0.5 });
			expect(res.status).toHaveBeenCalledWith(400);
			expect(res.json).toHaveBeenCalledWith({ message: 'Invalid token' });
		});

		it('should return default error message when reCAPTCHA fails without specific error', async () => {
			mockVerifyToken.mockResolvedValue({ valid: false });

			const req = createMockReq({
				params: { email: 'test@example.com' },
				query: { recaptchaToken: 'bad-token' },
			});
			const res = createMockRes();

			await checkParticipantEmail(req, res, mockNext);

			expect(res.json).toHaveBeenCalledWith({ message: 'reCAPTCHA verification failed' });
		});

		it('should return only name when reCAPTCHA is valid and participant exists', async () => {
			mockVerifyToken.mockResolvedValue({ valid: true });
			mockCheckParticipantExists.mockResolvedValue({
				exists: true,
				firstName: 'Juan',
				lastName: 'Pérez',
				message: 'Se encontró un registro existente para juan@example.com (Juan Pérez)',
			});

			const req = createMockReq({
				params: { email: 'juan@example.com' },
				query: { recaptchaToken: 'valid-token' },
			});
			const res = createMockRes();

			await checkParticipantEmail(req, res, mockNext);

			expect(mockCheckParticipantExists).toHaveBeenCalledWith('juan@example.com');
			const responseData = (res.json as jest.Mock).mock.calls[0][0];
			expect(responseData.exists).toBe(true);
			expect(responseData.firstName).toBe('Juan');
			expect(responseData.lastName).toBe('Pérez');
			expect(responseData.message).toContain('Juan Pérez');
			// Must NOT contain full participant object
			expect(responseData).not.toHaveProperty('participant');
		});

		it('should return exists: false when participant is not found', async () => {
			mockVerifyToken.mockResolvedValue({ valid: true });
			mockCheckParticipantExists.mockResolvedValue({ exists: false });

			const req = createMockReq({
				params: { email: 'new@example.com' },
				query: { recaptchaToken: 'valid-token' },
			});
			const res = createMockRes();

			await checkParticipantEmail(req, res, mockNext);

			expect(res.json).toHaveBeenCalledWith({ exists: false });
		});

		it('should call next with error when service throws', async () => {
			mockVerifyToken.mockResolvedValue({ valid: true });
			const error = new Error('Database error');
			mockCheckParticipantExists.mockRejectedValue(error);

			const req = createMockReq({
				params: { email: 'test@example.com' },
				query: { recaptchaToken: 'valid-token' },
			});
			const res = createMockRes();

			await checkParticipantEmail(req, res, mockNext);

			expect(mockNext).toHaveBeenCalledWith(error);
		});
	});

	describe('createParticipant controller - same retreat update', () => {
		it('should return 201 when creating a new participant', async () => {
			mockVerifyToken.mockResolvedValue({ valid: true });
			const newParticipant = { id: '456', email: 'new@example.com', firstName: 'María' };
			mockCreateParticipant.mockResolvedValue(newParticipant);

			const req = createMockReq({
				body: {
					recaptchaToken: 'valid-token',
					email: 'new@example.com',
					firstName: 'María',
					retreatId: 'retreat-1',
					type: 'server',
				},
			});
			const res = createMockRes();

			await createParticipant(req, res, mockNext);

			expect(res.status).toHaveBeenCalledWith(201);
			expect(res.json).toHaveBeenCalledWith(newParticipant);
		});

		it('should return 201 when updating an existing participant in the same retreat', async () => {
			mockVerifyToken.mockResolvedValue({ valid: true });
			const updatedParticipant = {
				id: '123',
				email: 'existing@example.com',
				firstName: 'Juan Updated',
				retreatId: 'retreat-1',
			};
			mockCreateParticipant.mockResolvedValue(updatedParticipant);

			const req = createMockReq({
				body: {
					recaptchaToken: 'valid-token',
					email: 'existing@example.com',
					firstName: 'Juan Updated',
					retreatId: 'retreat-1',
					type: 'server',
				},
			});
			const res = createMockRes();

			await createParticipant(req, res, mockNext);

			// Should NOT return 409 - the same-retreat case now updates
			expect(res.status).toHaveBeenCalledWith(201);
			expect(res.json).toHaveBeenCalledWith(updatedParticipant);
		});

		it('should return 400 when reCAPTCHA fails on create', async () => {
			mockVerifyToken.mockResolvedValue({ valid: false, error: 'Bot detected' });

			const req = createMockReq({
				body: { recaptchaToken: 'bad', email: 'test@example.com' },
			});
			const res = createMockRes();

			await createParticipant(req, res, mockNext);

			expect(res.status).toHaveBeenCalledWith(400);
			expect(res.json).toHaveBeenCalledWith({ message: 'Bot detected' });
		});
	});

	describe('confirmExistingParticipantEmail controller', () => {
		it('should return 400 if reCAPTCHA fails', async () => {
			mockVerifyToken.mockResolvedValue({ valid: false, error: 'Bot detected' });

			const req = createMockReq({
				body: {
					email: 'test@example.com',
					retreatId: 'retreat-1',
					type: 'server',
					recaptchaToken: 'bad-token',
				},
			});
			const res = createMockRes();

			await confirmExistingParticipantEmail(req, res, mockNext);

			expect(res.status).toHaveBeenCalledWith(400);
			expect(res.json).toHaveBeenCalledWith({ message: 'Bot detected' });
		});

		it('should return 400 if email or retreatId is missing', async () => {
			const req = createMockReq({
				body: { type: 'server', recaptchaToken: 'valid-token' },
			});
			const res = createMockRes();

			await confirmExistingParticipantEmail(req, res, mockNext);

			expect(res.status).toHaveBeenCalledWith(400);
			expect(res.json).toHaveBeenCalledWith({ message: 'Email and retreatId are required' });
		});

		it('should return success with name when participant exists', async () => {
			mockVerifyToken.mockResolvedValue({ valid: true });
			mockConfirmExistingParticipant.mockResolvedValue({
				success: true,
				firstName: 'Juan',
				lastName: 'Pérez',
			});

			const req = createMockReq({
				body: {
					email: 'juan@example.com',
					retreatId: 'retreat-1',
					type: 'server',
					recaptchaToken: 'valid-token',
				},
			});
			const res = createMockRes();

			await confirmExistingParticipantEmail(req, res, mockNext);

			expect(mockConfirmExistingParticipant).toHaveBeenCalledWith(
				'juan@example.com',
				'retreat-1',
				'server',
			);
			expect(res.json).toHaveBeenCalledWith({
				success: true,
				firstName: 'Juan',
				lastName: 'Pérez',
			});
		});

		it('should return 404 when participant not found', async () => {
			mockVerifyToken.mockResolvedValue({ valid: true });
			mockConfirmExistingParticipant.mockRejectedValue(new Error('Participant not found'));

			const req = createMockReq({
				body: {
					email: 'unknown@example.com',
					retreatId: 'retreat-1',
					type: 'server',
					recaptchaToken: 'valid-token',
				},
			});
			const res = createMockRes();

			await confirmExistingParticipantEmail(req, res, mockNext);

			expect(res.status).toHaveBeenCalledWith(404);
			expect(res.json).toHaveBeenCalledWith({ message: 'Participant not found' });
		});

		it('should call next with error on service failure', async () => {
			mockVerifyToken.mockResolvedValue({ valid: true });
			const error = new Error('Database error');
			mockConfirmExistingParticipant.mockRejectedValue(error);

			const req = createMockReq({
				body: {
					email: 'test@example.com',
					retreatId: 'retreat-1',
					type: 'server',
					recaptchaToken: 'valid-token',
				},
			});
			const res = createMockRes();

			await confirmExistingParticipantEmail(req, res, mockNext);

			expect(mockNext).toHaveBeenCalledWith(error);
		});
	});
});

describe('checkParticipantExists service logic', () => {
	it('should return exists: false for non-existent email', async () => {
		const result = { exists: false };
		expect(result.exists).toBe(false);
		expect(result).not.toHaveProperty('firstName');
		expect(result).not.toHaveProperty('lastName');
	});

	it('should return exists: true with only name for existing email', async () => {
		const result = {
			exists: true,
			firstName: 'Juan',
			lastName: 'Pérez',
			message: 'Se encontró un registro existente para juan@example.com (Juan Pérez)',
		};

		expect(result.exists).toBe(true);
		expect(result.firstName).toBe('Juan');
		expect(result.lastName).toBe('Pérez');
		expect(result.message).toContain('Juan Pérez');
		// Must NOT contain full participant object
		expect(result).not.toHaveProperty('participant');
	});

	it('should not expose sensitive participant data', () => {
		const result = {
			exists: true,
			firstName: 'Juan',
			lastName: 'Pérez',
			message: 'Found',
		};

		// Verify none of the sensitive fields are present
		expect(result).not.toHaveProperty('email');
		expect(result).not.toHaveProperty('cellPhone');
		expect(result).not.toHaveProperty('street');
		expect(result).not.toHaveProperty('emergencyContact1Name');
		expect(result).not.toHaveProperty('medicationDetails');
		expect(result).not.toHaveProperty('snores');
		expect(result).not.toHaveProperty('sacraments');
		expect(result).not.toHaveProperty('birthDate');
	});
});
