/**
 * The upload endpoints' error classification, exercised through the real
 * controller with the service stubbed.
 *
 * Both handlers used to classify a rejection as 400 by substring-matching the
 * message ('image', 'MIME', '2MB'). That swallowed real server faults: an S3
 * failure saying "Failed to upload image to storage" answered 400 — blaming the
 * coordinator's file for a broken bucket. The fix classifies by type
 * (imageService throws FlyerAssetError for every caller-fault rejection), and
 * this file pins the contract through the wiring: typed rejection → 400,
 * anything else → 500, missing community/meeting → 404.
 */
import express from 'express';
import request from 'supertest';
import { FlyerAssetError } from '../../services/imageService';

jest.mock('../../middleware/isAuthenticated', () => ({
	isAuthenticated: (req: any, _res: any, next: any) => {
		req.user = { id: 'u1' };
		next();
	},
}));

jest.mock('../../middleware/authorization', () => ({
	authorizationService: {},
	requirePermission: () => (_req: any, _res: any, next: any) => next(),
	requireRole: () => (_req: any, _res: any, next: any) => next(),
	requireCommunityAccess: () => (_req: any, _res: any, next: any) => next(),
	requireCommunityOwner: () => (_req: any, _res: any, next: any) => next(),
	requireCommunityMeetingAccess: () => (_req: any, _res: any, next: any) => next(),
}));

const setMeetingPhoto = jest.fn();
const setFlyerBackground = jest.fn();
const setFlyerBackgroundUrl = jest.fn();

jest.mock('../../services/communityService', () => ({
	// The controller news this up at module scope; every instance shares the
	// jest.fn handles declared above, so each test can program its rejection.
	CommunityService: class {
		setMeetingPhoto = setMeetingPhoto;
		setFlyerBackground = setFlyerBackground;
		setFlyerBackgroundUrl = setFlyerBackgroundUrl;
	},
	MemberCreateConflictError: class extends Error {},
}));

import communityRoutes from '../../routes/communityRoutes';

const app = express();
app.use(express.json());
app.use('/communities', communityRoutes);

const COMMUNITY_ID = '9b2d4c6e-8f10-4a3b-9c7d-5e6f7a8b9c0d';
const MEETING_ID = 'c3d4e5f6-8a90-4bcd-9ef0-1a2b3c4d5e6f';

describe('flyer/meeting photo upload error classification', () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it('answers 400 to a typed image rejection (invalid file)', async () => {
		setFlyerBackground.mockRejectedValueOnce(
			new FlyerAssetError('File content does not match declared MIME type'),
		);

		const response = await request(app)
			.put(`/communities/${COMMUNITY_ID}/flyer-background`)
			.send({ imageDataUrl: 'data:image/png;base64,AAAA' });

		expect(response.status).toBe(400);
		expect(response.body.message).toBe('File content does not match declared MIME type');
	});

	it('answers 500 to a storage failure even when its message mentions images', async () => {
		// The exact shape the old substring classifier got wrong: a server-side
		// failure whose text happens to contain "image".
		setFlyerBackground.mockRejectedValueOnce(
			new Error('Failed to upload image to storage: AccessDenied'),
		);

		const response = await request(app)
			.put(`/communities/${COMMUNITY_ID}/flyer-background`)
			.send({ imageDataUrl: 'data:image/png;base64,AAAA' });

		expect(response.status).toBe(500);
	});

	it('answers 404 when the community is gone', async () => {
		setFlyerBackground.mockRejectedValueOnce(new Error('Community not found'));

		const response = await request(app)
			.put(`/communities/${COMMUNITY_ID}/flyer-background`)
			.send({ imageDataUrl: 'data:image/png;base64,AAAA' });

		expect(response.status).toBe(404);
	});

	it('classifies the meeting photo upload the same way', async () => {
		setMeetingPhoto.mockRejectedValueOnce(
			new Error('Failed to upload image to storage: AccessDenied'),
		);

		const response = await request(app)
			.put(`/communities/meetings/${MEETING_ID}/photo`)
			.send({ photoData: 'data:image/png;base64,AAAA' });

		expect(response.status).toBe(500);
	});
});
