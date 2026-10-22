import crypto from 'crypto';
import { In } from 'typeorm';
import { resolveMemberProfile } from '@repo/utils';
import { AppDataSource } from '../data-source';
import { Community } from '../entities/community.entity';
import { CommunityMember } from '../entities/communityMember.entity';
import { CommunityMeeting } from '../entities/communityMeeting.entity';
import { CommunityAttendance } from '../entities/communityAttendance.entity';
import { CommunityMeetingPhotoTag } from '../entities/communityMeetingPhotoTag.entity';
import { CommunityService } from './communityService';
import { s3Service } from './s3Service';
import {
	analyzeGroupPhoto,
	invalidateFaceGallery,
	InvalidFaceImageError,
	FaceMatchResult,
} from './faceMatchService';

/** Typed failure; the controller maps `status` straight to the HTTP code. */
export class CommunityFaceError extends Error {
	constructor(
		public readonly status: 400 | 403 | 404 | 409,
		message: string,
	) {
		super(message);
	}
}

const ALBUM_TOKEN_PATTERN = /^[0-9a-f]{32}$/;

const communityRepo = () => AppDataSource.getRepository(Community);
const memberRepo = () => AppDataSource.getRepository(CommunityMember);
const meetingRepo = () => AppDataSource.getRepository(CommunityMeeting);
const attendanceRepo = () => AppDataSource.getRepository(CommunityAttendance);
const tagRepo = () => AppDataSource.getRepository(CommunityMeetingPhotoTag);

/** The meeting must belong to the community in the route: the most specific resource wins. */
async function requireMeetingInCommunity(communityId: string, meetingId: string) {
	const meeting = await meetingRepo().findOne({ where: { id: meetingId, communityId } });
	if (!meeting) throw new CommunityFaceError(404, 'Meeting not found');
	return meeting;
}

export async function setFaceRecognitionEnabled(communityId: string, enabled: boolean) {
	const result = await communityRepo().update({ id: communityId }, { faceRecognitionEnabled: enabled });
	if (!result.affected) throw new CommunityFaceError(404, 'Community not found');
	invalidateFaceGallery(communityId);
	return { id: communityId, faceRecognitionEnabled: enabled };
}

export async function setMemberFaceRecognitionOptOut(
	communityId: string,
	memberId: string,
	optOut: boolean,
) {
	const result = await memberRepo().update({ id: memberId, communityId }, { faceRecognitionOptOut: optOut });
	if (!result.affected) throw new CommunityFaceError(404, 'Member not found in this community');
	invalidateFaceGallery(communityId);
	return { id: memberId, faceRecognitionOptOut: optOut };
}

export async function faceMatch(
	communityId: string,
	meetingId: string,
	image: string,
): Promise<FaceMatchResult> {
	const community = await communityRepo().findOne({
		where: { id: communityId },
		select: ['id', 'faceRecognitionEnabled'],
	});
	if (!community) throw new CommunityFaceError(404, 'Community not found');
	await requireMeetingInCommunity(communityId, meetingId);
	if (!community.faceRecognitionEnabled) {
		throw new CommunityFaceError(403, 'Face recognition is disabled for this community');
	}
	try {
		return await analyzeGroupPhoto(communityId, image);
	} catch (error) {
		if (error instanceof InvalidFaceImageError) {
			throw new CommunityFaceError(400, 'Invalid image');
		}
		throw error;
	}
}

export interface ConfirmInput {
	present: string[];
	photos: { memberId: string; crop: string }[];
	tags: { memberId: string; box: [number, number, number, number] }[];
}

export interface ConfirmResult {
	attendanceMarked: number;
	photosSet: number;
	tagsSaved: number;
	skippedOptOut: number;
}

/**
 * Review confirmation. Unlike `recordAttendance` it only ever ADDS presence: whoever is not
 * in `present` is left untouched. Photos only fill empty profile photos of members who are
 * not opted out; tags skip opted-out members.
 */
