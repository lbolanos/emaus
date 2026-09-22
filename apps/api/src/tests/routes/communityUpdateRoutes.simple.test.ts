/**
 * The generic community update endpoint, exercised through the real router with
 * the middleware stubbed.
 *
 * The flyer identity fix (2026-09-21) removed flyerBackgroundUrl /
 * flyerCardOpacity / flyerOptions from updateCommunitySchema. The schema tests
 * assert the exported schema strips those keys — but nothing asserted, through
 * the real wiring, that a PUT /api/communities/:id carrying flyer fields cannot
 * reach the update controller with them. `validateRequest` is what replaces
 * req.body with the parsed (stripped) payload; if it ever validated without
 * replacing, the bypass would be back while every schema test stays green.
 *
 * Also pins the wiring itself — owner-only (not mere access) and validation
 * before the controller — same spirit as flyerRoutes.simple.test.ts.
 */
import express from 'express';
import request from 'supertest';

const permissionCalls: string[] = [];
let permitted = true;

jest.mock('../../middleware/isAuthenticated', () => ({
	isAuthenticated: (req: any, res: any, next: any) => {
		req.user = { id: 'u1' };
		next();
	},
}));

jest.mock('../../middleware/authorization', () => ({
	requirePermission: () => (_req: any, _res: any, next: any) => next(),
	requireRole: () => (_req: any, _res: any, next: any) => next(),
	requireCommunityAccess: () => (_req: any, _res: any, next: any) => {
		permissionCalls.push('access');
		next();
	},
	requireCommunityOwner: () => (_req: any, res: any, next: any) => {
		permissionCalls.push('owner');
		if (!permitted) return res.status(403).json({ message: 'Forbidden' });
		next();
	},
	requireCommunityMeetingAccess: () => (_req: any, _res: any, next: any) => next(),
}));

const controller = {
	updateCommunity: jest.fn((_req: any, res: any) => res.json({ id: 'c1' })),
};
jest.mock('../../controllers/communityController', () => ({ CommunityController: controller }));

import communityRoutes from '../../routes/communityRoutes';

const app = express();
app.use(express.json());
app.use('/communities', communityRoutes);

const COMMUNITY_ID = '9b2d4c6e-8f10-4a3b-9c7d-5e6f7a8b9c0d';

describe('community update route', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		permissionCalls.length = 0;
		permitted = true;
	});

	it('lets a valid update through to its controller', async () => {
		await request(app)
			.put(`/communities/${COMMUNITY_ID}`)
			.send({ name: 'Emaús del Valle', city: 'CDMX' })
			.expect(200);

		expect(controller.updateCommunity).toHaveBeenCalledTimes(1);
		expect(controller.updateCommunity.mock.calls[0][0].body).toEqual({
			name: 'Emaús del Valle',
			city: 'CDMX',
		});
	});

	it('strips flyer identity from the body before the controller runs', async () => {
		// Each key here has a dedicated endpoint with its own guarantees
		// (preset-locked background upload, 0.3–1 opacity clamp, whole-design
		// flyer-options PUT). Reaching the controller with any of them is the
		// bypass the schema fix closed.
		await request(app)
			.put(`/communities/${COMMUNITY_ID}`)
			.send({
				name: 'Emaús del Valle',
				flyerBackgroundUrl: 'https://attacker.example/px.png',
				flyerCardOpacity: -5,
				flyerOptions: { layoutVersion: 2, blocks: [] },
			})
			.expect(200);

		expect(controller.updateCommunity).toHaveBeenCalledTimes(1);
		expect(controller.updateCommunity.mock.calls[0][0].body).toEqual({
			name: 'Emaús del Valle',
		});
	});

	it('gates the generic PUT behind community ownership, not mere access', async () => {
		await request(app)
			.put(`/communities/${COMMUNITY_ID}`)
			.send({ name: 'Emaús del Valle' });

		expect(permissionCalls).toEqual(['owner']);
	});

	it('does not reach the controller when ownership is denied', async () => {
		permitted = false;
		const response = await request(app)
			.put(`/communities/${COMMUNITY_ID}`)
			.send({ name: 'Emaús del Valle' });

		expect(response.status).toBe(403);
		expect(controller.updateCommunity).not.toHaveBeenCalled();
	});

	it('rejects an invalid body before the controller runs', async () => {
		const response = await request(app).put(`/communities/${COMMUNITY_ID}`).send({ name: '' });

		expect(response.status).toBe(400);
		expect(controller.updateCommunity).not.toHaveBeenCalled();
	});
});
