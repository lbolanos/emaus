/**
 * Email correction routes through the real router, the real
 * changeParticipantEmailSchema and the real controller — only auth and the
 * service are stubbed (same harness as participantHealthWriteGate.simple).
 *
 * Pins the D1 contract of specs/participant-email-change:
 *  - PUT /participants/:id (generic update) silently strips `email`: the edit
 *    form re-sends the full DTO by spread, so the save must not fail — but the
 *    address must never reach the service through this door.
 *  - PATCH /participants/:id/email requires `participant:identity:update`,
 *    passes the schema-normalized email to the service and echoes its result.
 *  - A ParticipantEmailChangeError maps to its status + {message, code} so the
 *    dialog can show the pedagogical collision reason.
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
const mockChangeEmail = jest.fn();

jest.mock('../../services/participantService', () => {
	// The controller maps errors with `instanceof`, so the class the service
	// throws must be the very one the mock exports.
	class ParticipantEmailChangeError extends Error {
		constructor(
			public code: string,
			message: string,
			public status = 409,
		) {
			super(message);
			this.name = 'ParticipantEmailChangeError';
		}
	}
	return {
		updateParticipant: mockUpdateParticipant,
		changeParticipantEmail: mockChangeEmail,
		ParticipantEmailChangeError,
	};
});

jest.mock('../../services/domainAuditService', () => ({
	domainAuditService: { log: jest.fn() },
	DomainAuditAction: {
		PARTICIPANT_HEALTH_VIEW: 'participant.health_view',
	},
}));

import participantRoutes from '../../routes/participantRoutes';

const app = express();
app.use(express.json());
app.use('/participants', participantRoutes);

const PARTICIPANT_ID = '3f0c9a52-7d1e-4b6a-9c2f-8e5d4a1b2c3d';
const RETREAT_ID = '3f0c9a52-7d1e-4b6a-9c2f-8e5d4a1b2c99';

// The mocked service module — required (not imported) so tests get the same
// instance the controller sees, including the error class.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const participantServiceMock = require('../../services/participantService');

describe('participant email change — routes (D1)', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		permissionChecks.length = 0;
		grantedPermissions.clear();
		grantedPermissions.add('participant:update');
		mockUpdateParticipant.mockResolvedValue({
			id: PARTICIPANT_ID,
			retreatId: null,
		});
		mockChangeEmail.mockResolvedValue({
			participant: { id: PARTICIPANT_ID, email: 'nuevo@mail.test' },
			changed: true,
			effects: {
				userLinked: false,
				userWithOldEmail: false,
				overlaysCleared: 0,
				queueRegenerated: [],
				spouseShareRetreats: [],
			},
		});
	});

	it('PUT /:id strips email from the generic update (the client re-sends the DTO by spread)', async () => {
		const response = await request(app)
			.put(`/participants/${PARTICIPANT_ID}`)
			.send({ email: 'intruso@mail.test', isCancelled: true });

		expect(response.status).toBe(200);
		const body = mockUpdateParticipant.mock.calls[0][1];
		expect(body).not.toHaveProperty('email');
		expect(body).toMatchObject({ isCancelled: true });
	});

	it('PATCH /:id/email requires participant:identity:update before the controller', async () => {
		const response = await request(app)
			.patch(`/participants/${PARTICIPANT_ID}/email`)
			.send({ email: 'nuevo@mail.test' });

		expect(permissionChecks).toContain('participant:identity:update');
		expect(response.status).toBe(403);
		expect(mockChangeEmail).not.toHaveBeenCalled();
	});

	it('PATCH /:id/email passes the normalized email and echoes the result', async () => {
		grantedPermissions.add('participant:identity:update');

		const response = await request(app)
			.patch(`/participants/${PARTICIPANT_ID}/email`)
			.send({ email: '  nuevo@mail.test  ', contextRetreatId: RETREAT_ID });

		expect(response.status).toBe(200);
		// assignParsedBody: the controller sees the schema-normalized email
		// (invisible chars/spaces stripped by normalizeEmail), and nothing else.
		expect(mockChangeEmail).toHaveBeenCalledWith(
			PARTICIPANT_ID,
			'nuevo@mail.test',
			RETREAT_ID,
		);
		expect(response.body).toMatchObject({
			changed: true,
			participant: { email: 'nuevo@mail.test' },
		});
	});

	it('maps a ParticipantEmailChangeError to its status with {message, code}', async () => {
		grantedPermissions.add('participant:identity:update');
		mockChangeEmail.mockRejectedValue(
			new participantServiceMock.ParticipantEmailChangeError(
				'EMAIL_OWNED_BY_OTHER',
				'el correo ya es de alguien más',
			),
		);

		const response = await request(app)
			.patch(`/participants/${PARTICIPANT_ID}/email`)
			.send({ email: 'nuevo@mail.test' });

		expect(response.status).toBe(409);
		expect(response.body).toEqual({
			message: 'el correo ya es de alguien más',
			code: 'EMAIL_OWNED_BY_OTHER',
		});
	});
});
