/**
 * Tests del controlador POST /participants/new para la validación de teléfonos
 * por país del retiro (feature 2026-06-09).
 *
 * Verifica que:
 *  - El teléfono se valida contra el país de la CASA del retiro (no el del
 *    participante): MX/CO = 10 dígitos.
 *  - Letras → 400 ("solo números"). Longitud incorrecta → 400.
 *  - Separadores de formato (espacios/guiones/paréntesis) se aceptan
 *    (se normalizan antes de validar).
 *  - El país se resuelve por NOMBRE ("México"), no solo por ISO ("MX"),
 *    porque la casa lo guarda como texto libre.
 *  - Todos los teléfonos se validan (participante + emergencia + invitador).
 *  - Si la validación de teléfono falla, NO se llama a createParticipant.
 *
 * Database-independent: usa Jest mocks.
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
jest.mock('../../services/participantService', () => ({
	checkParticipantExists: jest.fn(),
	createParticipant: mockCreateParticipant,
	confirmExistingParticipant: jest.fn(),
	validateParticipant: mockValidateParticipant,
}));

// findById se importa dinámicamente dentro del controlador; el mock aplica igual.
const mockFindById = jest.fn();
jest.mock('../../services/retreatService', () => ({
	findById: mockFindById,
}));

import { Request, Response, NextFunction } from 'express';
import { createParticipant } from '../../controllers/participantController';

const createMockReq = (overrides: Partial<Request> = {}): Request =>
	({ params: {}, query: {}, body: {}, ...overrides }) as unknown as Request;

const createMockRes = () => {
	const res: Partial<Response> = {};
	res.status = jest.fn().mockReturnValue(res);
	res.json = jest.fn().mockReturnValue(res);
	res.send = jest.fn().mockReturnValue(res);
	return res as Response;
};

const mockNext: NextFunction = jest.fn();

const RETREAT_ID = '00000000-0000-0000-0000-000000000001';

const baseWalkerBody = {
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
	retreatId: RETREAT_ID,
};

const getErrors = (res: Response): string[] =>
	(res.json as jest.Mock).mock.calls[0][0].errors ?? [];

describe('createParticipant — validación de teléfono por país del retiro', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockVerifyToken.mockResolvedValue({ valid: true });
		mockCreateParticipant.mockResolvedValue({ id: 'new-id' });
		mockValidateParticipant.mockResolvedValue({ valid: true, warnings: [] });
		// Casa del retiro en México (país guardado como NOMBRE, no ISO).
		mockFindById.mockResolvedValue({ id: RETREAT_ID, house: { country: 'México' } });
	});

	it('rechaza (400) un cellPhone con letras y NO crea el participante', async () => {
		const req = createMockReq({ body: { ...baseWalkerBody, cellPhone: '55ABC45678' } });
		const res = createMockRes();

		await createParticipant(req, res, mockNext);

		expect(res.status).toHaveBeenCalledWith(400);
		expect(getErrors(res).some((e) => e.startsWith('cellPhone:') && /solo puede contener números/.test(e))).toBe(true);
		expect(mockCreateParticipant).not.toHaveBeenCalled();
	});

	it('rechaza (400) un cellPhone con longitud distinta de 10 (país México)', async () => {
		const req = createMockReq({ body: { ...baseWalkerBody, cellPhone: '12345' } });
		const res = createMockRes();

		await createParticipant(req, res, mockNext);

		expect(res.status).toHaveBeenCalledWith(400);
		expect(getErrors(res).some((e) => /cellPhone:.*10 dígitos/.test(e))).toBe(true);
		expect(mockCreateParticipant).not.toHaveBeenCalled();
	});

	it('acepta teléfonos con separadores (se normalizan) y crea el participante', async () => {
		const req = createMockReq({
			body: { ...baseWalkerBody, cellPhone: '(55) 1234-5678', emergencyContact1CellPhone: '55 9876 5432' },
		});
		const res = createMockRes();

		await createParticipant(req, res, mockNext);

		expect(res.status).not.toHaveBeenCalledWith(400);
		expect(mockCreateParticipant).toHaveBeenCalledTimes(1);
	});

	it('resuelve el país por NOMBRE: "México" aplica la regla de 10 dígitos', async () => {
		mockFindById.mockResolvedValue({ id: RETREAT_ID, house: { country: 'México' } });
		const req = createMockReq({ body: { ...baseWalkerBody, cellPhone: '123456789' } }); // 9 dígitos
		const res = createMockRes();

		await createParticipant(req, res, mockNext);

		expect(res.status).toHaveBeenCalledWith(400);
		expect(mockCreateParticipant).not.toHaveBeenCalled();
	});

	it('valida TODOS los teléfonos: contacto de emergencia e invitador', async () => {
		const req = createMockReq({
			body: {
				...baseWalkerBody,
				emergencyContact1CellPhone: '55-ABC', // letras
				invitedBy: 'Alguien',
				inviterCellPhone: '99', // corto
			},
		});
		const res = createMockRes();

		await createParticipant(req, res, mockNext);

		expect(res.status).toHaveBeenCalledWith(400);
		const errors = getErrors(res);
		expect(errors.some((e) => e.startsWith('emergencyContact1CellPhone:'))).toBe(true);
		expect(errors.some((e) => e.startsWith('inviterCellPhone:'))).toBe(true);
		expect(mockCreateParticipant).not.toHaveBeenCalled();
	});

	it('la regla sigue al país del RETIRO, no al país del participante', async () => {
		// Retiro en MX (10). El participante dice vivir en España (ES = 9),
		// pero un teléfono de 9 dígitos debe FALLAR por la regla del retiro.
		mockFindById.mockResolvedValue({ id: RETREAT_ID, house: { country: 'Mexico' } });
		const req = createMockReq({ body: { ...baseWalkerBody, country: 'ES', cellPhone: '123456789' } });
		const res = createMockRes();

		await createParticipant(req, res, mockNext);

		expect(res.status).toHaveBeenCalledWith(400);
		expect(mockCreateParticipant).not.toHaveBeenCalled();
	});

	it('sin país reconocido en la casa: solo exige dígitos (no longitud)', async () => {
		mockFindById.mockResolvedValue({ id: RETREAT_ID, house: { country: 'Atlántida' } });
		const req = createMockReq({ body: { ...baseWalkerBody, cellPhone: '123456789012345' } });
		const res = createMockRes();

		await createParticipant(req, res, mockNext);

		// 15 dígitos: válido porque el país no tiene regla de longitud.
		expect(res.status).not.toHaveBeenCalledWith(400);
		expect(mockCreateParticipant).toHaveBeenCalledTimes(1);
	});

	it('en dryRun también valida el teléfono antes de validateParticipant', async () => {
		const req = createMockReq({ body: { ...baseWalkerBody, dryRun: true, cellPhone: '12345' } });
		const res = createMockRes();

		await createParticipant(req, res, mockNext);

		expect(res.status).toHaveBeenCalledWith(400);
		expect(mockValidateParticipant).not.toHaveBeenCalled();
	});
});
