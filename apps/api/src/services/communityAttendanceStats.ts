import { In, IsNull, Not } from 'typeorm';
import type { ParticipationFrequency } from '@repo/types';
import { AppDataSource } from '../data-source';
import { CommunityMeeting } from '../entities/communityMeeting.entity';
import { CommunityAttendance } from '../entities/communityAttendance.entity';
import { CommunityMember } from '../entities/communityMember.entity';
import { Community } from '../entities/community.entity';
import { Retreat } from '../entities/retreat.entity';
import { RetreatParticipant } from '../entities/retreatParticipant.entity';
import { RetreatPreparation } from '../entities/retreatPreparation.entity';
import { makeDateInTimezone } from '../utils/date.transformer';
import { resolveMemberProfile } from '@repo/utils';

/**
 * Attendance statistics for a community, sliced by meeting type.
 *
 * This module owns the single definition of "which meetings count towards an
 * attendance percentage". `communityService.getMembers` and the report below
 * both go through it, so the badge in the member list and the ranking in the
 * report can never disagree — they used to, because `getMembers` counted future
 * meetings (nobody has attended them yet) while the dashboard did not.
 *
 * Repositories are resolved per call, not captured in fields: the Jest harness
 * swaps `AppDataSource` after module import, and holding a reference from
 * import time yields "Class constructor cannot be invoked without 'new'".
 */

export type MeetingTypeValue =
	| 'general'
	| 'preparation'
	| 'formation'
	| 'service'
	| 'fellowship'
	| 'other';

export interface AttendanceStatsFilters {
	meetingType?: MeetingTypeValue;
	/** Root id of a recurrence series (the template's own id). */
	seriesId?: string;
	/** Date-only YYYY-MM-DD, inclusive, read in the community's timezone. */
	from?: string;
	/** Date-only YYYY-MM-DD, inclusive (whole day), read in the community's timezone. */
	to?: string;
	/**
	 * Scopes the whole report to one retreat. Two effects, both wanted together:
	 *  - the meetings narrow to the preparations of THAT retreat (the ones linked
	 *    through `retreat_preparation.communityMeetingId`), because a community
	 *    accumulates preparations from every retreat it has ever run;
	 *  - the ranking narrows to that retreat's serving team, which is the point of
	 *    the report — 84 members on the roster against 11 servers on the team.
	 *
	 * The retreat must be linked to this community.
	 */
	retreatId?: string;
}

/**
 * States that make up the community roster. Positive list on purpose: a
 * `NOT IN [declined...]` would silently start excluding a future state that is
 * meant to count. See skill `community-state-semantics`.
 */
export class RetreatCommunityMismatchError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'RetreatCommunityMismatchError';
	}
}

export const ROSTER_STATES = ['active_member', 'pending_verification'] as const;

/** Same thresholds the member list badge has always used. */
export const frequencyForRate = (ratePercent: number): ParticipationFrequency => {
	if (ratePercent >= 75) return 'high';
	if (ratePercent >= 25) return 'medium';
	if (ratePercent >= 1) return 'low';
	return 'none';
};

/** Root of the recurrence series a meeting belongs to. */
const seriesRootId = (meeting: Pick<CommunityMeeting, 'id' | 'parentMeetingId'>): string =>
	meeting.parentMeetingId ?? meeting.id;

/**
 * Canonical fallback timezone. Duplicated from `communityService.getCommunityTimezone`
 * on purpose: importing it here would close an import cycle (communityService
 * consumes this module), and a cycle around TypeORM entity classes breaks at
 * module-init time rather than failing a type check.
 */
const timezoneOf = (community: { timezone?: string | null } | null | undefined): string =>
	community?.timezone || 'America/Mexico_City';

const startOfDayUtc = (ymd: string, tz: string): Date => {
	const [y, m, d] = ymd.split('-').map(Number);
	return makeDateInTimezone(y, m - 1, d, 0, 0, tz);
};

