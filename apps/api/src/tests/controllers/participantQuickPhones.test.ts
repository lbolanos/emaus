/**
 * Tests del PATCH /participants/:id/phones — edición rápida de teléfonos para
 * la vista Palancas (feature 2026-10-07).
 *
 * Controller:
 *  - Valida contra el país de la CASA del retiro (resuelto por nombre, "México").
 *  - '' en cellPhone / emergencyContact1CellPhone → 400 (NOT NULL, críticos
 *    para las palancas). '' en EC2 pasa como "limpiar".
 *  - Sin retreatId → 400.
 *
 * Service:
 *  - Canoniza a número nacional (+52 / 044 se recortan) antes de persistir.
 *  - '' en EC2 persiste null.
 *  - 404 si el participante no está en el retiro.
 *  - Auditoría logUpdate con allowlist de los 3 campos.
 *
 * Database-independent: usa Jest mocks.
 */

const mockUpdatePhones = jest.fn();
jest.mock('../../services/participantService', () => ({
	updateParticipantPhones: mockUpdatePhones,
}));

// The controller resolves the retreat (house country) through retreatService.
const mockFindById = jest.fn();
jest.mock('../../services/retreatService', () => ({
	findById: mockFindById,
}));

import { Request, Response, NextFunction } from 'express';
import { updateParticipantPhones as controllerHandler } from '../../controllers/participantController';

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
const PARTICIPANT_ID = '00000000-0000-0000-0000-000000000002';

const getErrors = (res: Response): string[] =>
	(res.json as jest.Mock).mock.calls[0][0].errors ?? [];

describe('PATCH /participants/:id/phones — controller', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockFindById.mockResolvedValue({ id: RETREAT_ID, house: { country: 'México' } });
		mockUpdatePhones.mockResolvedValue({
			id: PARTICIPANT_ID,
			cellPhone: '5512345678',
			emergencyContact1CellPhone: '5598765432',
			emergencyContact2CellPhone: null,
		});
	});

	it('400 sin retreatId en el body', async () => {
		const req = createMockReq({ params: { id: PARTICIPANT_ID }, body: { cellPhone: '5512345678' } });
		const res = createMockRes();

		await controllerHandler(req, res, mockNext);

		expect(res.status).toHaveBeenCalledWith(400);
		expect(mockUpdatePhones).not.toHaveBeenCalled();
	});

	it('400 con teléfono de longitud inválida (MX = 10 dígitos) y NO llama al service', async () => {
		const req = createMockReq({
			params: { id: PARTICIPANT_ID },
			body: { retreatId: RETREAT_ID, cellPhone: '123' },
		});
		const res = createMockRes();

		await controllerHandler(req, res, mockNext);

		expect(res.status).toHaveBeenCalledWith(400);
		expect(getErrors(res).some((e) => /cellPhone:.*10 dígitos/.test(e))).toBe(true);
		expect(mockUpdatePhones).not.toHaveBeenCalled();
	});

	it('400 con letras en emergencyContact1CellPhone', async () => {
		const req = createMockReq({
			params: { id: PARTICIPANT_ID },
			body: { retreatId: RETREAT_ID, emergencyContact1CellPhone: '55-ABC' },
		});
		const res = createMockRes();

		await controllerHandler(req, res, mockNext);

		expect(res.status).toHaveBeenCalledWith(400);
		expect(getErrors(res).some((e) => e.startsWith('emergencyContact1CellPhone:'))).toBe(true);
		expect(mockUpdatePhones).not.toHaveBeenCalled();
	});

	it("400 con '' en cellPhone (NOT NULL): no se puede vaciar", async () => {
		const req = createMockReq({
			params: { id: PARTICIPANT_ID },
			body: { retreatId: RETREAT_ID, cellPhone: '' },
		});
		const res = createMockRes();

		await controllerHandler(req, res, mockNext);

		expect(res.status).toHaveBeenCalledWith(400);
		expect(getErrors(res).some((e) => e.startsWith('cellPhone:'))).toBe(true);
		expect(mockUpdatePhones).not.toHaveBeenCalled();
	});

	it("400 con '' en emergencyContact1CellPhone (NOT NULL)", async () => {
		const req = createMockReq({
			params: { id: PARTICIPANT_ID },
			body: { retreatId: RETREAT_ID, emergencyContact1CellPhone: '' },
		});
		const res = createMockRes();

		await controllerHandler(req, res, mockNext);

		expect(res.status).toHaveBeenCalledWith(400);
		expect(getErrors(res).some((e) => e.startsWith('emergencyContact1CellPhone:'))).toBe(true);
		expect(mockUpdatePhones).not.toHaveBeenCalled();
	});

	it("'' en emergencyContact2CellPhone (nullable) SÍ pasa al service como limpiar", async () => {
		const req = createMockReq({
			params: { id: PARTICIPANT_ID },
			body: { retreatId: RETREAT_ID, emergencyContact2CellPhone: '' },
		});
		const res = createMockRes();

		await controllerHandler(req, res, mockNext);

		expect(res.status).not.toHaveBeenCalledWith(400);
		expect(mockUpdatePhones).toHaveBeenCalledTimes(1);
		expect(mockUpdatePhones.mock.calls[0][2]).toMatchObject({
			emergencyContact2CellPhone: '',
		});
	});

	it('acepta separadores de formato y pasa el país de la casa al service', async () => {
		const req = createMockReq({
			params: { id: PARTICIPANT_ID },
			body: { retreatId: RETREAT_ID, cellPhone: '(55) 1234-5678' },
		});
		const res = createMockRes();

		await controllerHandler(req, res, mockNext);

		expect(res.status).not.toHaveBeenCalledWith(400);
		expect(mockUpdatePhones).toHaveBeenCalledWith(
			PARTICIPANT_ID,
			RETREAT_ID,
			{
				cellPhone: '(55) 1234-5678',
				emergencyContact1CellPhone: undefined,
				emergencyContact2CellPhone: undefined,
			},
			'México',
		);
	});

	it('responde angosto: solo id + los 3 teléfonos', async () => {
		const req = createMockReq({
			params: { id: PARTICIPANT_ID },
			body: { retreatId: RETREAT_ID, cellPhone: '5512345678' },
		});
		const res = createMockRes();

		await controllerHandler(req, res, mockNext);

		expect(res.json).toHaveBeenCalledWith({
			id: PARTICIPANT_ID,
			cellPhone: '5512345678',
			emergencyContact1CellPhone: '5598765432',
			emergencyContact2CellPhone: null,
		});
	});

	it('propaga al error handler el 404 del service (participante fuera del retiro)', async () => {
		const notFound = new Error('Participant not found in retreat');
		(notFound as Error & { status?: number }).status = 404;
		mockUpdatePhones.mockRejectedValue(notFound);
		const req = createMockReq({
			params: { id: PARTICIPANT_ID },
			body: { retreatId: RETREAT_ID, cellPhone: '5512345678' },
		});
		const res = createMockRes();

		await controllerHandler(req, res, mockNext);

		expect(mockNext).toHaveBeenCalledWith(notFound);
		expect(res.json).not.toHaveBeenCalled();
	});
});
