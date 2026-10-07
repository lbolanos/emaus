/**
 * PUT /api/participants/:id through the real router, the real
 * updateParticipantSchema and the real controller — only auth and the
 * service are stubbed.
 *
 * The controller unit tests (participantHealthAudit.test.ts) call
 * updateParticipant with a hand-built body, so they cannot see what happens
 * before it. On this route validateRequest only validates: the schema's
 * null/''→undefined preprocess lives in the parsed copy, and the RAW body is
 * what reaches the service — which writes null/'' as NULL. So an "empty"
 * health key is the most destructive write of all. This suite pins the gate as
 * the client actually reaches it:
 *  - a health value → 403 with `fields`, nothing saved;
 *  - an empty health key (null/'') → 403 too, it would erase the stored value;
 *  - participant:update still runs before the controller.
 */
import express from 'express';
import request from 'supertest';

const permissionChecks: string[] = [];
const grantedPermissions = new Set<string>();

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
	requirePermission: (permission: string) => (_req: any, res: any, next: any) => {
		permissionChecks.push(permission);
		if (!grantedPermissions.has(permission)) {
			return res.status(403).json({ message: 'Forbidden' });
		}
		next();
	},
	requireRetreatAccess: () => (_req: any, _res: any, next: any) => next(),
	ensureRetreatAccess: jest.fn().mockResolvedValue(true),
	authorizationService: {
		hasPermission: jest.fn(async (_userId: string, permission: string) =>
			grantedPermissions.has(permission),
		),
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

describe('PUT /participants/:id — participant:health write gate', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		permissionChecks.length = 0;
		grantedPermissions.clear();
		mockUpdateParticipant.mockResolvedValue({ id: PARTICIPANT_ID, retreatId: null });
	});

	describe('caller with participant:update but without participant:health', () => {
		beforeEach(() => {
			grantedPermissions.add('participant:update');
		});

		it('rejects a health value with 403, lists it in `fields` and saves nothing', async () => {
			const response = await request(app)
				.put(`/participants/${PARTICIPANT_ID}`)
				.send({ isCancelled: true, notes: 'Toma losartán en la mañana' });

			expect(response.status).toBe(403);
			expect(response.body.fields).toEqual(['notes']);
			expect(response.body.message).toMatch(/datos de salud/);
			expect(mockUpdateParticipant).not.toHaveBeenCalled();
		});

		it('lists every health field that would be written, emergency contacts included', async () => {
			const response = await request(app)
				.put(`/participants/${PARTICIPANT_ID}`)
				.send({
					firstName: 'Ana',
					medicationDetails: 'Losartán',
					emergencyContact1Name: 'Carlos Ruiz',
					emergencyContact2CellPhone: '5512345678',
				});

			expect(response.status).toBe(403);
			expect(response.body.fields).toEqual(
				expect.arrayContaining([
					'medicationDetails',
					'emergencyContact1Name',
					'emergencyContact2CellPhone',
				]),
			);
			expect(response.body.fields).toHaveLength(3);
			expect(mockUpdateParticipant).not.toHaveBeenCalled();
		});

		it("rejects an empty health key (null or ''): it reaches the service raw and would erase the stored value", async () => {
			const response = await request(app)
				.put(`/participants/${PARTICIPANT_ID}`)
				.send({ isCancelled: true, notes: '', medicationDetails: null });

			expect(response.status).toBe(403);
			expect(response.body.fields).toEqual(
				expect.arrayContaining(['notes', 'medicationDetails']),
			);
			expect(mockUpdateParticipant).not.toHaveBeenCalled();
		});

		it('saves a body without health fields normally', async () => {
			const response = await request(app)
				.put(`/participants/${PARTICIPANT_ID}`)
				.send({ isCancelled: true, pickupLocation: 'Parroquia' });

			expect(response.status).toBe(200);
			expect(mockUpdateParticipant).toHaveBeenCalledWith(
				PARTICIPANT_ID,
				expect.objectContaining({ isCancelled: true, pickupLocation: 'Parroquia' }),
			);
		});
	});

	it('writes health values for a caller with participant:health', async () => {
		grantedPermissions.add('participant:update');
		grantedPermissions.add('participant:health');

		const response = await request(app)
			.put(`/participants/${PARTICIPANT_ID}`)
			.send({ notes: 'Toma losartán en la mañana', emergencyContact1Name: 'Carlos Ruiz' });

		expect(response.status).toBe(200);
		expect(mockUpdateParticipant).toHaveBeenCalledWith(
			PARTICIPANT_ID,
			expect.objectContaining({
				notes: 'Toma losartán en la mañana',
				emergencyContact1Name: 'Carlos Ruiz',
			}),
		);
	});

	it('checks participant:update before the controller, so a reader never reaches the gate', async () => {
		grantedPermissions.add('participant:health');

		const response = await request(app)
			.put(`/participants/${PARTICIPANT_ID}`)
			.send({ notes: 'Toma losartán en la mañana' });

		expect(permissionChecks).toEqual(['participant:update']);
		expect(response.status).toBe(403);
		expect(response.body.fields).toBeUndefined();
		expect(mockUpdateParticipant).not.toHaveBeenCalled();
	});
});