/** Exclusive upper bound: midnight of the day AFTER `ymd`, so `to` is inclusive. */
const endOfDayUtc = (ymd: string, tz: string): Date => {
	const [y, m, d] = ymd.split('-').map(Number);
	return makeDateInTimezone(y, m - 1, d + 1, 0, 0, tz);
};

/** A meeting that can carry attendance, regardless of whether it already happened. */
export const isAttendableMeeting = (
	meeting: Pick<CommunityMeeting, 'isAnnouncement' | 'exceptionType'>,
): boolean => meeting.isAnnouncement !== true && meeting.exceptionType !== 'cancelled';

/**
 * Reuniones de comunidad que materializan las preparaciones de un retiro.
 *
 * Vacío = ese retiro no tiene preparaciones sincronizadas. El caller NO debe
 * tratarlo como "sin asistencia": es "sin sincronizar", y la UI tiene que
 * decirlo con su enlace al calendario, o el coordinador ve un informe vacío sin
 * saber por qué.
 */
export const loadRetreatLinkedMeetingIds = async (retreatId: string): Promise<Set<string>> => {
	const rows = await AppDataSource.getRepository(RetreatPreparation).find({
		where: { retreatId, communityMeetingId: Not(IsNull()) },
		select: ['id', 'communityMeetingId'],
	});
	return new Set(rows.map((row) => row.communityMeetingId!));
};

export interface ConsideredMeetingSet {
	/** Meetings that count for a percentage: attendable, filtered, and already relevant. */
	considered: CommunityMeeting[];
	/** Attendable meetings before filtering — used to offer only non-empty types. */
	attendable: CommunityMeeting[];
	/** meetingId -> { attended, recorded } over the considered set. */
	countsByMeeting: Map<string, { attended: number; recorded: number }>;
	/**
	 * Cuántas reuniones tiene vinculadas el retiro filtrado, antes de aplicar el
	 * resto de filtros. 0 con `retreatId` puesto = no está sincronizado, que es
	 * un mensaje distinto de "no hubo reuniones".
	 */
	retreatLinkedMeetingCount: number;
}

/**
 * Resolves which meetings count, applying the filters.
 *
 * A meeting is *considered* when it is attendable, matches the filters, and is
 * either already past or has at least one attendance record. The second half of
 * that rule is what keeps a meeting scheduled for next week out of everybody's
 * denominator, while still counting a meeting whose attendance was captured
 * slightly ahead of its start time.
 */
export const loadConsideredMeetings = async (
	communityId: string,
	filters: AttendanceStatsFilters = {},
	now: Date = new Date(),
): Promise<ConsideredMeetingSet> => {
	const meetingRepo = AppDataSource.getRepository(CommunityMeeting);
	const attendanceRepo = AppDataSource.getRepository(CommunityAttendance);
	const communityRepo = AppDataSource.getRepository(Community);

	const all = await meetingRepo.find({ where: { communityId } });
	const attendable = all.filter(isAttendableMeeting);

	const community = await communityRepo.findOne({ where: { id: communityId } });
	const tz = timezoneOf(community);

	let filtered = attendable;
	let retreatLinkedMeetingCount = 0;
	if (filters.retreatId) {
		const linked = await loadRetreatLinkedMeetingIds(filters.retreatId);
		retreatLinkedMeetingCount = linked.size;
		filtered = filtered.filter((m) => linked.has(m.id));
	}
	if (filters.meetingType) {
		filtered = filtered.filter((m) => m.meetingType === filters.meetingType);
	}
	if (filters.seriesId) {
		filtered = filtered.filter((m) => seriesRootId(m) === filters.seriesId);
	}
	if (filters.from) {
		const fromInstant = startOfDayUtc(filters.from, tz);
		filtered = filtered.filter((m) => m.startDate >= fromInstant);
	}
	if (filters.to) {
		const toInstant = endOfDayUtc(filters.to, tz);
		filtered = filtered.filter((m) => m.startDate < toInstant);
	}

	// One aggregate instead of a count() per meeting: `getDashboardStats` does
	// the latter and it is N+1 over the whole history.
	const countsByMeeting = new Map<string, { attended: number; recorded: number }>();
	if (filtered.length > 0) {
		const records = await attendanceRepo.find({
			where: { meetingId: In(filtered.map((m) => m.id)) },
			select: ['meetingId', 'attended'],
		});
		for (const record of records) {
			const entry = countsByMeeting.get(record.meetingId) ?? { attended: 0, recorded: 0 };
			entry.recorded += 1;
			if (record.attended) entry.attended += 1;
			countsByMeeting.set(record.meetingId, entry);
		}
	}

	const considered = filtered
		.filter((m) => m.startDate <= now || (countsByMeeting.get(m.id)?.recorded ?? 0) > 0)
		.sort((a, b) => a.startDate.getTime() - b.startDate.getTime());

	return { considered, attendable, countsByMeeting, retreatLinkedMeetingCount };
};

