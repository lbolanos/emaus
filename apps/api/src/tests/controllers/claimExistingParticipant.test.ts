/**
 * Public registration identifies people by email: createParticipant reuses — and
 * overwrites — whichever participant already holds that address. That is correct for
 * a re-registration, but not when someone just answered "that's not me" on the
 * identity screen: taking over the record would erase a third party's name and
 * retreat history.
 *
 * The client sends `claimExisting: false` in that case, and the alta must be rejected.
 *
 * Database-independent: uses Jest mocks.
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

const mockCreateParticipant = jest.fn();
const mockValidateParticipant = jest.fn();
const mockFindParticipantByEmail = jest.fn();
jest.mock('../../services/participantService', () => ({
	checkParticipantExists: jest.fn(),
	createParticipant: mockCreateParticipant,
	confirmExistingParticipant: jest.fn(),
	validateParticipant: mockValidateParticipant,
	findParticipantByEmail: mockFindParticipantByEmail,
}));

import { Request, Response, NextFunction } from 'express';
import { createParticipant } from '../../controllers/participantController';

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

const validServerBody = {
	recaptchaToken: 'valid-token',
	type: 'server' as const,
	firstName: 'Leonel',
	lastName: 'Ruiz',
	nickname: 'Leo',
	birthDate: '1980-03-11',
	maritalStatus: 'S' as const,
	street: 'Calle Principal',
	houseNumber: '123',
	postalCode: '06600',
	neighborhood: 'Condesa',
	city: 'Ciudad de México',
	state: 'CDMX',
	country: 'MX',
	cellPhone: '5551234567',
	email: 'shared@example.com',
	occupation: 'Ingeniero',
	snores: false,
	hasMedication: false,
	hasDietaryRestrictions: false,
	sacraments: ['baptism' as const],
	emergencyContact1Name: 'Ana Ruiz',
	emergencyContact1Relation: 'Hermana',
	emergencyContact1CellPhone: '5559876543',
	retreatId: '00000000-0000-0000-0000-000000000001',
};

const anotherPersonsRecord = {
	id: 'participant-owned-by-someone-else',
	firstName: 'Andrés',
	lastName: 'Salas',
	email: 'shared@example.com',
};

describe('createParticipant controller - claimExisting guard', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockVerifyToken.mockResolvedValue({ valid: true });
		mockCreateParticipant.mockResolvedValue({ id: 'new-participant' });
	});

	describe('when the registrant denied the identity (claimExisting: false)', () => {
		it('rejects with 409 when the email belongs to another participant', async () => {
			mockFindParticipantByEmail.mockResolvedValue(anotherPersonsRecord);

			const req = createMockReq({
				body: { ...validServerBody, claimExisting: false },
			});
			const res = createMockRes();

			await createParticipant(req, res, mockNext);

			expect(res.status).toHaveBeenCalledWith(409);
			const payload = (res.json as jest.Mock).mock.calls[0][0];
			expect(payload.code).toBe('EMAIL_BELONGS_TO_ANOTHER_PARTICIPANT');
			expect(payload.message).toContain('otra persona');
		});

		it('never overwrites the other person record', async () => {
			mockFindParticipantByEmail.mockResolvedValue(anotherPersonsRecord);

			const req = createMockReq({
				body: { ...validServerBody, claimExisting: false },
			});

			await createParticipant(req, createMockRes(), mockNext);

			expect(mockCreateParticipant).not.toHaveBeenCalled();
		});

		it('rejects in dry-run too, so the test mode does not report a valid registration', async () => {
			mockFindParticipantByEmail.mockResolvedValue(anotherPersonsRecord);
			mockValidateParticipant.mockResolvedValue({ valid: true, warnings: [] });

			const req = createMockReq({
				body: { ...validServerBody, claimExisting: false, dryRun: true },
			});
			const res = createMockRes();

			await createParticipant(req, res, mockNext);

			expect(res.status).toHaveBeenCalledWith(409);
			expect(mockValidateParticipant).not.toHaveBeenCalled();
		});

		it('lets the registration through when the email is free', async () => {
			mockFindParticipantByEmail.mockResolvedValue(null);

			const req = createMockReq({
				body: { ...validServerBody, claimExisting: false, email: 'mine@example.com' },
			});
			const res = createMockRes();

			await createParticipant(req, res, mockNext);

			expect(mockCreateParticipant).toHaveBeenCalled();
			expect(res.status).toHaveBeenCalledWith(201);
		});

		it('does not leak claimExisting into the participant data', async () => {
			mockFindParticipantByEmail.mockResolvedValue(null);

			const req = createMockReq({
				body: { ...validServerBody, claimExisting: false, email: 'mine@example.com' },
			});

			await createParticipant(req, createMockRes(), mockNext);

			expect(mockCreateParticipant.mock.calls[0][0]).not.toHaveProperty('claimExisting');
		});
	});

	describe('when the flag is absent (re-registration, import, admin)', () => {
		it('keeps reusing the existing record, as before', async () => {
			mockFindParticipantByEmail.mockResolvedValue(anotherPersonsRecord);

			const req = createMockReq({ body: { ...validServerBody } });
			const res = createMockRes();

			await createParticipant(req, res, mockNext);

			expect(mockCreateParticipant).toHaveBeenCalled();
			expect(res.status).toHaveBeenCalledWith(201);
		});
	});
});
