/**
 * GET /communities/:id/members/potential and POST /communities/:id/members/import
 *
 * Route wiring: both need access to the retreat, not only to the community, and
 * read its id from where the client sends it (query / body). The retreat check
 * itself is unit-tested in tests/middleware/requireRetreatAccessOrCreator.test.ts;
 * here it is replaced by a stand-in that allows a fixed set of retreat ids, so a
 * route that forgets the check, or reads the id from the wrong place, fails.
 */
import express from 'express';
import request from 'supertest';

const mockImportFromRetreat = jest.fn();
const mockGetPotentialMembers = jest.fn();
const ALLOWED_RETREAT = '11111111-1111-4111-8111-111111111111';
const OTHER_RETREAT = '22222222-2222-4222-8222-222222222222';
const COMMUNITY = '33333333-3333-4333-8333-333333333333';
const PARTICIPANT = '44444444-4444-4444-8444-444444444444';

jest.mock('../../services/communityService', () => ({
	CommunityService: class {
		importFromRetreat(...args: any[]) {
			return mockImportFromRetreat(...args);
		}
		getPotentialMembers(...args: any[]) {
			return mockGetPotentialMembers(...args);
		}
	},
	MemberCreateConflictError: class extends Error {},
}));
jest.mock('../../services/communityAuditService', () => ({
	communityAuditService: { log: jest.fn() },
	CommunityAuditAction: {},
}));
jest.mock('../../services/recaptchaService', () => ({
	RecaptchaService: class {},
}));
jest.mock('../../services/communityAttendanceStats', () => ({
	RetreatCommunityMismatchError: class extends Error {},
	getAttendanceStats: jest.fn(),
	getServerAttendanceForRetreat: jest.fn(),
}));
jest.mock('../../services/participantMergeService', () => ({
	ParticipantMergeError: class extends Error {},
	findDuplicateCandidatesForCommunity: jest.fn(),
	mergeParticipants: jest.fn(),
	previewMerge: jest.fn(),
}));
jest.mock('../../middleware/isAuthenticated', () => ({
	isAuthenticated: (req: any, _res: any, next: any) => {
		req.user = { id: 'user-route-test' };
		next();
	},
}));
jest.mock('../../middleware/authorization', () => ({
	authorizationService: {
		// The list route asks it whether to strip health fields.
		hasPermission: () => Promise.resolve(true),
	},
	requirePermission: () => (_req: any, _res: any, next: any) => next(),
	requireRole: () => (_req: any, _res: any, next: any) => next(),
	requireCommunityAccess: () => (req: any, _res: any, next: any) => {
		req.user = { id: 'user-route-test' };
		next();
	},
	requireCommunityOwner: () => (_req: any, _res: any, next: any) => next(),
	requireCommunityMeetingAccess: () => (_req: any, _res: any, next: any) => next(),
	requireRetreatAccessOrCreator:
		(param: string, source: 'params' | 'body' | 'query' = 'params') =>
		(req: any, res: any, next: any) =>
			req[source]?.[param] === '11111111-1111-4111-8111-111111111111'
				? next()
				: res.status(403).json({ message: 'Forbidden' }),
}));

import communityRoutes from '../../routes/communityRoutes';

const app = express();
app.use(express.json());
app.use('/communities', communityRoutes);

describe('community import routes need access to the retreat', () => {
	beforeEach(() => {
		mockImportFromRetreat.mockReset().mockResolvedValue({ imported: [], skipped: [] });
		mockGetPotentialMembers.mockReset().mockResolvedValue([]);
	});

	it('lists candidates of an accessible retreat', async () => {
		const res = await request(app)
			.get(`/communities/${COMMUNITY}/members/potential`)
			.query({ retreatId: ALLOWED_RETREAT });

		expect(res.status).toBe(200);
		expect(mockGetPotentialMembers).toHaveBeenCalledWith(COMMUNITY, ALLOWED_RETREAT);
	});

	it('refuses to list the roster of a retreat without access', async () => {
		const res = await request(app)
			.get(`/communities/${COMMUNITY}/members/potential`)
			.query({ retreatId: OTHER_RETREAT });

		expect(res.status).toBe(403);
		expect(mockGetPotentialMembers).not.toHaveBeenCalled();
	});

	it('imports from an accessible retreat', async () => {
		const res = await request(app)
			.post(`/communities/${COMMUNITY}/members/import`)
			.send({ retreatId: ALLOWED_RETREAT, participantIds: [PARTICIPANT] });

		expect(res.status).toBe(201);
		expect(mockImportFromRetreat).toHaveBeenCalledWith(COMMUNITY, ALLOWED_RETREAT, [PARTICIPANT]);
	});

	it('refuses to import from a retreat without access', async () => {
		const res = await request(app)
			.post(`/communities/${COMMUNITY}/members/import`)
			.send({ retreatId: OTHER_RETREAT, participantIds: [PARTICIPANT] });

		expect(res.status).toBe(403);
		expect(mockImportFromRetreat).not.toHaveBeenCalled();
	});

	it('no longer adds a member by bare participantId (route removed 2026-10-22)', async () => {
		// POST /:id/members took any participantId with no retreat or phone check, and
		// nothing called it. Membership comes in through import, create or bulk only.
		const res = await request(app)
			.post(`/communities/${COMMUNITY}/members`)
			.send({ participantId: PARTICIPANT });

		expect(res.status).toBe(404);
	});

	it('rejects more than 1000 ids in one request', async () => {
		const res = await request(app)
			.post(`/communities/${COMMUNITY}/members/import`)
			.send({ retreatId: ALLOWED_RETREAT, participantIds: Array(1001).fill(PARTICIPANT) });

		expect(res.status).toBe(400);
		expect(mockImportFromRetreat).not.toHaveBeenCalled();
	});

	it('answers in Spanish when the import fails as a whole', async () => {
		mockImportFromRetreat.mockRejectedValue(new Error('SQLITE_BUSY'));
		const logSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

		const res = await request(app)
			.post(`/communities/${COMMUNITY}/members/import`)
			.send({ retreatId: ALLOWED_RETREAT, participantIds: [PARTICIPANT] });

		logSpy.mockRestore();
		expect(res.status).toBe(500);
		expect(res.body.message).toMatch(/No se pudo importar/);
	});
});
