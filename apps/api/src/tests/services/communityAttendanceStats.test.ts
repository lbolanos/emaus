import { setupTestDatabase, teardownTestDatabase, clearTestData } from '../test-setup';
import { TestDataFactory } from '../test-utils/testDataFactory';
import { AppDataSource } from '@/data-source';
import { User } from '@/entities/user.entity';
import { Community } from '@/entities/community.entity';
import { Retreat } from '@/entities/retreat.entity';
import { CommunityMember } from '@/entities/communityMember.entity';
import { RetreatParticipant } from '@/entities/retreatParticipant.entity';
import { RetreatPreparation } from '@/entities/retreatPreparation.entity';
import {
	RetreatCommunityMismatchError,
	getAttendanceStats,
	getServerAttendanceForRetreat,
} from '@/services/communityAttendanceStats';

const DAY = 24 * 60 * 60 * 1000;

/**
 * `joinedAt` is a @CreateDateColumn, so TypeORM stamps it on INSERT and an
 * override passed to `create()` is discarded. Same reason `createCommunityMember`
 * in the service overwrites it with a follow-up UPDATE.
 */
const setJoinedAt = async (memberId: string, joinedAt: Date): Promise<void> => {
	await AppDataSource.getRepository(CommunityMember).update(memberId, { joinedAt });
};

