import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { setupTestDatabase, teardownTestDatabase, clearTestData } from '../test-setup';
import { TestDataFactory } from '../test-utils/testDataFactory';
import { AppDataSource } from '@/data-source';
import { User } from '@/entities/user.entity';
import { Community } from '@/entities/community.entity';
import { Retreat } from '@/entities/retreat.entity';
import { CommunityMember } from '@/entities/communityMember.entity';
import { CommunityMeeting } from '@/entities/communityMeeting.entity';
import { CommunityAttendance } from '@/entities/communityAttendance.entity';
import { CommunityAdmin } from '@/entities/communityAdmin.entity';
import { CommunityMeetingPhotoTag } from '@/entities/communityMeetingPhotoTag.entity';
import { IdempotencyKey } from '@/entities/idempotencyKey.entity';
import { Participant } from '@/entities/participant.entity';
// Static import on purpose: with `await import()` Jest's ESM mode resolves another module
// instance whose AppDataSource misses the test-setup swap.
import { anonymizeParticipantByToken } from '@/services/participantService';
import { CommunityService } from '@/services/communityService';
import { CommunityController } from '@/controllers/communityController';
import { CommunityFaceController } from '@/controllers/communityFaceController';
import { requireCommunityOwner } from '@/middleware/authorization';
import { idempotency } from '@/middleware/idempotency';
import {
	getGalleryMemberIds,
	clearFaceGalleryCache,
	postProcessFaces,
} from '@/services/faceMatchService';
import { detectFaces, FaceModelError } from '@/services/faceModelClient';
import {
	faceMatchSchema,
	faceMatchConfirmSchema,
	recordSingleAttendanceSchema,
} from '@repo/types';

// The ONLY thing that would reach Gemini. Everything else (sharp, DB) is real.
jest.mock('@/services/faceModelClient', () => {
	const actual = jest.requireActual('@/services/faceModelClient');
	return { ...actual, detectFaces: jest.fn() };
});
jest.mock('@/services/emailService', () => ({
	EmailService: jest.fn(() => ({
		sendEmail: jest.fn(async () => true),
		isSmtpConfigured: jest.fn().mockReturnValue(true),
	})),
}));

const detectFacesMock = detectFaces as jest.MockedFunction<typeof detectFaces>;

function mockRes() {
	const res: any = { statusCode: 200, body: undefined, headers: {} as Record<string, string> };
	res.status = (code: number) => {
		res.statusCode = code;
		return res;
	};
	res.json = (body: any) => {
		res.body = body;
		return res;
	};
	res.setHeader = (k: string, v: string) => {
		res.headers[k] = v;
	};
	return res;
}

async function dataUrl(color: string, width = 200, height = 220): Promise<string> {
	const buf = await sharp({ create: { width, height, channels: 3, background: color } })
		.jpeg()
		.toBuffer();
	return `data:image/jpeg;base64,${buf.toString('base64')}`;
}