export interface MemberRate {
	attended: number;
	total: number;
	ratePercent: number;
	frequency: ParticipationFrequency;
}

/**
 * Per-member rate over a set of considered meetings.
 *
 * The denominator is per member: a meeting counts if it happened after they
 * joined, OR if they have an `attended = true` record for it even though it
 * predates their `joinedAt`. Without that second clause, adding a member
 * *during* a meeting and marking them present left them at a false 0% with the
 * meeting excluded from the denominator despite having attendance.
 */
export const computeMemberRates = (
	consideredMeetings: Pick<CommunityMeeting, 'id' | 'startDate'>[],
	attendedMeetingIdsByMember: Map<string, Set<string>>,
	members: Pick<CommunityMember, 'id' | 'joinedAt'>[],
): Map<string, MemberRate> => {
	const result = new Map<string, MemberRate>();
	for (const member of members) {
		const attendedIds = attendedMeetingIdsByMember.get(member.id) ?? new Set<string>();
		const valid = consideredMeetings.filter(
			(m) => m.startDate >= member.joinedAt || attendedIds.has(m.id),
		);
		const attended = valid.filter((m) => attendedIds.has(m.id)).length;
		const total = valid.length;
		const ratePercent = total > 0 ? (attended / total) * 100 : 0;
		result.set(member.id, {
			attended,
			total,
			ratePercent,
			frequency: frequencyForRate(ratePercent),
		});
	}
	return result;
};

/** meetingId sets of `attended = true` per member, over the given meetings. */
export const loadAttendedByMember = async (
	meetingIds: string[],
): Promise<Map<string, Set<string>>> => {
	const byMember = new Map<string, Set<string>>();
	if (meetingIds.length === 0) return byMember;
	const attendanceRepo = AppDataSource.getRepository(CommunityAttendance);
	const records = await attendanceRepo.find({
		where: { meetingId: In(meetingIds), attended: true },
		select: ['memberId', 'meetingId'],
	});
	for (const record of records) {
		const set = byMember.get(record.memberId) ?? new Set<string>();
		set.add(record.meetingId);
		byMember.set(record.memberId, set);
	}
	return byMember;
};

/**
 * Members of the community that belong in an attendance listing: everyone whose
 * participant has not exercised their deletion right. Deliberately NOT filtered
 * by `state` — the coordinator passes the list against the whole roster, and
 * filtering to `active_member` once hid 51 of 62 members (incident 2026-05-17).
 * Each row carries its `state` so the UI can filter or label.
 */
const loadRosterMembers = async (communityId: string): Promise<CommunityMember[]> => {
	const memberRepo = AppDataSource.getRepository(CommunityMember);
	const members = await memberRepo.find({
		where: { communityId },
		relations: ['participant'],
	});
	return members.filter((m) => !m.participant?.dataDeletedAt);
};