describe('communityAttendanceStats', () => {
	let user: User;
	let community: Community;
	let retreat: Retreat;
	// Fixed "now" so a meeting is unambiguously past or future regardless of when
	// the suite runs.
	const now = new Date('2026-09-07T12:00:00.000Z');
	const longAgo = new Date(now.getTime() - 365 * DAY);

	beforeAll(async () => {
		await setupTestDatabase();
	});

	afterAll(async () => {
		await teardownTestDatabase();
	});

	beforeEach(async () => {
		await clearTestData();
		user = await TestDataFactory.createTestUser();
		community = await TestDataFactory.createTestCommunity(user.id);
		retreat = await TestDataFactory.createTestRetreat();
	});

	const addMember = async (state = 'active_member') => {
		const participant = await TestDataFactory.createTestParticipant(retreat.id);
		const member = await TestDataFactory.createTestCommunityMember(
			community.id,
			participant.id,
			{ state: state as never },
		);
		await setJoinedAt(member.id, longAgo);
		return { participant, member };
	};

	describe('getAttendanceStats', () => {
		it('only counts meetings of the requested type', async () => {
			const { member } = await addMember();
			const prep = await TestDataFactory.createTestCommunityMeeting(community.id, {
				title: 'Preparación 1',
				meetingType: 'preparation',
				startDate: new Date(now.getTime() - 10 * DAY),
			});
			const general = await TestDataFactory.createTestCommunityMeeting(community.id, {
				title: 'Reunión general',
				meetingType: 'general',
				startDate: new Date(now.getTime() - 9 * DAY),
			});
			await TestDataFactory.createTestCommunityAttendance(prep.id, member.id, true);
			await TestDataFactory.createTestCommunityAttendance(general.id, member.id, false);

			const stats = await getAttendanceStats(community.id, { meetingType: 'preparation' }, now);

			expect(stats.meetings).toHaveLength(1);
			expect(stats.meetings[0].title).toBe('Preparación 1');
			expect(stats.members).toHaveLength(1);
			expect(stats.members[0]).toMatchObject({
				attended: 1,
				total: 1,
				ratePercent: 100,
				frequency: 'high',
			});
		});

		it('keeps future meetings without attendance out of the denominator', async () => {
			const { member } = await addMember();
			const past = await TestDataFactory.createTestCommunityMeeting(community.id, {
				meetingType: 'preparation',
				startDate: new Date(now.getTime() - 3 * DAY),
			});
			await TestDataFactory.createTestCommunityMeeting(community.id, {
				meetingType: 'preparation',
				startDate: new Date(now.getTime() + 3 * DAY),
			});
			await TestDataFactory.createTestCommunityAttendance(past.id, member.id, true);

			const stats = await getAttendanceStats(community.id, { meetingType: 'preparation' }, now);

			// The scheduled-but-not-yet-held meeting must not drag the member to 50%.
			expect(stats.totals.meetingCount).toBe(1);
			expect(stats.members[0]).toMatchObject({ attended: 1, total: 1, ratePercent: 100 });
		});

		it('counts a future meeting that already has attendance recorded', async () => {
			const { member } = await addMember();
			const upcoming = await TestDataFactory.createTestCommunityMeeting(community.id, {
				meetingType: 'preparation',
				startDate: new Date(now.getTime() + 2 * DAY),
			});
			await TestDataFactory.createTestCommunityAttendance(upcoming.id, member.id, true);

			const stats = await getAttendanceStats(community.id, { meetingType: 'preparation' }, now);

			expect(stats.totals.meetingCount).toBe(1);
			expect(stats.members[0]).toMatchObject({ attended: 1, total: 1 });
		});

		it('excludes announcements and cancelled occurrences', async () => {
			const { member } = await addMember();
			const real = await TestDataFactory.createTestCommunityMeeting(community.id, {
				meetingType: 'general',
				startDate: new Date(now.getTime() - 5 * DAY),
			});
			await TestDataFactory.createTestCommunityMeeting(community.id, {
				meetingType: 'general',
				isAnnouncement: true,
				startDate: new Date(now.getTime() - 4 * DAY),
			});
			await TestDataFactory.createTestCommunityMeeting(community.id, {
				meetingType: 'general',
				exceptionType: 'cancelled',
				startDate: new Date(now.getTime() - 3 * DAY),
			});
			await TestDataFactory.createTestCommunityAttendance(real.id, member.id, true);

			const stats = await getAttendanceStats(community.id, {}, now);

			expect(stats.totals.meetingCount).toBe(1);
			expect(stats.members[0]).toMatchObject({ attended: 1, total: 1, ratePercent: 100 });
		});

		it('ignores meetings held before a member joined, unless they attended', async () => {
			const { member } = await addMember();
			const joinedAt = new Date(now.getTime() - 20 * DAY);
			await setJoinedAt(member.id, joinedAt);

			// Before joining and absent: must not count against them.
			await TestDataFactory.createTestCommunityMeeting(community.id, {
				meetingType: 'preparation',
				startDate: new Date(now.getTime() - 40 * DAY),
			});
			// Before joining but marked present (member was added *during* the
			// meeting): counts, or they would show a false 0%.
			const attendedBeforeJoining = await TestDataFactory.createTestCommunityMeeting(
				community.id,
				{ meetingType: 'preparation', startDate: new Date(now.getTime() - 30 * DAY) },
			);
			await TestDataFactory.createTestCommunityAttendance(
				attendedBeforeJoining.id,
				member.id,
				true,
			);
			// After joining, absent.
			await TestDataFactory.createTestCommunityMeeting(community.id, {
				meetingType: 'preparation',
				startDate: new Date(now.getTime() - 10 * DAY),
			});

			const stats = await getAttendanceStats(community.id, { meetingType: 'preparation' }, now);

			expect(stats.totals.meetingCount).toBe(3);
			expect(stats.members[0]).toMatchObject({ attended: 1, total: 2, ratePercent: 50 });
		});

		it('counts pending_verification members as eligible but not declined ones', async () => {
			await addMember('active_member');
			await addMember('pending_verification');
			await addMember('not_interested');
			const meeting = await TestDataFactory.createTestCommunityMeeting(community.id, {
				meetingType: 'preparation',
				startDate: new Date(now.getTime() - 2 * DAY),
			});

			const stats = await getAttendanceStats(community.id, { meetingType: 'preparation' }, now);

			expect(stats.meetings[0].id).toBe(meeting.id);
			// Roster = active_member + pending_verification. `not_interested` is a
			// declination and does not inflate the denominator.
			expect(stats.meetings[0].eligible).toBe(2);
			// The ranking still lists everyone on the roster, declined included, so
			// the coordinator can see and filter them.
			expect(stats.members).toHaveLength(3);
		});

		it('reports the per-meeting percentage over eligible members', async () => {
			const a = await addMember();
			await addMember();
			const meeting = await TestDataFactory.createTestCommunityMeeting(community.id, {
				meetingType: 'preparation',
				startDate: new Date(now.getTime() - 2 * DAY),
			});
			await TestDataFactory.createTestCommunityAttendance(meeting.id, a.member.id, true);

			const stats = await getAttendanceStats(community.id, { meetingType: 'preparation' }, now);

			expect(stats.meetings[0]).toMatchObject({ attended: 1, eligible: 2, ratePercent: 50 });
			expect(stats.totals.averageRatePercent).toBe(50);
		});

		it('filters by date range in the community timezone', async () => {
			const { member } = await addMember();
			await AppDataSource.getRepository(Community).update(community.id, {
				timezone: 'America/Mexico_City',
			});
			// 2026-09-01 05:00Z is still 2026-08-31 23:00 in Mexico City, so a
			// `from` of 2026-09-01 must leave it out.
			const augustLocal = await TestDataFactory.createTestCommunityMeeting(community.id, {
				meetingType: 'preparation',
				startDate: new Date('2026-09-01T05:00:00.000Z'),
			});
			const september = await TestDataFactory.createTestCommunityMeeting(community.id, {
				meetingType: 'preparation',
				startDate: new Date('2026-09-03T01:45:00.000Z'),
			});
			await TestDataFactory.createTestCommunityAttendance(augustLocal.id, member.id, true);
			await TestDataFactory.createTestCommunityAttendance(september.id, member.id, true);

			const stats = await getAttendanceStats(
				community.id,
				{ meetingType: 'preparation', from: '2026-09-01' },
				now,
			);

			expect(stats.meetings.map((m) => m.id)).toEqual([september.id]);
		});

		it('filters by recurrence series', async () => {
			await addMember();
			const template = await TestDataFactory.createTestCommunityMeeting(community.id, {
				meetingType: 'preparation',
				isRecurrenceTemplate: true,
				startDate: new Date(now.getTime() - 14 * DAY),
			});
			const instance = await TestDataFactory.createTestCommunityMeeting(community.id, {
				meetingType: 'preparation',
				parentMeetingId: template.id,
				startDate: new Date(now.getTime() - 7 * DAY),
			});
			const unrelated = await TestDataFactory.createTestCommunityMeeting(community.id, {
				meetingType: 'preparation',
				startDate: new Date(now.getTime() - 5 * DAY),
			});

			const stats = await getAttendanceStats(
				community.id,
				{ seriesId: template.id },
				now,
			);

			const ids = stats.meetings.map((m) => m.id);
			expect(ids).toContain(template.id);
			expect(ids).toContain(instance.id);
			expect(ids).not.toContain(unrelated.id);
		});

		it('offers only the meeting types the community actually uses', async () => {
			await TestDataFactory.createTestCommunityMeeting(community.id, {
				meetingType: 'preparation',
				startDate: new Date(now.getTime() - 2 * DAY),
			});
			await TestDataFactory.createTestCommunityMeeting(community.id, {
				meetingType: 'preparation',
				// Future: still offered as an available type even though it does not
				// count yet, so the filter does not look broken.
				startDate: new Date(now.getTime() + 2 * DAY),
			});
			await TestDataFactory.createTestCommunityMeeting(community.id, {
				meetingType: 'general',
				startDate: new Date(now.getTime() - 1 * DAY),
			});

			const stats = await getAttendanceStats(community.id, {}, now);

			expect(stats.availableTypes).toEqual([
				{ meetingType: 'preparation', count: 2 },
				{ meetingType: 'general', count: 1 },
			]);
		});

		it('narrows the ranking to the serving team of a retreat', async () => {
			const onTeam = await addMember();
			await addMember(); // en el padrón pero no sirve en este retiro
			await AppDataSource.getRepository(Retreat).update(retreat.id, {
				communityId: community.id,
			});
			// El primer miembro sirve en el retiro; el segundo no.
			await AppDataSource.getRepository(RetreatParticipant).update(
				{ retreatId: retreat.id, participantId: onTeam.participant.id },
				{ type: 'server' },
			);
			const meeting = await TestDataFactory.createTestCommunityMeeting(community.id, {
				meetingType: 'preparation',
				startDate: new Date(now.getTime() - 2 * DAY),
			});
			await TestDataFactory.createTestCommunityAttendance(meeting.id, onTeam.member.id, true);
			// Filtrar por retiro acota también las reuniones a SUS preparaciones, así
			// que hay que vincularla o el conjunto queda vacío y el aserto del
			// ranking no mediría nada.
			const prepRepo = AppDataSource.getRepository(RetreatPreparation);
			await prepRepo.save(
				prepRepo.create({
					retreatId: retreat.id,
					type: 'session',
					weekNumber: 1,
					title: '1ª preparación',
					date: '2026-09-05',
					time: '20:00',
					sortOrder: 10,
					communityMeetingId: meeting.id,
				}),
			);

			const wholeRoster = await getAttendanceStats(community.id, {}, now);
			expect(wholeRoster.members).toHaveLength(2);

			const teamOnly = await getAttendanceStats(
				community.id,
				{ retreatId: retreat.id },
				now,
			);
			expect(teamOnly.members).toHaveLength(1);
			expect(teamOnly.members[0].memberId).toBe(onTeam.member.id);
			// El denominador de la REUNIÓN sigue siendo el padrón entero: el % de una
			// reunión se mide contra quién podía ir, no contra el equipo del retiro.
			expect(teamOnly.meetings[0].eligible).toBe(2);
		});

		it('acota las REUNIONES a las preparaciones de ese retiro', async () => {
			// Una comunidad acumula preparaciones de todos los retiros que ha
			// servido: filtrar por retiro tiene que dejar sólo las suyas.
			await addMember();
			await AppDataSource.getRepository(Retreat).update(retreat.id, {
				communityId: community.id,
			});
			const mine = await TestDataFactory.createTestCommunityMeeting(community.id, {
				meetingType: 'preparation',
				startDate: new Date(now.getTime() - 7 * DAY),
			});
			const otherRetreats = await TestDataFactory.createTestCommunityMeeting(community.id, {
				meetingType: 'preparation',
				startDate: new Date(now.getTime() - 14 * DAY),
			});
			// Sólo la primera queda vinculada al calendario de este retiro.
			const prepRepo = AppDataSource.getRepository(RetreatPreparation);
			await prepRepo.save(
				prepRepo.create({
					retreatId: retreat.id,
					type: 'session',
					weekNumber: 1,
					title: '1ª preparación',
					date: '2026-08-31',
					time: '20:00',
					sortOrder: 10,
					communityMeetingId: mine.id,
				}),
			);

			const scoped = await getAttendanceStats(community.id, { retreatId: retreat.id }, now);

			expect(scoped.meetings.map((m) => m.id)).toEqual([mine.id]);
			expect(scoped.meetings.map((m) => m.id)).not.toContain(otherRetreats.id);
			expect(scoped.retreatLinkedMeetingCount).toBe(1);
		});

		it('un retiro sin preparaciones sincronizadas se distingue de "no hubo reuniones"', async () => {
			await addMember();
			await AppDataSource.getRepository(Retreat).update(retreat.id, {
				communityId: community.id,
			});
			await TestDataFactory.createTestCommunityMeeting(community.id, {
				meetingType: 'preparation',
				startDate: new Date(now.getTime() - 7 * DAY),
			});

			const scoped = await getAttendanceStats(community.id, { retreatId: retreat.id }, now);

			expect(scoped.meetings).toHaveLength(0);
			// El 0 es lo que deja a la vista decir "sin sincronizar" en vez de
			// "no fue nadie", que son cosas distintas.
			expect(scoped.retreatLinkedMeetingCount).toBe(0);
		});

		it('cuenta los retiros de la comunidad en los que cada miembro sirvió', async () => {
			const member = await addMember();
			await AppDataSource.getRepository(Retreat).update(retreat.id, {
				communityId: community.id,
			});
			await AppDataSource.getRepository(RetreatParticipant).update(
				{ retreatId: retreat.id, participantId: member.participant.id },
				{ type: 'server' },
			);

			const stats = await getAttendanceStats(community.id, {}, now);

			expect(stats.members[0].retreatsServed).toBe(1);
		});

		it('no cuenta retiros de otra comunidad como servidos aquí', async () => {
			const member = await addMember();
			// El retiro existe y el participante sirve en él, pero NO está vinculado
			// a esta comunidad: "retiros servidos" es un dato de la comunidad.
			await AppDataSource.getRepository(RetreatParticipant).update(
				{ retreatId: retreat.id, participantId: member.participant.id },
				{ type: 'server' },
			);

			const stats = await getAttendanceStats(community.id, {}, now);

			expect(stats.members[0].retreatsServed).toBe(0);
		});

		it('ofrece los retiros de la comunidad para poblar el filtro', async () => {
			await addMember();
			await AppDataSource.getRepository(Retreat).update(retreat.id, {
				communityId: community.id,
			});

			const stats = await getAttendanceStats(community.id, {}, now);

			expect(stats.retreats.map((r) => r.id)).toEqual([retreat.id]);
		});

		it('rechaza un retreatId que no es de esta comunidad', async () => {
			await addMember();
			await expect(
				getAttendanceStats(community.id, { retreatId: retreat.id }, now),
			).rejects.toThrow(RetreatCommunityMismatchError);
		});

		it('returns zeroed members when nothing counts yet', async () => {
			await addMember();

			const stats = await getAttendanceStats(community.id, { meetingType: 'formation' }, now);

			expect(stats.totals).toMatchObject({ meetingCount: 0, averageRatePercent: 0 });
			expect(stats.members[0]).toMatchObject({ attended: 0, total: 0, frequency: 'none' });
		});
	});

	describe('getServerAttendanceForRetreat', () => {
		const linkRetreat = async (communityId: string | null) => {
			await AppDataSource.getRepository(Retreat).update(retreat.id, {
				communityId,
			});
		};

		const addServer = async (opts: { asMember: boolean }) => {
			const participant = await TestDataFactory.createTestParticipant(retreat.id, {
				type: 'server',
			} as never);
			if (!opts.asMember) return { participant, member: null };
			const member = await TestDataFactory.createTestCommunityMember(
				community.id,
				participant.id,
			);
			await setJoinedAt(member.id, longAgo);
			return { participant, member };
		};

		/**
		 * Preparación del retiro, materializada como reunión y vinculada.
		 *
		 * La proyección mide SÓLO las preparaciones del propio retiro, así que una
		 * reunión sin vincular no cuenta — que es justo lo que se quiere: la
		 * pantalla de mesas pregunta por ESTE retiro, no por todo el historial de
		 * la comunidad.
		 */
		let weekCounter = 0;
		beforeEach(() => {
			weekCounter = 0;
		});

		const addLinkedPreparation = async (daysAgo: number) => {
			weekCounter += 1;
			const meeting = await TestDataFactory.createTestCommunityMeeting(community.id, {
				meetingType: 'preparation',
				startDate: new Date(now.getTime() - daysAgo * DAY),
			});
			const prepRepo = AppDataSource.getRepository(RetreatPreparation);
			await prepRepo.save(
				prepRepo.create({
					retreatId: retreat.id,
					type: 'session',
					weekNumber: weekCounter,
					title: `${weekCounter}ª preparación`,
					date: '2026-08-19',
					time: '20:00',
					sortOrder: weekCounter * 10,
					communityMeetingId: meeting.id,
				}),
			);
			return meeting;
		};

		it('projects the community rate onto the retreat servers', async () => {
			await linkRetreat(community.id);
			const server = await addServer({ asMember: true });
			const first = await addLinkedPreparation(14);
			const second = await addLinkedPreparation(7);
			await TestDataFactory.createTestCommunityAttendance(first.id, server.member!.id, true);
			await TestDataFactory.createTestCommunityAttendance(second.id, server.member!.id, false);

			const result = await getServerAttendanceForRetreat(community.id, retreat.id, now);

			expect(result.meetingCount).toBe(2);
			expect(result.entries).toHaveLength(1);
			expect(result.entries[0]).toMatchObject({
				participantId: server.participant.id,
				attended: 1,
				total: 2,
				ratePercent: 50,
				frequency: 'medium',
			});
		});

		it('omits servers that are not on the roster instead of showing them at 0%', async () => {
			await linkRetreat(community.id);
			await addServer({ asMember: true });
			await addServer({ asMember: false });
			await addLinkedPreparation(2);

			const result = await getServerAttendanceForRetreat(community.id, retreat.id, now);

			expect(result.serverCount).toBe(2);
			expect(result.matchedCount).toBe(1);
			expect(result.unmatchedCount).toBe(1);
			expect(result.entries).toHaveLength(1);
		});

		it('ignores walkers and cancelled servers', async () => {
			await linkRetreat(community.id);
			await addServer({ asMember: true });
			const walker = await TestDataFactory.createTestParticipant(retreat.id);
			await TestDataFactory.createTestCommunityMember(community.id, walker.id);
			// Hace falta al menos una preparación VINCULADA: sin reuniones el servidor
			// no tiene dato y la entrada se omite a propósito (0/0 no es 0%).
			await addLinkedPreparation(2);

			const result = await getServerAttendanceForRetreat(community.id, retreat.id, now);

			expect(result.serverCount).toBe(1);
			expect(result.matchedCount).toBe(1);
		});

		it('refuses a retreat that is not linked to any community', async () => {
			await linkRetreat(null);
			await expect(
				getServerAttendanceForRetreat(community.id, retreat.id, now),
			).rejects.toThrow(RetreatCommunityMismatchError);
		});

		it('refuses a retreat linked to a different community', async () => {
			const other = await TestDataFactory.createTestCommunity(user.id, { name: 'Otra' });
			await linkRetreat(other.id);
			await expect(
				getServerAttendanceForRetreat(community.id, retreat.id, now),
			).rejects.toThrow(/otra comunidad/);
		});
	});
});
