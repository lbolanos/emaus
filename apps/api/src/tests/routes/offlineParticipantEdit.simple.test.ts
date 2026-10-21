/**
 * PUT /api/participants/:id with `expectedValues` (specs/offline-mode, D13/FR-16b)
 * through the real router, schema and controller; auth, the participant service
 * and the comparison are stubbed (the comparison itself runs against the real DB
 * in tests/services/offlineEditService.integration.test.ts).
 *
 *  - a field changed meanwhile → 409 PARTICIPANT_CHANGED_MEANWHILE, nothing saved;
 *  - a field outside the list → 400, nothing saved;
 *  - all equal → saved, and `expectedValues` never reaches the service;
 *  - without `expectedValues` the regular edit is untouched.
 */
import express from 'express';
import request from 'supertest';

const grantedPermissions = new Set<string>(['participant:update', 'participant:health']);

jest.mock('../../middleware/isAuthenticated', () => ({
	isAuthenticated: (req: any, _res: any, next: any) => {
		req.user = { id: 'user-1' };
		next();
	},
}));

jest.mock('../../middleware/rateLimiting', () => {
	const passThrough = (_req: any, _res: any, next: any) => next();
	return new Proxy({}, { get: () => passThrough });
});

jest.mock('../../middleware/authorization', () => ({
	requirePermission: () => (_req: any, _res: any, next: any) => next(),
	requireRetreatAccess: () => (_req: any, _res: any, next: any) => next(),
	ensureRetreatAccess: jest.fn().mockResolvedValue(true),
	authorizationService: {
		hasPermission: jest.fn(async (_userId: string, permission: string) => grantedPermissions.has(permission)),
	},
}));

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

const mockUpdateParticipant = jest.fn();
jest.mock('../../services/participantService', () => ({
	updateParticipant: mockUpdateParticipant,
}));

const mockCheckExpectedValues = jest.fn();
jest.mock('../../services/offlineEditService', () => ({
	checkExpectedValues: mockCheckExpectedValues,
}));

jest.mock('../../services/domainAuditService', () => ({
	domainAuditService: { log: jest.fn() },
	DomainAuditAction: {
		PARTICIPANT_HEALTH_VIEW: 'participant.health_view',
		PARTICIPANT_HEALTH_EXPORT: 'participant.health_export',
	},
}));

import participantRoutes from '../../routes/participantRoutes';

const app = express();
app.use(express.json());
app.use('/participants', participantRoutes);

const PARTICIPANT_ID = '3f0c9a52-7d1e-4b6a-9c2f-8e5d4a1b2c3d';
const RETREAT_ID = '9b1d7c2e-4f3a-4e8b-a6d5-1c2b3a4d5e6f';

describe('PUT /participants/:id — edits made without signal', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockUpdateParticipant.mockResolvedValue({ id: PARTICIPANT_ID, retreatId: RETREAT_ID });
	});

	it('a field changed meanwhile on the server → 409 with the reason, nothing saved', async () => {
		mockCheckExpectedValues.mockResolvedValue({
			kind: 'changed',
			fields: ['cellPhone'],
			message: 'Mientras no había señal alguien más cambió este dato de la ficha: celular.',
		});

		const response = await request(app)
			.put(`/participants/${PARTICIPANT_ID}`)
			.send({ cellPhone: '5511112222', expectedValues: { cellPhone: '5512345678' }, contextRetreatId: RETREAT_ID });

		expect(response.status).toBe(409);
		expect(response.body).toMatchObject({ code: 'PARTICIPANT_CHANGED_MEANWHILE', fields: ['cellPhone'] });
		expect(response.body.message).toContain('celular');
		expect(mockCheckExpectedValues).toHaveBeenCalledWith(PARTICIPANT_ID, { cellPhone: '5512345678' });
		expect(mockUpdateParticipant).not.toHaveBeenCalled();
	});

	it('a field outside the list → 400, nothing saved', async () => {
		mockCheckExpectedValues.mockResolvedValue({ kind: 'invalid', fields: ['email'] });

		const response = await request(app)
			.put(`/participants/${PARTICIPANT_ID}`)
			.send({ email: 'otro@example.com', expectedValues: { email: 'ana@example.com' } });

		expect(response.status).toBe(400);
		expect(response.body).toMatchObject({ code: 'INVALID_EXPECTED_VALUES', fields: ['email'] });
		expect(mockUpdateParticipant).not.toHaveBeenCalled();
	});

	it('all as the phone saw them → saved, and expectedValues never reaches the service', async () => {
		mockCheckExpectedValues.mockResolvedValue({ kind: 'ok' });

		const response = await request(app)
			.put(`/participants/${PARTICIPANT_ID}`)
			.send({ parish: 'Santa Ana', expectedValues: { parish: 'San Juan' }, contextRetreatId: RETREAT_ID });

		expect(response.status).toBe(200);
		expect(mockUpdateParticipant).toHaveBeenCalledWith(PARTICIPANT_ID, {
			parish: 'Santa Ana',
			contextRetreatId: RETREAT_ID,
		});
	});

	it('without expectedValues the regular edit is untouched (no comparison)', async () => {
		const response = await request(app)
			.put(`/participants/${PARTICIPANT_ID}`)
			.send({ parish: 'Santa Ana', firstName: 'Ana' });

		expect(response.status).toBe(200);
		expect(mockCheckExpectedValues).not.toHaveBeenCalled();
		expect(mockUpdateParticipant).toHaveBeenCalledWith(PARTICIPANT_ID, { parish: 'Santa Ana', firstName: 'Ana' });
	});
});