/**
 * `participantId` del equipo servidor de un retiro (servidores y angelitos, sin
 * cancelados). Lanza si el retiro no pertenece a la comunidad: el vínculo es lo
 * que autoriza a cruzar los dos padrones.
 */
export const loadRetreatServingParticipantIds = async (
	communityId: string,
	retreatId: string,
): Promise<string[]> => {
	const retreat = await AppDataSource.getRepository(Retreat).findOne({
		where: { id: retreatId },
		select: ['id', 'communityId'],
	});
	if (!retreat) throw new RetreatCommunityMismatchError('El retiro no existe');
	if (retreat.communityId !== communityId) {
		throw new RetreatCommunityMismatchError(
			retreat.communityId
				? 'El retiro pertenece a otra comunidad'
				: 'El retiro no está vinculado a una comunidad',
		);
	}
	const serving = await AppDataSource.getRepository(RetreatParticipant).find({
		where: { retreatId, type: In(['server', 'partial_server']), isCancelled: false },
		select: ['id', 'participantId'],
	});
	return serving.map((rp) => rp.participantId).filter((id): id is string => Boolean(id));
};

/**
 * Retiros DE ESTA COMUNIDAD en los que cada participante sirvió, por
 * `participantId`. Mide el compromiso en retiros servidos, no sólo en reuniones
 * asistidas — un servidor veterano puede faltar a una preparación y seguir
 * siendo la apuesta segura para una mesa.
 *
 * Sólo cuenta retiros vinculados a la comunidad: sin el vínculo el número sería
 * "retiros en el movimiento", que es otra cosa y no le corresponde a esta vista.
 */
export const loadCommunityRetreatsServed = async (
	communityId: string,
): Promise<Map<string, number>> => {
	const rows: { participantId: string; served: number }[] = await AppDataSource.query(
		`SELECT rp.participantId AS participantId, COUNT(DISTINCT rp.retreatId) AS served
		   FROM retreat_participants rp
		   JOIN retreat r ON r.id = rp.retreatId
		  WHERE r.communityId = ?
		    AND rp.type IN ('server', 'partial_server')
		    AND rp.isCancelled = 0
		    AND rp.participantId IS NOT NULL
		  GROUP BY rp.participantId`,
		[communityId],
	);
	return new Map(rows.map((row) => [row.participantId, Number(row.served)]));
};

export interface AttendanceStatsMeetingRow {
	id: string;
	title: string;
	startDate: Date;
	meetingType: MeetingTypeValue;
	attended: number;
	eligible: number;
	ratePercent: number;
}

export interface AttendanceStatsMemberRow {
	memberId: string;
	participantId: string;
	firstName: string;
	lastName: string;
	state: string;
	attended: number;
	total: number;
	ratePercent: number;
	frequency: ParticipationFrequency;
	/** Retiros de esta comunidad en los que ha servido. */
	retreatsServed: number;
}

export interface CommunityAttendanceStatsResult {
	filters: AttendanceStatsFilters;
	meetings: AttendanceStatsMeetingRow[];
	members: AttendanceStatsMemberRow[];
	totals: { meetingCount: number; memberCount: number; averageRatePercent: number };
	availableTypes: { meetingType: MeetingTypeValue; count: number }[];
	/**
	 * Retiros de esta comunidad, para poblar el filtro por retiro. Va en la
	 * respuesta para que la vista no necesite otra llamada ni cargar los retiros
	 * de todas las comunidades.
	 */
	retreats: { id: string; label: string; startDate: Date }[];
	/**
	 * Preparaciones del retiro filtrado que están sincronizadas como reuniones.
	 * 0 con un retiro elegido significa "sin sincronizar", no "sin asistencia":
	 * la vista lo distingue para no dejar al coordinador ante un informe vacío
	 * sin explicación.
	 */
	retreatLinkedMeetingCount: number;
}

/**
 * The report: how each meeting of the selected type went, and how each member
 * of the roster ranks within it.
 */
