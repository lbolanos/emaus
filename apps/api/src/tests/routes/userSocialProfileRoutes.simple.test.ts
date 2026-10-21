/**
 * PUT /social/profile — the favoriteMenuItems contract, exercised through the
 * real router with the real validateRequest (UpdateSocialProfileSchema) and
 * the controllers stubbed.
 *
 * Before this schema existed the PUT accepted any body; the schema's bounds
 * must reject nonsense (empty strings, >64-char route names, >12 entries)
 * BEFORE the controller while letting the profile page's existing payloads
 * through untouched — a regression there breaks the profile page, not just
 * the sidebar.
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

describe('PUT /social/profile — UpdateSocialProfileSchema wiring', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockUpdateMyProfile.mockImplementation((_req: any, res: any) => res.json({ ok: true }));
	});

	it('accepts favoriteMenuItems of valid route names and reaches the controller', async () => {
		await request(app)
			.put('/social/profile')
			.send({ favoriteMenuItems: ['retreat-dashboard', 'walkers'] })
			.expect(200);

		expect(mockUpdateMyProfile).toHaveBeenCalledTimes(1);
		expect(mockUpdateMyProfile.mock.calls[0][0].body).toEqual({
			favoriteMenuItems: ['retreat-dashboard', 'walkers'],
		});
	});

	it('accepts an empty array (clear all favorites)', async () => {
		await request(app)
			.put('/social/profile')
			.send({ favoriteMenuItems: [] })
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

	it('rejects an empty-string route name before the controller', async () => {
		await request(app)
			.put('/social/profile')
			.send({ favoriteMenuItems: [''] })
			.expect(400);

		expect(mockUpdateMyProfile).not.toHaveBeenCalled();
	});

	it('rejects a route name longer than 64 chars before the controller', async () => {
		await request(app)
			.put('/social/profile')
			.send({ favoriteMenuItems: [`x`.repeat(65)] })
			.expect(400);

		expect(mockUpdateMyProfile).not.toHaveBeenCalled();
	});

	it('rejects more than 12 favoriteMenuItems before the controller', async () => {
		const items = Array.from({ length: 13 }, (_, i) => `route-${i}`);

		await request(app)
			.put('/social/profile')
			.send({ favoriteMenuItems: items })
			.expect(400);

		expect(mockUpdateMyProfile).not.toHaveBeenCalled();
	});
});
