import { Request, Response } from 'express';
import { communityAuditService, CommunityAuditAction } from '../services/communityAuditService';
import {
	CommunityFaceError,
	setFaceRecognitionEnabled,
	setMemberFaceRecognitionOptOut,
	faceMatch,
	confirmFaceMatch,
	publishAlbum,
	unpublishAlbum,
	getPublicAlbum,
} from '../services/communityFaceService';

/** Maps the typed service failure to its HTTP code; anything else goes to the error handler. */
function fail(res: Response, error: unknown): Response | undefined {
	if (error instanceof CommunityFaceError) {
		return res.status(error.status).json({ message: error.message });
	}
	throw error;
}

export class CommunityFaceController {
	static async setEnabled(req: Request, res: Response) {
		const { id: communityId } = req.params;
		try {
			const result = await setFaceRecognitionEnabled(communityId, req.body.enabled);
			void communityAuditService.log({
				action: CommunityAuditAction.UPDATE,
				resourceType: 'community',
				resourceId: communityId,
				communityId,
				actorUserId: (req.user as any)?.id,
				metadata: { changedFields: ['faceRecognitionEnabled'], enabled: req.body.enabled },
				ipAddress: req.ip,
				userAgent: req.get('user-agent'),
			});
			res.json(result);
		} catch (error) {
			fail(res, error);
		}
	}

	static async setMemberOptOut(req: Request, res: Response) {
		const { id: communityId, memberId } = req.params;
		try {
			const result = await setMemberFaceRecognitionOptOut(communityId, memberId, req.body.optOut);
			void communityAuditService.log({
				action: CommunityAuditAction.MEMBER_PROFILE_UPDATE,
				resourceType: 'community_member',
				resourceId: memberId,
				communityId,
				actorUserId: (req.user as any)?.id,
				metadata: { changedFields: ['faceRecognitionOptOut'], optOut: req.body.optOut },
				ipAddress: req.ip,
				userAgent: req.get('user-agent'),
			});
			res.json(result);
		} catch (error) {
			fail(res, error);
		}
	}

	static async faceMatch(req: Request, res: Response) {
		const { id: communityId, meetingId } = req.params;
		try {
			// Degraded mode (model busy/quota/timeout) is a 200 with `degraded: true`.
			res.json(await faceMatch(communityId, meetingId, req.body.image));
		} catch (error) {
			fail(res, error);
		}
	}

	static async confirm(req: Request, res: Response) {
		const { id: communityId, meetingId } = req.params;
		try {
			res.json(await confirmFaceMatch(communityId, meetingId, req.body));
		} catch (error) {
			fail(res, error);
		}
	}

	static async publishAlbum(req: Request, res: Response) {
		const { id: communityId, meetingId } = req.params;
		try {
			res.status(201).json(await publishAlbum(communityId, meetingId));
		} catch (error) {
			fail(res, error);
		}
	}

	static async unpublishAlbum(req: Request, res: Response) {
		const { id: communityId, meetingId } = req.params;
		try {
			res.json(await unpublishAlbum(communityId, meetingId));
		} catch (error) {
			fail(res, error);
		}
	}

	/** Public, no session. One identical 404 for unknown / malformed / unpublished tokens. */
	static async getPublicAlbum(req: Request, res: Response) {
		const album = await getPublicAlbum(req.params.token);
		// The page is private-by-link: keep it out of shared caches and search engines.
		res.setHeader('Cache-Control', 'no-store');
		res.setHeader('X-Robots-Tag', 'noindex, nofollow');
		if (!album) return res.status(404).json({ message: 'Album not found' });
		res.json(album);
	}
}