export const getAttendanceStats = async (
	communityId: string,
	filters: AttendanceStatsFilters = {},
	now: Date = new Date(),
): Promise<CommunityAttendanceStatsResult> => {
	const { considered, attendable, countsByMeeting, retreatLinkedMeetingCount } =
		await loadConsideredMeetings(communityId, filters, now);
	const allMembers = await loadRosterMembers(communityId);
	// El filtro por retiro recorta el RANKING, no el conjunto de reuniones: las
	// reuniones y su % siguen siendo los de la comunidad entera, porque el
	// denominador de una reunión es su padrón, no el equipo de un retiro.
	const members = filters.retreatId
		? await (async () => {
				const serving = new Set(
					await loadRetreatServingParticipantIds(communityId, filters.retreatId!),
				);
				return allMembers.filter((m) => serving.has(m.participantId));
			})()
		: allMembers;
	const attendedByMember = await loadAttendedByMember(considered.map((m) => m.id));
	const rates = computeMemberRates(considered, attendedByMember, members);
	const retreatsServed = await loadCommunityRetreatsServed(communityId);

	// `eligible` is the roster as it stood on the meeting date. Historical rows
	// can predate every `joinedAt`; falling back to the current roster keeps the
	// percentage meaningful instead of dividing by zero.
	const rosterMembers = allMembers.filter((m) =>
		(ROSTER_STATES as readonly string[]).includes(m.state),
	);
	const meetingRows: AttendanceStatsMeetingRow[] = considered.map((meeting) => {
		const eligible =
			rosterMembers.filter((m) => m.joinedAt <= meeting.startDate).length ||
			rosterMembers.length;
		const attended = countsByMeeting.get(meeting.id)?.attended ?? 0;
		return {
			id: meeting.id,
			title: meeting.title,
			startDate: meeting.startDate,
			meetingType: meeting.meetingType,
			attended,
			eligible,
			ratePercent: eligible > 0 ? (attended / eligible) * 100 : 0,
		};
	});

	const memberRows: AttendanceStatsMemberRow[] = members
		.map((member) => {
			const profile = resolveMemberProfile(member);
			const rate = rates.get(member.id)!;
			return {
				memberId: member.id,
				participantId: member.participantId,
				firstName: profile.firstName,
				lastName: profile.lastName,
				state: member.state,
				attended: rate.attended,
				total: rate.total,
				ratePercent: rate.ratePercent,
				frequency: rate.frequency,
				retreatsServed: retreatsServed.get(member.participantId) ?? 0,
			};
		})
		.sort((a, b) => b.ratePercent - a.ratePercent || a.lastName.localeCompare(b.lastName));

	// Average of the per-meeting percentages, i.e. "on a typical meeting this
	// share of the roster shows up". Same shape as the dashboard's
	// `averageAttendance`, so the two numbers are comparable.
	const averageRatePercent =
		meetingRows.length > 0
			? meetingRows.reduce((sum, row) => sum + row.ratePercent, 0) / meetingRows.length
			: 0;

	const communityRetreats = await AppDataSource.getRepository(Retreat).find({
		where: { communityId },
		select: ['id', 'parish', 'retreat_number_version', 'startDate'],
		order: { startDate: 'DESC' },
	});

	const typeCounts = new Map<MeetingTypeValue, number>();
	for (const meeting of attendable) {
		typeCounts.set(meeting.meetingType, (typeCounts.get(meeting.meetingType) ?? 0) + 1);
	}

	return {
		filters,
		meetings: meetingRows,
		members: memberRows,
		totals: {
			meetingCount: meetingRows.length,
			memberCount: memberRows.length,
			averageRatePercent,
		},
		availableTypes: [...typeCounts.entries()]
			.map(([meetingType, count]) => ({ meetingType, count }))
			.sort((a, b) => b.count - a.count),
		retreats: communityRetreats.map((retreat) => ({
			id: retreat.id,
			label: [retreat.parish, retreat.retreat_number_version].filter(Boolean).join(' '),
			startDate: retreat.startDate,
		})),
		retreatLinkedMeetingCount,
	};
};

