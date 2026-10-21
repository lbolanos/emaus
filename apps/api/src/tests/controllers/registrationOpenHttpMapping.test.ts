/**
 * HTTP mapping for RETREAT_REGISTRATION_NOT_OPEN in participantController.
 *
 * The service throws code RETREAT_REGISTRATION_NOT_OPEN when the retreat is
 * announced (visible on the landing) but not published yet. Both public
 * entrypoints — POST /participants/new and the confirm-existing email flow —
 * must answer 400 (bad request for this retreat), not 500.
 *
 * Database-independent: uses Jest mocks (same stack as dryRunParticipant).
 */

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

const mockVerifyToken = jest.fn();
jest.mock('../../services/recaptchaService', () => ({
	RecaptchaService: jest.fn().mockImplementation(() => ({
		verifyToken: mockVerifyToken,
	})),
}));

const notOpenError = Object.assign(
	new Error('Las inscripciones de este retiro aún no están abiertas.'),
	{ code: 'RETREAT_REGISTRATION_NOT_OPEN' },
);

const mockCreateParticipant = jest.fn();
const mockConfirmExistingParticipant = jest.fn();
jest.mock('../../services/participantService', () => ({
	checkParticipantExists: jest.fn(),
	createParticipant: mockCreateParticipant,
	confirmExistingParticipant: mockConfirmExistingParticipant,
	validateParticipant: jest.fn(),
}));

import { Request, Response, NextFunction } from 'express';
import {
	createParticipant,
	confirmExistingParticipantEmail,
} from '../../controllers/participantController';

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

// Valid walker body that passes the Zod schema of POST /participants/new.
const validWalkerBody = {
	recaptchaToken: 'valid-token',
	type: 'walker' as const,
	firstName: 'María',
	lastName: 'García',
	nickname: 'Mary',
	occupation: 'Maestra',
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
	snores: false,
	hasMedication: false,
	hasDietaryRestrictions: false,
	sacraments: ['baptism' as const],
	emergencyContact1Name: 'Juan García',
	emergencyContact1Relation: 'Padre',
	emergencyContact1CellPhone: '5559876543',
	retreatId: '00000000-0000-0000-0000-000000000001',
};

describe('RETREAT_REGISTRATION_NOT_OPEN → HTTP 400', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockVerifyToken.mockResolvedValue({ valid: true });
	});

	it('POST /participants/new answers 400 with the code', async () => {
		mockCreateParticipant.mockRejectedValue(notOpenError);

		const req = createMockReq({ body: { ...validWalkerBody } });
		const res = createMockRes();

		await createParticipant(req, res, mockNext);

		expect(res.status).toHaveBeenCalledWith(400);
		expect(res.json).toHaveBeenCalledWith({
			message: notOpenError.message,
			code: 'RETREAT_REGISTRATION_NOT_OPEN',
		});
		expect(mockNext).not.toHaveBeenCalled();
	});

	it('confirm-existing email flow answers 400 with the code', async () => {
		mockConfirmExistingParticipant.mockRejectedValue(notOpenError);

		const req = createMockReq({
			body: {
				email: 'test@example.com',
				retreatId: '00000000-0000-0000-0000-000000000001',
				type: 'walker',
				recaptchaToken: 'valid-token',
			},
		});
		const res = createMockRes();

		await confirmExistingParticipantEmail(req, res, mockNext);

		expect(res.status).toHaveBeenCalledWith(400);
		expect(res.json).toHaveBeenCalledWith({
			message: notOpenError.message,
			code: 'RETREAT_REGISTRATION_NOT_OPEN',
		});
		expect(mockNext).not.toHaveBeenCalled();
	});
});
