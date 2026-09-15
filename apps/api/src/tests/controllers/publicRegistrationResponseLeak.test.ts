/**
 * The public registration endpoints (`POST /participants/new`,
 * `POST /participants/couple/new`) identify people by email and reuse — updating
 * in place — whichever participant already holds that address (see
 * `claimExistingParticipant.test.ts`). Before this fix, the controller echoed
 * the full saved entity back in the HTTP response: anyone who knew a registered
 * participant's email could read their medication, dietary restrictions,
 * disability supports, notes, and both emergency contacts without logging in,
 * just by submitting a new registration for that address.
 *
 * The fix: the public response is a fixed whitelist DTO
 * (id/firstName/lastName/type/retreatId), never the entity.
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
const mockCreateCoupleParticipants = jest.fn();
jest.mock('../../services/participantService', () => ({
	checkParticipantExists: jest.fn(),
	createParticipant: mockCreateParticipant,
	createCoupleParticipants: mockCreateCoupleParticipants,
	confirmExistingParticipant: jest.fn(),
	validateParticipant: jest.fn(),
	validateCoupleParticipants: jest.fn(),
	findParticipantByEmail: jest.fn(),
}));

import { Request, Response, NextFunction } from 'express';
import {
	createParticipant,
	createCoupleParticipant,
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

// The saved entity as it comes back from the service: the existing participant,
// fully populated with sensitive fields from a PREVIOUS registration that the
// current request body never sent.
const savedParticipantWithHealthData = {
	id: 'participant-existing',
	firstName: 'Virginia',
	lastName: 'López',
	type: 'server',
	retreatId: '00000000-0000-0000-0000-000000000001',
	email: 'shared@example.com',
	medicationDetails: 'Losartán para la presión',
	medicationSchedule: 'Cada mañana con el desayuno',
	dietaryRestrictionsDetails: 'Alergia a los mariscos',
	disabilitySupport: 'Silla de ruedas',
	notes: 'Nota privada del coordinador',
	snores: true,
	hasMedication: true,
	hasDietaryRestrictions: true,
	emergencyContact1Name: 'Ana Ruiz',
	emergencyContact1Relation: 'Hermana',
	emergencyContact1CellPhone: '5559876543',
	emergencyContact1HomePhone: '5559876544',
	emergencyContact1WorkPhone: '5559876545',
	emergencyContact1Email: 'ana.ruiz@example.com',
	emergencyContact2Name: 'Carlos Ruiz',
	emergencyContact2Relation: 'Hermano',
	emergencyContact2CellPhone: '5559876546',
	sensitiveDataConsentAt: new Date('2026-01-01'),
	dataDeleteToken: 'super-secret-token-should-not-leak',
};

const SENSITIVE_KEYS = [
	'medicationDetails',
	'medicationSchedule',
	'dietaryRestrictionsDetails',
	'disabilitySupport',
	'notes',
	'snores',
	'hasMedication',
	'hasDietaryRestrictions',
	'emergencyContact1Name',
	'emergencyContact1Relation',
	'emergencyContact1CellPhone',
	'emergencyContact1HomePhone',
	'emergencyContact1WorkPhone',
	'emergencyContact1Email',
	'emergencyContact2Name',
	'emergencyContact2Relation',
	'emergencyContact2CellPhone',
	'sensitiveDataConsentAt',
	'dataDeleteToken',
	'email',
];

describe('public registration responses never echo sensitive fields', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockVerifyToken.mockResolvedValue({ valid: true });
	});

	it('POST /participants/new returns only the public whitelist DTO', async () => {
		mockCreateParticipant.mockResolvedValue(savedParticipantWithHealthData);

		const req = createMockReq({
			body: {
				recaptchaToken: 'valid-token',
				type: 'server',
				firstName: 'Virginia',
				lastName: 'López',
				nickname: 'Vicky',
				birthDate: '1970-01-01',
				maritalStatus: 'C',
				street: 'Calle',
				houseNumber: '1',
				postalCode: '00000',
				neighborhood: 'Centro',
				city: 'CDMX',
				state: 'CDMX',
				country: 'MX',
				cellPhone: '5551234567',
				email: 'shared@example.com',
				occupation: 'N/A',
				snores: false,
				hasMedication: false,
				hasDietaryRestrictions: false,
				sacraments: [],
				retreatId: '00000000-0000-0000-0000-000000000001',
			},
		});
		const res = createMockRes();

		await createParticipant(req, res, mockNext);

		expect(res.status).toHaveBeenCalledWith(201);
		const body = (res.json as jest.Mock).mock.calls[0][0];

		expect(body).toEqual({
			id: 'participant-existing',
			firstName: 'Virginia',
			lastName: 'López',
			type: 'server',
			retreatId: '00000000-0000-0000-0000-000000000001',
		});
		for (const key of SENSITIVE_KEYS) {
			expect(body).not.toHaveProperty(key);
		}
	});

	it('POST /participants/couple/new returns only the public whitelist DTO for both spouses', async () => {
		mockCreateCoupleParticipants.mockResolvedValue({
			husband: {
				...savedParticipantWithHealthData,
				id: 'husband-id',
				firstName: 'Carlos',
			},
			wife: {
				...savedParticipantWithHealthData,
				id: 'wife-id',
				firstName: 'Virginia',
			},
		});

		const spouseBody = {
			firstName: 'Carlos',
			lastName: 'López',
			nickname: 'Charly',
			birthDate: '1970-01-01',
			maritalStatus: 'C',
			street: 'Calle',
			houseNumber: '1',
			postalCode: '00000',
			neighborhood: 'Centro',
			city: 'CDMX',
			state: 'CDMX',
			country: 'MX',
			cellPhone: '5551234567',
			occupation: 'N/A',
			snores: false,
			hasMedication: false,
			hasDietaryRestrictions: false,
			sacraments: [],
		};

		const req = createMockReq({
			body: {
				recaptchaToken: 'valid-token',
				retreatId: '00000000-0000-0000-0000-000000000001',
				type: 'server',
				acceptedPrivacyNotice: true,
				husband: { ...spouseBody, email: 'carlos@example.com' },
				wife: { ...spouseBody, email: 'shared@example.com' },
			},
		});
		const res = createMockRes();

		await createCoupleParticipant(req, res, mockNext);

		expect(res.status).toHaveBeenCalledWith(201);
		const body = (res.json as jest.Mock).mock.calls[0][0];

		expect(body).toEqual({
			husband: {
				id: 'husband-id',
				firstName: 'Carlos',
				lastName: 'López',
				type: 'server',
				retreatId: '00000000-0000-0000-0000-000000000001',
			},
			wife: {
				id: 'wife-id',
				firstName: 'Virginia',
				lastName: 'López',
				type: 'server',
				retreatId: '00000000-0000-0000-0000-000000000001',
			},
		});
		for (const key of SENSITIVE_KEYS) {
			expect(body.husband).not.toHaveProperty(key);
			expect(body.wife).not.toHaveProperty(key);
		}
	});
});