export interface ServerAttendanceEntry {
	participantId: string;
	memberId: string;
	attended: number;
	total: number;
	ratePercent: number;
	frequency: ParticipationFrequency;
}

export interface RetreatServerAttendanceResult {
	communityId: string;
	retreatId: string;
	/** Reuniones que se midieron: las preparaciones sincronizadas ya celebradas. */
	meetingCount: number;
	serverCount: number;
	matchedCount: number;
	unmatchedCount: number;
	/**
	 * Preparaciones del retiro vinculadas como reunión, celebradas o no. 0 = el
	 * calendario no está sincronizado, que la UI debe decir en vez de dejar las
	 * pastillas sin badge y sin explicación.
	 */
	retreatLinkedMeetingCount: number;
	entries: ServerAttendanceEntry[];
}

/**
 * Asistencia del equipo servidor de un retiro a las preparaciones DE ESE
 * RETIRO, para decidir a quién poner de líder de mesa.
 *
 * Mide sólo las preparaciones del propio retiro (las vinculadas por
 * `retreat_preparation.communityMeetingId`), no todas las que la comunidad haya
 * tenido: la pregunta de la pantalla de mesas es "¿quién viene a preparar ESTE
 * retiro?", y una comunidad acumula preparaciones de todos los que ha servido.
 * Por eso no hay filtro de tipo ni de fechas: el conjunto ya está delimitado por
 * el calendario del retiro.
 *
 * El retiro tiene que estar vinculado a esta comunidad (`retreat.communityId`).
 * Ese vínculo —que pone alguien que administra la comunidad— es lo que autoriza
 * la proyección; pertenecer al padrón no basta, o cualquier coordinador de
 * retiro podría leer el padrón donde caigan sus participantes.
 *
 * Un servidor sin fila en `community_member`, o sin ninguna reunión que le
 * cuente, no aparece en `entries`. Devolverlo como 0% se leería como "no viene
 * nunca" cuando la verdad es "no hay dato".
 */
export const getServerAttendanceForRetreat = async (
	communityId: string,
	retreatId: string,
	now: Date = new Date(),
): Promise<RetreatServerAttendanceResult> => {
	const servingParticipantIds = await loadRetreatServingParticipantIds(communityId, retreatId);

	const { considered, retreatLinkedMeetingCount } = await loadConsideredMeetings(
		communityId,
		{ retreatId },
		now,
	);

	const memberRepo = AppDataSource.getRepository(CommunityMember);
	const members =
		servingParticipantIds.length > 0
			? await memberRepo.find({
					where: { communityId, participantId: In(servingParticipantIds) },
					relations: ['participant'],
				})
			: [];
	const activeMembers = members.filter((m) => !m.participant?.dataDeletedAt);

	const attendedByMember = await loadAttendedByMember(considered.map((m) => m.id));
	const rates = computeMemberRates(considered, attendedByMember, activeMembers);

	const entries: ServerAttendanceEntry[] = activeMembers
		.map((member) => {
			const rate = rates.get(member.id)!;
			return {
				participantId: member.participantId,
				memberId: member.id,
				attended: rate.attended,
				total: rate.total,
				ratePercent: rate.ratePercent,
				frequency: rate.frequency,
			};
		})
		// Sin reuniones que le cuenten no hay dato, y 0% se leería como "no viene
		// nunca". Es el mismo error que metía las reuniones futuras en el
		// denominador: se omite la entrada y la pastilla se queda sin badge.
		.filter((entry) => entry.total > 0);

	return {
		communityId,
		retreatId,
		meetingCount: considered.length,
		serverCount: servingParticipantIds.length,
		matchedCount: entries.length,
		unmatchedCount: Math.max(servingParticipantIds.length - entries.length, 0),
		retreatLinkedMeetingCount,
		entries,
	};
};
