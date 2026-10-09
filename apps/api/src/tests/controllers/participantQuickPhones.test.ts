/**
 * Tests for the PATCH /participants/:id/phones controller — quick phone edit
 * for the Palancas view (2026-10-07 feature).
 *
 * Controller:
 *  - Validates against the retreat HOUSE's country (resolved by name, "México").
 *  - '' in cellPhone / emergencyContact1CellPhone → 400 (NOT NULL, critical
 *    for the palancas flow). '' in EC2 passes through as "clear".
 *  - retreatId is required by updateParticipantPhonesSchema at the route layer
 *    (see participantPhones.routes.simple.test.ts) — not re-checked here.
 *
 * Service:
 *  - Canonicalizes to the national number (+52 / 044 trimmed) before persisting.
 *  - '' in EC2 persists null.
 *  - 404 when the participant is not in the retreat.
 *  - logUpdate audit with the 3-field allowlist.
 *
 * Database-independent: Jest mocks.
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

	it('400 with a wrong-length phone (MX = 10 digits) and does NOT call the service', async () => {
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

	it('400 with letters in emergencyContact1CellPhone', async () => {
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

	it("400 with '' in cellPhone (NOT NULL): cannot be emptied", async () => {
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

	it("400 with '' in emergencyContact1CellPhone (NOT NULL)", async () => {
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

	it('400 with an unresolvable house country and an absurdly short phone (6-15 digit floor)', async () => {
		// house.country is free text: "CDMX" resolves to no country rule, so
		// without this floor a 5-digit number would pass with a 200.
		mockFindById.mockResolvedValue({ id: RETREAT_ID, house: { country: 'CDMX' } });
		const req = createMockReq({
			params: { id: PARTICIPANT_ID },
			body: { retreatId: RETREAT_ID, cellPhone: '12345' },
		});
		const res = createMockRes();

		await controllerHandler(req, res, mockNext);

		expect(res.status).toHaveBeenCalledWith(400);
		expect(getErrors(res).some((e) => /cellPhone:.*6-15/.test(e))).toBe(true);
		expect(mockUpdatePhones).not.toHaveBeenCalled();
	});

	it('unresolvable house country: accepts 6-15 digits and passes the country as-is to the service', async () => {
		mockFindById.mockResolvedValue({ id: RETREAT_ID, house: { country: 'CDMX' } });
		const req = createMockReq({
			params: { id: PARTICIPANT_ID },
			body: { retreatId: RETREAT_ID, cellPhone: '5512345678' },
		});
		const res = createMockRes();

		await controllerHandler(req, res, mockNext);

		expect(res.status).not.toHaveBeenCalledWith(400);
		expect(mockUpdatePhones).toHaveBeenCalledWith(
			PARTICIPANT_ID,
			RETREAT_ID,
			expect.objectContaining({ cellPhone: '5512345678' }),
			'CDMX',
		);
	});

	it("'' in emergencyContact2CellPhone (nullable) DOES reach the service as a clear", async () => {
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

	it('accepts format separators and passes the house country to the service', async () => {
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

	it('answers narrow: only id + the 3 phones', async () => {
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

	it('propagates the service 404 to the error handler (participant outside the retreat)', async () => {
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
