/**
 * Meeting create/update routes, exercised through the real router with the middleware
 * stubbed (same approach as communityUpdateRoutes.simple.test.ts).
 *
 * Both controllers pass req.body straight to the repository. Before 2026-10-22 the routes
 * only validated, so keys the schemas leave out still reached the controller: an admin
 * could move a meeting into another community (communityId), point photoUrl anywhere, or
 * pick the public album token. `assignParsedBody` makes the stripped body the one the
 * controller sees.
 */
import express from 'express';
import request from 'supertest';

jest.mock('../../middleware/isAuthenticated', () => ({
	isAuthenticated: (req: any, _res: any, next: any) => {
		req.user = { id: 'u1' };
		next();
	},
}));

jest.mock('../../middleware/authorization', () => ({
	requirePermission: () => (_req: any, _res: any, next: any) => next(),
	requireRole: () => (_req: any, _res: any, next: any) => next(),
	requireCommunityAccess: () => (_req: any, _res: any, next: any) => next(),
	requireCommunityOwner: () => (_req: any, _res: any, next: any) => next(),
	requireCommunityMeetingAccess: () => (_req: any, _res: any, next: any) => next(),
	requireRetreatAccessOrCreator: () => (_req: any, _res: any, next: any) => next(),
}));

const controller = {
	createMeeting: jest.fn((_req: any, res: any) => res.status(201).json({ id: 'm1' })),
	updateMeeting: jest.fn((_req: any, res: any) => res.json({ id: 'm1' })),
};
jest.mock('../../controllers/communityController', () => ({ CommunityController: controller }));

import communityRoutes from '../../routes/communityRoutes';

const app = express();
app.use(express.json());
app.use('/communities', communityRoutes);

const COMMUNITY_ID = '9b2d4c6e-8f10-4a3b-9c7d-5e6f7a8b9c0d';
const OTHER_COMMUNITY_ID = '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';
const MEETING_ID = '7c8d9e0f-1a2b-4c3d-9e4f-5a6b7c8d9e0f';

const smuggled = {
	communityId: OTHER_COMMUNITY_ID,
	photoUrl: 'https://attacker.example/px.png',
	photoS3Key: 'backups/database/latest.sqlite',
	albumToken: 'a'.repeat(32),
	albumPublishedAt: '2026-10-22T00:00:00.000Z',
};

describe('community meeting write routes', () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it('strips columns the update schema leaves out before the controller runs', async () => {
		await request(app)
			.put(`/communities/meetings/${MEETING_ID}`)
			.send({ title: 'Reunión semanal', ...smuggled })
			.expect(200);

		expect(controller.updateMeeting).toHaveBeenCalledTimes(1);
		expect(controller.updateMeeting.mock.calls[0][0].body).toEqual({ title: 'Reunión semanal' });
	});

	it('strips the same columns on create', async () => {
		await request(app)
			.post(`/communities/${COMMUNITY_ID}/meetings`)
			.send({ title: 'Reunión semanal', startDate: '2026-10-29T01:45:00.000Z', ...smuggled })
			.expect(201);

		expect(controller.createMeeting).toHaveBeenCalledTimes(1);
		const body = controller.createMeeting.mock.calls[0][0].body;
		for (const key of Object.keys(smuggled)) expect(body).not.toHaveProperty(key);
		expect(body.title).toBe('Reunión semanal');
	});
});
