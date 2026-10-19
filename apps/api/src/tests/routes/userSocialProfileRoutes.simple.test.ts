/**
 * PUT /social/profile — the favoriteRetreatIds contract, exercised through the
 * real router with the real validateRequest (UpdateSocialProfileSchema) and
 * the controllers stubbed.
 *
 * Before this schema existed the PUT accepted any body; the schema's bounds
 * must reject nonsense (non-UUID ids, >100 entries) BEFORE the controller
 * while letting the profile page's existing payloads through untouched —
 * a regression there breaks the profile page, not just the sidebar.
 */
import express from 'express';
import request from 'supertest';

jest.mock('../../middleware/authentication', () => ({
	isAuthenticated: (_req: any, _res: any, next: any) => next(),
}));

jest.mock('../../controllers/userProfileController', () => ({
	getMyProfile: jest.fn(),
	updateMyProfile: jest.fn(),
	getPublicProfileById: jest.fn(),
	searchUsersController: jest.fn(),
	linkUserToParticipantController: jest.fn(),
	unlinkUserFromParticipantController: jest.fn(),
	updateAvatar: jest.fn(),
	removeAvatar: jest.fn(),
}));

jest.mock('../../controllers/userSocialController', () => ({
	sendFriendRequestController: jest.fn(),
	acceptFriendRequestController: jest.fn(),
	rejectFriendRequestController: jest.fn(),
	removeFriendController: jest.fn(),
	getFriendsController: jest.fn(),
	getPendingRequestsController: jest.fn(),
	getSentRequestsController: jest.fn(),
	followUserController: jest.fn(),
	unfollowUserController: jest.fn(),
	getFollowersController: jest.fn(),
	getFollowingController: jest.fn(),
	blockUserController: jest.fn(),
	unblockUserController: jest.fn(),
	getBlockedUsersController: jest.fn(),
}));

import userSocialRoutes from '../../routes/userSocial.routes';
import { updateMyProfile } from '../../controllers/userProfileController';

const mockUpdateMyProfile = updateMyProfile as jest.Mock;

const app = express();
app.use(express.json());
app.use('/social', userSocialRoutes);

const RETREAT_A = '9b2d4c6e-8f10-4a3b-9c7d-5e6f7a8b9c0d';
const RETREAT_B = '8a1c3d5f-7e09-4b2a-9d6c-4f5e6a7b8d9e';

describe('PUT /social/profile — UpdateSocialProfileSchema wiring', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockUpdateMyProfile.mockImplementation((_req: any, res: any) => res.json({ ok: true }));
	});

	it('accepts favoriteRetreatIds of valid retreat UUIDs and reaches the controller', async () => {
		await request(app)
			.put('/social/profile')
			.send({ favoriteRetreatIds: [RETREAT_A, RETREAT_B] })
			.expect(200);

		expect(mockUpdateMyProfile).toHaveBeenCalledTimes(1);
		expect(mockUpdateMyProfile.mock.calls[0][0].body).toEqual({
			favoriteRetreatIds: [RETREAT_A, RETREAT_B],
		});
	});

	it('accepts an empty array (clear all favorites)', async () => {
		await request(app)
			.put('/social/profile')
			.send({ favoriteRetreatIds: [] })
			.expect(200);

		expect(mockUpdateMyProfile).toHaveBeenCalledTimes(1);
	});

	it('lets the profile page payload through untouched', async () => {
		await request(app)
			.put('/social/profile')
			.send({
				bio: 'Servidor desde 2024',
				location: 'CDMX',
				website: 'https://emaus.cc',
				showEmail: true,
				showPhone: false,
				showRetreats: true,
				interests: ['música'],
				skills: ['cocina'],
				avatarUrl: 'data:image/webp;base64,AAAA',
			})
			.expect(200);

		expect(mockUpdateMyProfile).toHaveBeenCalledTimes(1);
	});

	it('rejects a non-UUID favoriteRetreatIds entry before the controller', async () => {
		await request(app)
			.put('/social/profile')
			.send({ favoriteRetreatIds: ['san-agustin-2026'] })
			.expect(400);

		expect(mockUpdateMyProfile).not.toHaveBeenCalled();
	});

	it('rejects more than 100 favoriteRetreatIds before the controller', async () => {
		const ids = Array.from({ length: 101 }, (_, i) =>
			`00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
		);

		await request(app)
			.put('/social/profile')
			.send({ favoriteRetreatIds: ids })
			.expect(400);

		expect(mockUpdateMyProfile).not.toHaveBeenCalled();
	});
});