export async function confirmFaceMatch(
	communityId: string,
	meetingId: string,
	input: ConfirmInput,
	communityService: CommunityService = new CommunityService(),
): Promise<ConfirmResult> {
	const meeting = await requireMeetingInCommunity(communityId, meetingId);

	const present = [...new Set(input.present)];
	const referenced = new Set<string>([
		...present,
		...input.photos.map((p) => p.memberId),
		...input.tags.map((t) => t.memberId),
	]);
	const members = referenced.size
		? await memberRepo().find({ where: { id: In([...referenced]), communityId } })
		: [];
	if (members.length !== referenced.size) {
		throw new CommunityFaceError(404, 'Member not found in this community');
	}
	const byId = new Map(members.map((m) => [m.id, m]));
	const presentSet = new Set(present);

	let tagsSaved = 0;
	let skippedOptOut = 0;
	await AppDataSource.transaction(async (manager) => {
		const attendances = manager.getRepository(CommunityAttendance);
		const tags = manager.getRepository(CommunityMeetingPhotoTag);
		const now = new Date();
		for (const memberId of present) {
			const existing = await attendances.findOne({ where: { meetingId, memberId } });
			if (existing) {
				existing.attended = true;
				existing.recordedAt = now;
				await attendances.save(existing);
			} else {
				await attendances.save(attendances.create({ meetingId, memberId, attended: true, recordedAt: now }));
			}
		}
		// Tags only make sense over a stored cover photo, and only for confirmed presents.
		if (meeting.photoUrl) {
			for (const tag of input.tags) {
				const member = byId.get(tag.memberId)!;
				if (!presentSet.has(tag.memberId)) continue;
				if (member.faceRecognitionOptOut) {
					skippedOptOut++;
					continue;
				}
				const [yMin, xMin, yMax, xMax] = tag.box;
				const existing = await tags.findOne({ where: { meetingId, memberId: tag.memberId } });
				if (existing) {
					Object.assign(existing, { yMin, xMin, yMax, xMax });
					await tags.save(existing);
				} else {
					await tags.save(tags.create({ meetingId, memberId: tag.memberId, yMin, xMin, yMax, xMax }));
				}
				tagsSaved++;
			}
		}
	});

	// Photos go after the transaction: they may upload to S3.
	let photosSet = 0;
	for (const photo of input.photos) {
		const member = byId.get(photo.memberId)!;
		if (!presentSet.has(photo.memberId)) continue;
		if (member.faceRecognitionOptOut) {
			skippedOptOut++;
			continue;
		}
		if (member.photoUrl) continue; // never overwrite an existing profile photo
		await communityService.setMemberPhoto(communityId, photo.memberId, photo.crop);
		photosSet++;
	}

	return { attendanceMarked: present.length, photosSet, tagsSaved, skippedOptOut };
}

/** Called when the meeting cover photo is replaced or deleted (FR-29). */
export async function deleteMeetingPhotoTags(meetingId: string): Promise<void> {
	await tagRepo().delete({ meetingId });
}

// --- Public album (M7) ---------------------------------------------------------------------

export async function publishAlbum(communityId: string, meetingId: string) {
	const meeting = await requireMeetingInCommunity(communityId, meetingId);
	if (!meeting.photoUrl) {
		throw new CommunityFaceError(409, 'The meeting has no photo to publish');
	}
	// Re-publishing keeps the link people already shared.
	if (meeting.albumToken && meeting.albumPublishedAt) {
		return { albumToken: meeting.albumToken, albumPublishedAt: meeting.albumPublishedAt };
	}
	const albumToken = crypto.randomBytes(16).toString('hex');
	const albumPublishedAt = new Date();
	await meetingRepo().update({ id: meetingId }, { albumToken, albumPublishedAt });
	return { albumToken, albumPublishedAt };
}

export async function unpublishAlbum(communityId: string, meetingId: string) {
	await requireMeetingInCommunity(communityId, meetingId);
	await meetingRepo().update({ id: meetingId }, { albumToken: null, albumPublishedAt: null });
	return { albumToken: null, albumPublishedAt: null };
}

/** First given name(s) + first surname. Never email, phone or anything else of the record. */
function albumDisplayName(member: CommunityMember): string {
	const profile = resolveMemberProfile(member);
	const firstSurname = profile.lastName.trim().split(/\s+/)[0] ?? '';
	return `${profile.firstName.trim()} ${firstSurname}`.trim();
}

export interface PublicAlbum {
	communityName: string;
	meetingTitle: string;
	startDate: Date;
	timezone: string;
	photoUrl: string;
	tags: { name: string; box: [number, number, number, number] }[];
}

/** `null` for an unknown, malformed or unpublished token: the caller answers one identical 404. */
export async function getPublicAlbum(token: string): Promise<PublicAlbum | null> {
	if (!ALBUM_TOKEN_PATTERN.test(token)) return null;
	const meeting = await meetingRepo().findOne({
		where: { albumToken: token },
		relations: ['community'],
	});
	if (!meeting || !meeting.albumPublishedAt || !meeting.photoUrl || !meeting.community) return null;

	const tags = await tagRepo().find({
		where: { meetingId: meeting.id },
		relations: ['member', 'member.participant'],
		order: { createdAt: 'ASC' },
	});
	return {
		communityName: meeting.community.name,
		meetingTitle: meeting.title,
		startDate: meeting.startDate,
		timezone: meeting.community.timezone || 'America/Mexico_City',
		photoUrl: await s3Service.presignPrivateUrl(meeting.photoUrl),
		tags: tags
			// Opted-out members and people who exercised their right to erasure never appear.
			.filter((t) => t.member && !t.member.faceRecognitionOptOut && !t.member.participant?.dataDeletedAt)
			.map((t) => ({
				name: albumDisplayName(t.member),
				box: [t.yMin, t.xMin, t.yMax, t.xMax] as [number, number, number, number],
			}))
			.filter((t) => t.name.length > 0),
	};
}