describe('Community face recognition + public album', () => {
	let owner: User;
	let community: Community;
	let otherCommunity: Community;
	let retreat: Retreat;
	let service: CommunityService;

	const memberRepo = () => AppDataSource.getRepository(CommunityMember);
	const meetingRepo = () => AppDataSource.getRepository(CommunityMeeting);
	const attendanceRepo = () => AppDataSource.getRepository(CommunityAttendance);
	const tagRepo = () => AppDataSource.getRepository(CommunityMeetingPhotoTag);

	beforeAll(async () => {
		await setupTestDatabase();
		service = new CommunityService();
	});
	afterAll(async () => {
		await teardownTestDatabase();
	});

	beforeEach(async () => {
		await clearTestData();
		await AppDataSource.getRepository(IdempotencyKey).clear();
		clearFaceGalleryCache();
		detectFacesMock.mockReset();
		owner = await TestDataFactory.createTestUser();
		community = await TestDataFactory.createTestCommunity(owner.id);
		otherCommunity = await TestDataFactory.createTestCommunity(owner.id);
		retreat = await TestDataFactory.createTestRetreat(owner.id);
	});

	async function addMember(
		communityId: string,
		overrides: Partial<CommunityMember> = {},
	): Promise<CommunityMember> {
		const participant = await TestDataFactory.createTestParticipant(retreat.id);
		return TestDataFactory.createTestCommunityMember(communityId, participant.id, overrides);
	}

	async function addMeeting(communityId: string, withPhoto = true): Promise<CommunityMeeting> {
		return meetingRepo().save(
			meetingRepo().create({
				communityId,
				title: 'Reunion de prueba',
				startDate: new Date('2026-10-20T20:00:00Z'),
				photoUrl: withPhoto ? await dataUrl('#888888', 400, 300) : null,
			}),
		);
	}

	// --- FR-11: owner-only toggle ---------------------------------------------------------

	describe('PATCH /:id/face-recognition', () => {
		it('lets the owner through the route guard and blocks a co-admin', async () => {
			const coAdmin = await TestDataFactory.createTestUser();
			await AppDataSource.getRepository(CommunityAdmin).save(
				AppDataSource.getRepository(CommunityAdmin).create({
					communityId: community.id,
					userId: coAdmin.id,
					role: 'admin',
					status: 'active',
					acceptedAt: new Date(),
				}),
			);

			const guard = requireCommunityOwner();
			const next = jest.fn();
			const okRes = mockRes();
			await guard({ user: { id: owner.id }, params: { id: community.id } }, okRes, next);
			expect(next).toHaveBeenCalledTimes(1);

			const next2 = jest.fn();
			const deniedRes = mockRes();
			await guard({ user: { id: coAdmin.id }, params: { id: community.id } }, deniedRes, next2);
			expect(next2).not.toHaveBeenCalled();
			expect(deniedRes.statusCode).toBe(403);
		});

		it('flips the flag', async () => {
			const res = mockRes();
			await CommunityFaceController.setEnabled(
				{ params: { id: community.id }, body: { enabled: true }, user: { id: owner.id }, get: () => '' } as any,
				res,
			);
			expect(res.body).toEqual({ id: community.id, faceRecognitionEnabled: true });
			const row = await AppDataSource.getRepository(Community).findOneByOrFail({ id: community.id });
			expect(row.faceRecognitionEnabled).toBe(true);
		});
	});

	// --- FR-12 / CA-7: opt-out ------------------------------------------------------------

	describe('opt-out', () => {
		it('keeps an opted-out member out of the gallery sent to the model', async () => {
			const photo = await dataUrl('#aa3333');
			const a = await addMember(community.id, { photoUrl: photo });
			const b = await addMember(community.id, { photoUrl: photo });
			await addMember(community.id); // no photo: never in the gallery

			expect((await getGalleryMemberIds(community.id)).sort()).toEqual([a.id, b.id].sort());

			const res = mockRes();
			await CommunityFaceController.setMemberOptOut(
				{
					params: { id: community.id, memberId: b.id },
					body: { optOut: true },
					user: { id: owner.id },
					get: () => '',
				} as any,
				res,
			);
			expect(res.body).toEqual({ id: b.id, faceRecognitionOptOut: true });
			// The change invalidated the cached gallery.
			expect(await getGalleryMemberIds(community.id)).toEqual([a.id]);
		});

		it('404s for a member of another community', async () => {
			const foreign = await addMember(otherCommunity.id);
			const res = mockRes();
			await CommunityFaceController.setMemberOptOut(
				{
					params: { id: community.id, memberId: foreign.id },
					body: { optOut: true },
					user: { id: owner.id },
					get: () => '',
				} as any,
				res,
			);
			expect(res.statusCode).toBe(404);
			expect((await memberRepo().findOneByOrFail({ id: foreign.id })).faceRecognitionOptOut).toBe(false);
		});

		it('invalidates the gallery when a member photo is set or deleted', async () => {
			const a = await addMember(community.id, { photoUrl: await dataUrl('#aa3333') });
			expect(await getGalleryMemberIds(community.id)).toEqual([a.id]);
			const b = await addMember(community.id);
			await service.setMemberPhoto(community.id, b.id, await dataUrl('#33aa33'));
			expect((await getGalleryMemberIds(community.id)).sort()).toEqual([a.id, b.id].sort());
			await service.deleteMemberPhoto(community.id, a.id);
			expect(await getGalleryMemberIds(community.id)).toEqual([b.id]);
		});
	});

	// --- face-match -----------------------------------------------------------------------

	describe('POST face-match', () => {
		const call = async (communityId: string, meetingId: string, image: string) => {
			const res = mockRes();
			await CommunityFaceController.faceMatch(
				{ params: { id: communityId, meetingId }, body: { image } } as any,
				res,
			);
			return res;
		};

		it('403s when the feature is disabled and never calls the model', async () => {
			const meeting = await addMeeting(community.id);
			const res = await call(community.id, meeting.id, await dataUrl('#000000', 400, 300));
			expect(res.statusCode).toBe(403);
			expect(detectFacesMock).not.toHaveBeenCalled();
		});

		it('404s for a meeting of another community (checked before the feature flag)', async () => {
			await AppDataSource.getRepository(Community).update(community.id, { faceRecognitionEnabled: true });
			const foreignMeeting = await addMeeting(otherCommunity.id);
			const res = await call(community.id, foreignMeeting.id, await dataUrl('#000000', 400, 300));
			expect(res.statusCode).toBe(404);
			expect(detectFacesMock).not.toHaveBeenCalled();
		});

		it('returns suggestions with crops; unknown numbers and duplicates become null', async () => {
			await AppDataSource.getRepository(Community).update(community.id, { faceRecognitionEnabled: true });
			const meeting = await addMeeting(community.id);
			const photo = await dataUrl('#aa3333');
			const a = await addMember(community.id, { photoUrl: photo });
			const b = await addMember(community.id, { photoUrl: photo });
			const gallery = await getGalleryMemberIds(community.id);
			const numberOf = (id: string) => gallery.indexOf(id) + 1;

			detectFacesMock.mockResolvedValue({
				faces: [
					{ box: [100, 100, 300, 300], match: numberOf(a.id), confidence: 0.9 },
					{ box: [100, 400, 300, 600], match: numberOf(b.id), confidence: 0.9 },
					{ box: [500, 100, 700, 300], match: numberOf(b.id), confidence: 0.9 }, // dup of b
					{ box: [500, 400, 700, 600], match: 99, confidence: 0.9 }, // out of range
					{ box: [500, 700, 500, 700], match: null, confidence: 0.1 }, // degenerate: dropped
				],
			});

			const res = await call(community.id, meeting.id, await dataUrl('#445566', 800, 600));
			expect(res.statusCode).toBe(200);
			expect(res.body.degraded).toBeUndefined();
			expect(res.body.faces).toHaveLength(4);
			expect(res.body.faces.map((f: any) => f.suggestedMemberId)).toEqual([a.id, null, null, null]);
			for (const f of res.body.faces) {
				expect(f.crop).toMatch(/^data:image\/jpeg;base64,/);
				const meta = await sharp(Buffer.from(f.crop.split(',')[1], 'base64')).metadata();
				expect(Math.max(meta.width!, meta.height!)).toBeLessThanOrEqual(512);
			}
			// The gallery handed to the model is the real composite, with only eligible members.
			expect(detectFacesMock).toHaveBeenCalledTimes(1);
			expect((await sharp(detectFacesMock.mock.calls[0][0].gallery).metadata()).width).toBe(6 * 140);
		});

		it('degrades to 200 with no faces when the model answers 503 / 429 / timeout', async () => {
			await AppDataSource.getRepository(Community).update(community.id, { faceRecognitionEnabled: true });
			const meeting = await addMeeting(community.id);
			for (const kind of ['busy', 'quota', 'timeout'] as const) {
				detectFacesMock.mockRejectedValueOnce(new FaceModelError(kind, 'x'));
				const res = await call(community.id, meeting.id, await dataUrl('#445566', 800, 600));
				expect(res.statusCode).toBe(200);
				expect(res.body).toEqual({ faces: [], degraded: true, reason: kind });
			}
		});

		it('400s an image that is not an image', async () => {
			await AppDataSource.getRepository(Community).update(community.id, { faceRecognitionEnabled: true });
			const meeting = await addMeeting(community.id);
			const res = await call(
				community.id,
				meeting.id,
				`data:image/jpeg;base64,${Buffer.from('not an image').toString('base64')}`,
			);
			expect(res.statusCode).toBe(400);
		});

		it('schema rejects non-image data URLs and oversize payloads', () => {
			const params = {
				id: '11111111-1111-4111-8111-111111111111',
				meetingId: '22222222-2222-4222-8222-222222222222',
			};
			expect(faceMatchSchema.safeParse({ body: { image: 'data:text/html;base64,AAAA' }, params }).success).toBe(false);
			expect(faceMatchSchema.safeParse({ body: { image: 'data:image/gif;base64,AAAA' }, params }).success).toBe(false);
			expect(faceMatchSchema.safeParse({ body: { image: 'data:image/png;base64,AAAA' }, params }).success).toBe(true);
			const huge = 'data:image/jpeg;base64,' + 'A'.repeat(5 * 1024 * 1024);
			expect(faceMatchSchema.safeParse({ body: { image: huge }, params }).success).toBe(false);
		});
	});

	// --- confirm --------------------------------------------------------------------------

	describe('POST face-match/confirm', () => {
		const confirm = async (communityId: string, meetingId: string, body: any) => {
			const res = mockRes();
			await CommunityFaceController.confirm(
				{ params: { id: communityId, meetingId }, body: { photos: [], tags: [], ...body } } as any,
				res,
			);
			return res;
		};

		it('marks present without deleting anyone, and does not overwrite an existing photo', async () => {
			const meeting = await addMeeting(community.id);
			const withPhoto = await addMember(community.id, { photoUrl: await dataUrl('#111111') });
			const withoutPhoto = await addMember(community.id);
			const alreadyThere = await addMember(community.id);
			await attendanceRepo().save(
				attendanceRepo().create({ meetingId: meeting.id, memberId: alreadyThere.id, attended: true }),
			);
			const originalPhoto = withPhoto.photoUrl;

			const res = await confirm(community.id, meeting.id, {
				present: [withPhoto.id, withoutPhoto.id],
				photos: [
					{ memberId: withPhoto.id, crop: await dataUrl('#ff0000') },
					{ memberId: withoutPhoto.id, crop: await dataUrl('#00ff00') },
				],
				tags: [
					{ memberId: withPhoto.id, box: [10, 20, 110, 120] },
					{ memberId: withoutPhoto.id, box: [200, 300, 400, 500] },
				],
			});

			expect(res.statusCode).toBe(200);
			expect(res.body).toEqual({ attendanceMarked: 2, photosSet: 1, tagsSaved: 2, skippedOptOut: 0 });
			expect((await memberRepo().findOneByOrFail({ id: withPhoto.id })).photoUrl).toBe(originalPhoto);
			expect((await memberRepo().findOneByOrFail({ id: withoutPhoto.id })).photoUrl).toMatch(/^data:image/);
			// The member who was not in `present` keeps their attendance.
			const rows = await attendanceRepo().find({ where: { meetingId: meeting.id } });
			expect(rows.filter((r) => r.attended).map((r) => r.memberId).sort()).toEqual(
				[withPhoto.id, withoutPhoto.id, alreadyThere.id].sort(),
			);
			expect(await tagRepo().count({ where: { meetingId: meeting.id } })).toBe(2);
		});

		it('upserts a tag instead of duplicating it', async () => {
			const meeting = await addMeeting(community.id);
			const m = await addMember(community.id);
			await confirm(community.id, meeting.id, { present: [m.id], tags: [{ memberId: m.id, box: [1, 2, 3, 4] }] });
			await confirm(community.id, meeting.id, { present: [m.id], tags: [{ memberId: m.id, box: [10, 20, 30, 40] }] });
			const tags = await tagRepo().find({ where: { meetingId: meeting.id } });
			expect(tags).toHaveLength(1);
			expect([tags[0].yMin, tags[0].xMin, tags[0].yMax, tags[0].xMax]).toEqual([10, 20, 30, 40]);
		});

		it('marks an opted-out member present but never sets their photo or tags them', async () => {
			const meeting = await addMeeting(community.id);
			const m = await addMember(community.id, { faceRecognitionOptOut: true });
			const res = await confirm(community.id, meeting.id, {
				present: [m.id],
				photos: [{ memberId: m.id, crop: await dataUrl('#00ff00') }],
				tags: [{ memberId: m.id, box: [1, 2, 3, 4] }],
			});
			expect(res.body).toEqual({ attendanceMarked: 1, photosSet: 0, tagsSaved: 0, skippedOptOut: 2 });
			expect((await memberRepo().findOneByOrFail({ id: m.id })).photoUrl ?? null).toBeNull();
			expect(await tagRepo().count()).toBe(0);
			expect((await attendanceRepo().findOneByOrFail({ meetingId: meeting.id, memberId: m.id })).attended).toBe(true);
		});

		it('404s for a meeting or a member of another community and writes nothing', async () => {
			const meeting = await addMeeting(community.id);
			const foreignMeeting = await addMeeting(otherCommunity.id);
			const foreignMember = await addMember(otherCommunity.id);
			const mine = await addMember(community.id);

			expect((await confirm(community.id, foreignMeeting.id, { present: [mine.id] })).statusCode).toBe(404);
			expect((await confirm(community.id, meeting.id, { present: [mine.id, foreignMember.id] })).statusCode).toBe(404);
			expect(await attendanceRepo().count()).toBe(0);
		});

		it('schema bounds boxes to 0-1000 with max > min', () => {
			const params = {
				id: '11111111-1111-4111-8111-111111111111',
				meetingId: '22222222-2222-4222-8222-222222222222',
			};
			const memberId = '33333333-3333-4333-8333-333333333333';
			const parse = (box: number[]) =>
				faceMatchConfirmSchema.safeParse({ body: { present: [memberId], tags: [{ memberId, box }] }, params }).success;
			expect(parse([0, 0, 1000, 1000])).toBe(true);
			expect(parse([0, 0, 1001, 1000])).toBe(false);
			expect(parse([500, 0, 400, 1000])).toBe(false);
		});
	});

	// --- cover photo replace/delete drops tags (FR-29) -----------------------------------

	it('setMeetingPhoto and deleteMeetingPhoto delete that meeting tags only', async () => {
		const meeting = await addMeeting(community.id);
		const other = await addMeeting(community.id);
		const m = await addMember(community.id);
		await tagRepo().save([
			tagRepo().create({ meetingId: meeting.id, memberId: m.id, yMin: 1, xMin: 2, yMax: 3, xMax: 4 }),
			tagRepo().create({ meetingId: other.id, memberId: m.id, yMin: 1, xMin: 2, yMax: 3, xMax: 4 }),
		]);
		await service.setMeetingPhoto(meeting.id, await dataUrl('#123456'));
		expect(await tagRepo().count({ where: { meetingId: meeting.id } })).toBe(0);
		expect(await tagRepo().count({ where: { meetingId: other.id } })).toBe(1);
		await service.deleteMeetingPhoto(other.id);
		expect(await tagRepo().count()).toBe(0);
	});

	// --- attendance/single ----------------------------------------------------------------

	describe('POST attendance/single', () => {
		// Generated, not a literal: gitleaks' generic-api-key rule flags a hard-coded uuid named KEY.
		const KEY = randomUUID();

		// The controller's module-level service captured its repositories before the test
		// DataSource swap; route its calls through the instance built after the swap.
		beforeEach(() => {
			const original = CommunityService.prototype.recordSingleAttendance;
			jest
				.spyOn(CommunityService.prototype, 'recordSingleAttendance')
				.mockImplementation((...args: any[]) => (original as any).apply(service, args));
		});
		afterEach(() => jest.restoreAllMocks());

		/** Runs idempotency + controller like Express would, resolving when the answer leaves. */
		const run = (params: any, body: any, key?: string) =>
			new Promise<any>((resolve, reject) => {
				const res: any = { statusCode: 200, headers: {} as Record<string, string> };
				res.status = (c: number) => {
					res.statusCode = c;
					return res;
				};
				res.setHeader = (k: string, v: string) => {
					res.headers[k] = v;
				};
				res.json = (b: any) => {
					res.body = b;
					resolve(res);
					return res;
				};
				res.end = () => {
					resolve(res);
					return res;
				};
				res.on = () => res;
				const req: any = {
					params,
					body,
					user: { id: owner.id },
					method: 'POST',
					originalUrl: `/api/communities/${params.id}/meetings/${params.meetingId}/attendance/single`,
					get: (h: string) => (h.toLowerCase() === 'idempotency-key' ? key : undefined),
				};
				idempotency(req, res, (err?: any) => {
					if (err) return reject(err);
					CommunityController.recordSingleAttendance(req, res).catch(reject);
				}).catch(reject);
			});

		it('replays the stored answer for the same key without writing twice', async () => {
			const meeting = await addMeeting(community.id);
			const m = await addMember(community.id);
			const params = { id: community.id, meetingId: meeting.id };

			const first = await run(params, { memberId: m.id, attended: true }, KEY);
			expect(first.statusCode).toBe(201);
			// Same tap resent after the device lost the answer; meanwhile someone unmarked it.
			await attendanceRepo().update({ meetingId: meeting.id, memberId: m.id }, { attended: false });
			const replay = await run(params, { memberId: m.id, attended: true }, KEY);
			expect(replay.headers['Idempotent-Replayed']).toBe('true');
			expect(replay.statusCode).toBe(201);
			expect(await attendanceRepo().count({ where: { meetingId: meeting.id } })).toBe(1);
			expect((await attendanceRepo().findOneByOrFail({ meetingId: meeting.id, memberId: m.id })).attended).toBe(false);
		});

		it('uses occurredAt as recordedAt when it is in the past, and ignores a future one', async () => {
			const meeting = await addMeeting(community.id);
			const m = await addMember(community.id);
			const params = { id: community.id, meetingId: meeting.id };

			const past = new Date(Date.now() - 3 * 3600_000);
			await run(params, { memberId: m.id, attended: true, occurredAt: past.toISOString() });
			let row = await attendanceRepo().findOneByOrFail({ meetingId: meeting.id, memberId: m.id });
			expect(row.recordedAt.getTime()).toBe(past.getTime());

			const before = Date.now();
			await run(params, {
				memberId: m.id,
				attended: false,
				occurredAt: new Date(Date.now() + 3600_000).toISOString(),
			});
			row = await attendanceRepo().findOneByOrFail({ meetingId: meeting.id, memberId: m.id });
			expect(row.recordedAt.getTime()).toBeGreaterThanOrEqual(before);
			expect(row.attended).toBe(false);
		});

		it('404s a meeting that belongs to another community (FR-23)', async () => {
			const foreignMeeting = await addMeeting(otherCommunity.id);
			const m = await addMember(community.id);
			const res = await run({ id: community.id, meetingId: foreignMeeting.id }, { memberId: m.id, attended: true });
			expect(res.statusCode).toBe(404);
			expect(await attendanceRepo().count()).toBe(0);
		});

		it('schema: uuid memberId, boolean attended, ISO or empty occurredAt', () => {
			const params = {
				id: '11111111-1111-4111-8111-111111111111',
				meetingId: '22222222-2222-4222-8222-222222222222',
			};
			const memberId = '33333333-3333-4333-8333-333333333333';
			const ok = (body: any) => recordSingleAttendanceSchema.safeParse({ body, params }).success;
			expect(ok({ memberId, attended: true })).toBe(true);
			expect(ok({ memberId, attended: true, occurredAt: '' })).toBe(true);
			expect(ok({ memberId, attended: true, occurredAt: '2026-10-22T10:00:00.000Z' })).toBe(true);
			expect(ok({ memberId: 'x', attended: true })).toBe(false);
			expect(ok({ memberId, attended: 'yes' })).toBe(false);
			expect(ok({ memberId, attended: true, occurredAt: 'yesterday' })).toBe(false);
		});
	});

	// --- public album ---------------------------------------------------------------------

	describe('public album', () => {
		const getAlbum = async (token: string) => {
			const res = mockRes();
			await CommunityFaceController.getPublicAlbum({ params: { token } } as any, res);
			return res;
		};

		it('publishes with a random token, serves names only, and unpublishes', async () => {
			const meeting = await addMeeting(community.id);
			const shown = await addMember(community.id, {
				firstName: 'Maria Elena',
				lastName: 'Lopez Garcia',
				email: 'secret@example.com',
				cellPhone: '+525512345678',
			});
			const hidden = await addMember(community.id, {
				firstName: 'Pedro',
				lastName: 'Ramirez',
				faceRecognitionOptOut: true,
			});
			await tagRepo().save([
				tagRepo().create({ meetingId: meeting.id, memberId: shown.id, yMin: 10, xMin: 20, yMax: 30, xMax: 40 }),
				tagRepo().create({ meetingId: meeting.id, memberId: hidden.id, yMin: 50, xMin: 60, yMax: 70, xMax: 80 }),
			]);

			const pub = mockRes();
			await CommunityFaceController.publishAlbum({ params: { id: community.id, meetingId: meeting.id } } as any, pub);
			expect(pub.statusCode).toBe(201);
			const token: string = pub.body.albumToken;
			expect(token).toMatch(/^[0-9a-f]{32}$/);
			// Publishing again keeps the link that was already shared.
			const again = mockRes();
			await CommunityFaceController.publishAlbum({ params: { id: community.id, meetingId: meeting.id } } as any, again);
			expect(again.body.albumToken).toBe(token);

			const res = await getAlbum(token);
			expect(res.statusCode).toBe(200);
			expect(res.headers['X-Robots-Tag']).toContain('noindex');
			expect(res.body.tags).toEqual([{ name: 'Maria Elena Lopez', box: [10, 20, 30, 40] }]);
			expect(res.body.meetingTitle).toBe('Reunion de prueba');
			expect(res.body.communityName).toBe(community.name);
			expect(res.body.photoUrl).toMatch(/^data:image/);
			const serialized = JSON.stringify(res.body);
			for (const secret of ['secret@example.com', '5512345678', 'Pedro', 'Ramirez', 'Garcia']) {
				expect(serialized).not.toContain(secret);
			}

			const unpub = mockRes();
			await CommunityFaceController.unpublishAlbum({ params: { id: community.id, meetingId: meeting.id } } as any, unpub);
			expect(unpub.body).toEqual({ albumToken: null, albumPublishedAt: null });
			const gone = await getAlbum(token);
			expect(gone.statusCode).toBe(404);
		});

		it('drops the face tag of someone who exercised the right to erasure', async () => {
			const meeting = await addMeeting(community.id);
			const erased = await addMember(community.id, { firstName: 'Lucia', lastName: 'Ortega' });
			const kept = await addMember(community.id, { firstName: 'Ana', lastName: 'Ruiz' });
			await tagRepo().save([
				tagRepo().create({ meetingId: meeting.id, memberId: erased.id, yMin: 10, xMin: 20, yMax: 30, xMax: 40 }),
				tagRepo().create({ meetingId: meeting.id, memberId: kept.id, yMin: 50, xMin: 60, yMax: 70, xMax: 80 }),
			]);
			const pub = mockRes();
			await CommunityFaceController.publishAlbum({ params: { id: community.id, meetingId: meeting.id } } as any, pub);

			const token = 'erasure-token-face-tags';
			await AppDataSource.getRepository(Participant).update(erased.participantId, { dataDeleteToken: token } as any);
			expect(await anonymizeParticipantByToken(token)).toBe(true);

			expect(await tagRepo().count({ where: { memberId: erased.id } })).toBe(0);
			const res = await getAlbum(pub.body.albumToken);
			expect(res.body.tags).toEqual([{ name: 'Ana Ruiz', box: [50, 60, 70, 80] }]);
		});

		it('answers one identical 404 for unknown, malformed and unpublished tokens', async () => {
			const meeting = await addMeeting(community.id);
			await meetingRepo().update(meeting.id, { albumToken: 'a'.repeat(32), albumPublishedAt: null });
			const bodies = [];
			for (const token of ['f'.repeat(32), 'nope', "' OR 1=1 --", 'a'.repeat(32)]) {
				const res = await getAlbum(token);
				expect(res.statusCode).toBe(404);
				bodies.push(JSON.stringify(res.body));
			}
			expect(new Set(bodies).size).toBe(1);
		});

		it('refuses to publish or unpublish a meeting of another community, and a meeting with no photo', async () => {
			const foreign = await addMeeting(otherCommunity.id);
			const noPhoto = await addMeeting(community.id, false);
			for (const fn of ['publishAlbum', 'unpublishAlbum'] as const) {
				const res = mockRes();
				await CommunityFaceController[fn]({ params: { id: community.id, meetingId: foreign.id } } as any, res);
				expect(res.statusCode).toBe(404);
			}
			const res = mockRes();
			await CommunityFaceController.publishAlbum({ params: { id: community.id, meetingId: noPhoto.id } } as any, res);
			expect(res.statusCode).toBe(409);
			expect((await meetingRepo().findOneByOrFail({ id: foreign.id })).albumToken ?? null).toBeNull();
		});
	});

	// --- pure post-processing -------------------------------------------------------------

	describe('postProcessFaces', () => {
		it('maps numbers, nulls out-of-range and non-integer, clamps boxes, nulls duplicates', () => {
			const map = new Map([
				[1, 'm1'],
				[2, 'm2'],
			]);
			const out = postProcessFaces(
				[
					{ box: [-5, 10, 100, 1200], match: 1 },
					{ box: [0, 0, 50, 50], match: 3 },
					{ box: [0, 0, 50, 50], match: 1.5 },
					{ box: [0, 0, 50, 50], match: 2 },
					{ box: [0, 0, 50, 50], match: 2 },
					{ box: [10, 10, 10, 90], match: null },
				],
				map,
			);
			expect(out).toHaveLength(5);
			expect(out[0]).toEqual({ box: [0, 10, 100, 1000], suggestedMemberId: 'm1' });
			expect(out.map((f) => f.suggestedMemberId)).toEqual(['m1', null, null, null, null]);
		});
	});
});
