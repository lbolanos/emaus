/**
 * Tests for the dry-run mode in participant registration (POST /participants/new).
 * Verifies that when dryRun: true is sent in the request body:
 * - reCAPTCHA is still validated
 * - validateParticipant is called instead of createParticipant
 * - Returns 200 with validation results
 * - Normal creation still works when dryRun is absent
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
const mockCreateParticipant = jest.fn();
const mockValidateParticipant = jest.fn();
jest.mock('../../services/participantService', () => ({
	checkParticipantExists: jest.fn(),
	createParticipant: mockCreateParticipant,
	confirmExistingParticipant: jest.fn(),
	validateParticipant: mockValidateParticipant,
}));

import { Request, Response, NextFunction } from 'express';
import { createParticipant } from '../../controllers/participantController';

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

// Valid participant data that passes Zod schema validation
const validWalkerBody = {
	recaptchaToken: 'valid-token',
	type: 'walker' as const,
	firstName: 'María',
	lastName: 'García',
	nickname: 'Mari',
	birthDate: '1990-05-15',
	maritalStatus: 'S' as const,
	street: 'Calle Principal',
	houseNumber: '123',
	postalCode: '06600',
	neighborhood: 'Condesa',
	city: 'Ciudad de México',
	state: 'CDMX',
	country: 'MX',
	cellPhone: '5551234567',
	email: 'test@example.com',
	occupation: 'Ingeniera',
	snores: false,
	hasMedication: false,
	hasDietaryRestrictions: false,
	sacraments: ['baptism' as const],
	emergencyContact1Name: 'Juan García',
	emergencyContact1Relation: 'Padre',
	emergencyContact1CellPhone: '5559876543',
	retreatId: '00000000-0000-0000-0000-000000000001',
};

const validServerBody = {
	...validWalkerBody,
	type: 'server' as const,
};

describe('Dry-Run Mode - createParticipant controller', () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	describe('when dryRun is true', () => {
		it('should return 200 with validation results on valid data', async () => {
			mockVerifyToken.mockResolvedValue({ valid: true });
			mockValidateParticipant.mockResolvedValue({
				valid: true,
				warnings: [],
			});

			const req = createMockReq({
				body: { ...validWalkerBody, dryRun: true },
			});
			const res = createMockRes();

			await createParticipant(req, res, mockNext);

			expect(res.status).toHaveBeenCalledWith(200);
			expect(res.json).toHaveBeenCalledWith({
				valid: true,
				warnings: [],
			});
			// Must NOT call the real create
			expect(mockCreateParticipant).not.toHaveBeenCalled();
		});

		it('should return warnings for duplicate email', async () => {
			mockVerifyToken.mockResolvedValue({ valid: true });
			mockValidateParticipant.mockResolvedValue({
				valid: true,
				warnings: [
					'Ya existe un participante con este correo: Juan Pérez. Se actualizará su registro.',
				],
			});

			const req = createMockReq({
				body: { ...validWalkerBody, dryRun: true, email: 'existing@example.com' },
			});
			const res = createMockRes();

			await createParticipant(req, res, mockNext);

			expect(res.status).toHaveBeenCalledWith(200);
			const responseData = (res.json as jest.Mock).mock.calls[0][0];
			expect(responseData.valid).toBe(true);
			expect(responseData.warnings).toHaveLength(1);
			expect(responseData.warnings[0]).toContain('Ya existe');
		});

		it('should return error when retreat is not found', async () => {
			mockVerifyToken.mockResolvedValue({ valid: true });
			mockValidateParticipant.mockResolvedValue({
				valid: false,
				error: 'Retiro no encontrado',
				warnings: [],
			});

			const req = createMockReq({
				body: { ...validWalkerBody, dryRun: true, retreatId: '00000000-0000-0000-0000-999999999999' },
			});
			const res = createMockRes();

			await createParticipant(req, res, mockNext);

			expect(res.status).toHaveBeenCalledWith(200);
			const responseData = (res.json as jest.Mock).mock.calls[0][0];
			expect(responseData.valid).toBe(false);
			expect(responseData.error).toBe('Retiro no encontrado');
		});

		it('should return capacity warning when retreat is full', async () => {
			mockVerifyToken.mockResolvedValue({ valid: true });
			mockValidateParticipant.mockResolvedValue({
				valid: true,
				warnings: [
					'El retiro ha alcanzado su capacidad máxima de caminantes (30). El participante quedará en lista de espera.',
				],
			});

			const req = createMockReq({
				body: { ...validWalkerBody, dryRun: true },
			});
			const res = createMockRes();

			await createParticipant(req, res, mockNext);

			const responseData = (res.json as jest.Mock).mock.calls[0][0];
			expect(responseData.valid).toBe(true);
			expect(responseData.warnings[0]).toContain('capacidad máxima');
		});

		it('should still enforce reCAPTCHA on dry-run requests', async () => {
			mockVerifyToken.mockResolvedValue({ valid: false, error: 'Bot detected' });

			const req = createMockReq({
				body: { ...validWalkerBody, recaptchaToken: 'bad-token', dryRun: true },
			});
			const res = createMockRes();

			await createParticipant(req, res, mockNext);

			expect(res.status).toHaveBeenCalledWith(400);
			expect(res.json).toHaveBeenCalledWith({ message: 'Bot detected' });
			expect(mockValidateParticipant).not.toHaveBeenCalled();
			expect(mockCreateParticipant).not.toHaveBeenCalled();
		});

		it('should pass participant data without dryRun/recaptchaToken to validateParticipant', async () => {
			mockVerifyToken.mockResolvedValue({ valid: true });
			mockValidateParticipant.mockResolvedValue({ valid: true, warnings: [] });

			const req = createMockReq({
				body: { ...validWalkerBody, dryRun: true },
			});
			const res = createMockRes();

			await createParticipant(req, res, mockNext);

			// validateParticipant should receive clean, Zod-validated participant data (no recaptchaToken, no dryRun)
			const calledWith = mockValidateParticipant.mock.calls[0][0];
			expect(calledWith.email).toBe(validWalkerBody.email);
			expect(calledWith.firstName).toBe(validWalkerBody.firstName);
			expect(calledWith.lastName).toBe(validWalkerBody.lastName);
			expect(calledWith.type).toBe(validWalkerBody.type);
			expect(calledWith).not.toHaveProperty('recaptchaToken');
			expect(calledWith).not.toHaveProperty('dryRun');
		});

		it('should call next when validateParticipant throws', async () => {
			mockVerifyToken.mockResolvedValue({ valid: true });
			const error = new Error('Unexpected DB error');
			mockValidateParticipant.mockRejectedValue(error);

			const req = createMockReq({
				body: { ...validWalkerBody, dryRun: true },
			});
			const res = createMockRes();

			await createParticipant(req, res, mockNext);

			expect(mockNext).toHaveBeenCalledWith(error);
		});
	});

	describe('when dryRun is absent or false', () => {
		it('should create participant normally when dryRun is not sent', async () => {
			mockVerifyToken.mockResolvedValue({ valid: true });
			const newParticipant = { id: '456', email: 'new@example.com' };
			mockCreateParticipant.mockResolvedValue(newParticipant);

			const req = createMockReq({
				body: { ...validServerBody, email: 'new@example.com' },
			});
			const res = createMockRes();

			await createParticipant(req, res, mockNext);

			expect(res.status).toHaveBeenCalledWith(201);
			expect(res.json).toHaveBeenCalledWith(newParticipant);
			expect(mockValidateParticipant).not.toHaveBeenCalled();
		});

		it('should create participant normally when dryRun is false', async () => {
			mockVerifyToken.mockResolvedValue({ valid: true });
			const newParticipant = { id: '789', email: 'another@example.com' };
			mockCreateParticipant.mockResolvedValue(newParticipant);

			const req = createMockReq({
				body: { ...validWalkerBody, dryRun: false, email: 'another@example.com' },
			});
			const res = createMockRes();

			await createParticipant(req, res, mockNext);

			expect(res.status).toHaveBeenCalledWith(201);
			expect(mockValidateParticipant).not.toHaveBeenCalled();
		});

		it('should create participant normally when dryRun is a string "true" (not boolean)', async () => {
			mockVerifyToken.mockResolvedValue({ valid: true });
			const newParticipant = { id: '101', email: 'string@example.com' };
			mockCreateParticipant.mockResolvedValue(newParticipant);

			const req = createMockReq({
				body: { ...validWalkerBody, dryRun: 'true', email: 'string@example.com' },
			});
			const res = createMockRes();

			await createParticipant(req, res, mockNext);

			// Strict check: dryRun === true, not truthy
			expect(res.status).toHaveBeenCalledWith(201);
			expect(mockValidateParticipant).not.toHaveBeenCalled();
		});
	});
});
