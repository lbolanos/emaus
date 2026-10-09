/**
 * Las rutas de descarte de falsos positivos, ejercidas through the real router
 * con el middleware stubbeado — mismo espíritu que communityUpdateRoutes.
 *
 * El descarte decide "estas dos fichas no vuelven a proponerse": si quedara en
 * `requireCommunityAccess`, un co-admin podría esconder un duplicado real sin
 * que el owner lo sepa. Se fija que el gate es owner-only (no mero acceso) y
 * que la validación corre ANTES del controller (body con ids que no son uuid
 * nunca llega al service).
 */
import express from 'express';
import request from 'supertest';

const permissionCalls: string[] = [];
let permitted = true;

jest.mock('../../middleware/isAuthenticated', () => ({
	isAuthenticated: (req: any, _res: any, next: any) => {
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
	dismissDuplicatePair: jest.fn((_req: any, res: any) => res.json({ id: 'd1' })),
	listDuplicateDismissals: jest.fn((_req: any, res: any) => res.json([])),
	undoDuplicateDismissal: jest.fn((_req: any, res: any) => res.status(204).end()),
};
jest.mock('../../controllers/communityController', () => ({ CommunityController: controller }));

import communityRoutes from '../../routes/communityRoutes';

const app = express();
app.use(express.json());
app.use('/communities', communityRoutes);

const COMMUNITY_ID = '9b2d4c6e-8f10-4a3b-9c7d-5e6f7a8b9c0d';
const PARTICIPANT_A = '1a2b3c4d-0000-4000-8000-000000000001';
const PARTICIPANT_B = '1a2b3c4d-0000-4000-8000-000000000002';
const DISMISSAL_ID = '5e6f7a8b-0000-4000-8000-000000000003';

describe('community duplicate dismissal routes', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		permissionCalls.length = 0;
		permitted = true;
	});

	it('gates dismiss behind community ownership, not mere access', async () => {
		await request(app)
			.post(`/communities/${COMMUNITY_ID}/duplicates/dismiss`)
			.send({ participantAId: PARTICIPANT_A, participantBId: PARTICIPANT_B });

		expect(permissionCalls).toEqual(['owner']);
	});

	it('does not reach the controller when ownership is denied', async () => {
		permitted = false;
		const response = await request(app)
			.post(`/communities/${COMMUNITY_ID}/duplicates/dismiss`)
			.send({ participantAId: PARTICIPANT_A, participantBId: PARTICIPANT_B });

		expect(response.status).toBe(403);
		expect(controller.dismissDuplicatePair).not.toHaveBeenCalled();
	});

	it('lets a valid dismiss through to its controller', async () => {
		await request(app)
			.post(`/communities/${COMMUNITY_ID}/duplicates/dismiss`)
			.send({ participantAId: PARTICIPANT_A, participantBId: PARTICIPANT_B })
			.expect(200);

		expect(controller.dismissDuplicatePair).toHaveBeenCalledTimes(1);
		expect(controller.dismissDuplicatePair.mock.calls[0][0].body).toEqual({
			participantAId: PARTICIPANT_A,
			participantBId: PARTICIPANT_B,
		});
	});

	it('rejects an invalid body before the controller runs', async () => {
		const response = await request(app)
			.post(`/communities/${COMMUNITY_ID}/duplicates/dismiss`)
			.send({ participantAId: PARTICIPANT_A, participantBId: 'no-es-uuid' });

		expect(response.status).toBe(400);
		expect(controller.dismissDuplicatePair).not.toHaveBeenCalled();
	});

	it('lists dismissals behind the same owner gate', async () => {
		await request(app)
			.get(`/communities/${COMMUNITY_ID}/duplicates/dismissals`)
			.expect(200);

		expect(permissionCalls).toEqual(['owner']);
		expect(controller.listDuplicateDismissals).toHaveBeenCalledTimes(1);
	});

	it('undo: valid id reaches the controller, invalid id is a 400', async () => {
		await request(app)
			.delete(`/communities/${COMMUNITY_ID}/duplicates/dismissals/${DISMISSAL_ID}`)
			.expect(204);
		expect(controller.undoDuplicateDismissal).toHaveBeenCalledTimes(1);
		expect(controller.undoDuplicateDismissal.mock.calls[0][0].params.dismissalId).toBe(
			DISMISSAL_ID,
		);

		const response = await request(app)
			.delete(`/communities/${COMMUNITY_ID}/duplicates/dismissals/no-es-uuid`);
		expect(response.status).toBe(400);
		expect(controller.undoDuplicateDismissal).toHaveBeenCalledTimes(1);
	});
});
