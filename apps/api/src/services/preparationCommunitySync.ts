import { In, IsNull, Not } from 'typeorm';
import { AppDataSource } from '../data-source';
import { Community } from '../entities/community.entity';
import { CommunityAttendance } from '../entities/communityAttendance.entity';
import { CommunityMeeting } from '../entities/communityMeeting.entity';
import { CommunityMember } from '../entities/communityMember.entity';
import { Retreat } from '../entities/retreat.entity';
import { RetreatPreparation } from '../entities/retreatPreparation.entity';
import { makeDateInTimezone } from '../utils/date.transformer';
import { ROSTER_STATES } from './communityAttendanceStats';

/**
 * Puente entre el calendario de preparaciones del retiro y las reuniones de la
 * comunidad.
 *
 * El calendario (`retreat_preparation`) tiene las semanas y sus documentos pero
 * no pasa lista; `community_meeting` pasa lista pero no sabía del retiro. Con el
 * retiro vinculado a una comunidad, cada sesión se materializa como reunión de
 * tipo `preparation` y el `communityMeetingId` recuerda cuál.
 *
 * Los repositorios se resuelven por llamada, no en campos: el harness de Jest
 * reemplaza `AppDataSource` después del import.
 */

export class PreparationSyncError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'PreparationSyncError';
	}
}

const DEFAULT_DURATION_MINUTES = 90;
/** Hora por defecto cuando la sesión no la trae (el calendario la deja opcional). */
const DEFAULT_TIME = '20:00';

const timezoneOf = (community: { timezone?: string | null } | null): string =>
	community?.timezone || 'America/Mexico_City';

/** Instante UTC de una sesión, leyendo su fecha y hora como locales de la comunidad. */
const instantFor = (date: string, time: string | null | undefined, tz: string): Date => {
	const [y, m, d] = date.split('-').map(Number);
	const [hh, mm] = (time || DEFAULT_TIME).split(':').map(Number);
	return makeDateInTimezone(y, m - 1, d, hh, mm, tz);
};

/** Día calendario 'YYYY-MM-DD' de un instante, en la timezone dada. */
const calendarDayIn = (instant: Date, tz: string): string =>
	new Intl.DateTimeFormat('en-CA', {
		timeZone: tz,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
	}).format(instant);

/** Etiqueta del retiro para que la reunión se reconozca en el listado de la comunidad. */
const retreatLabel = (retreat: Retreat): string =>
	retreat.retreat_number_version?.trim() || retreat.parish;

export interface PreparationSyncResult {
	retreatId: string;
	communityId: string;
	created: number;
	/** Reuniones que ya existían ese día y se vincularon en vez de duplicarse. */
	adopted: number;
	/**
	 * Sesiones ya vinculadas cuya reunión está otro día del que dice el
	 * calendario. NO se corrigen solas: mover una reunión con asistencia ya
	 * capturada la falsea. Se reportan para que el coordinador decida.
	 */
	mismatched: { preparationId: string; meetingId: string; calendarDay: string; meetingDay: string }[];
	/** Sesiones sin fecha y descansos: no son reuniones. */
	skipped: number;
	meetingIds: string[];
}

/**
 * Materializa (o reengancha) las sesiones del calendario como reuniones de la
 * comunidad. Idempotente: correrla dos veces no duplica nada.
 *
 * **Adopta** una reunión de tipo `preparation` que ya exista el mismo día
 * calendario en vez de crear otra. Sin eso, un coordinador que ya venía creando
 * sus "Preparacion Retiro" a mano se encontraría la serie duplicada y la
 * asistencia ya capturada colgando de las reuniones viejas. La hora del
 * calendario NO sobreescribe la de una reunión adoptada: si se capturó
 * asistencia a las 19:45, mover la reunión a las 20:00 no aporta nada y sí
 * confunde.
 */
/**
 * Contexto compartido por la sincronización completa y la de una sola sesión.
 * Se arma una vez para no repetir las cuatro consultas por cada semana.
 */
interface SyncContext {
	retreat: Retreat;
	community: Community;
	tz: string;
	existing: CommunityMeeting[];
	/** Reunión de preparación adoptable por día calendario. */
	adoptable: Map<string, CommunityMeeting>;
	alreadyLinked: Set<string>;
	label: string;
	durationMinutes: number;
	preparations: RetreatPreparation[];
}

const buildSyncContext = async (retreatId: string): Promise<SyncContext> => {
	const retreat = await AppDataSource.getRepository(Retreat).findOne({ where: { id: retreatId } });
	if (!retreat) throw new PreparationSyncError('El retiro no existe');
	if (!retreat.communityId) {
		throw new PreparationSyncError(
			'Vincula el retiro a una comunidad antes de sincronizar las preparaciones',
		);
	}
	const community = await AppDataSource.getRepository(Community).findOne({
		where: { id: retreat.communityId },
	});
	if (!community) {
		throw new PreparationSyncError('La comunidad vinculada al retiro ya no existe');
	}
	const tz = timezoneOf(community);
	const preparations = await AppDataSource.getRepository(RetreatPreparation).find({
		where: { retreatId },
	});

	// Reuniones de preparación que ya tiene la comunidad, indexadas por día.
	// Sólo se excluyen las canceladas: una cancelada no representa nada.
	//
	// Las instancias de una serie recurrente SÍ se adoptan. Excluirlas por
	// llevar `isRecurrenceTemplate` no funciona: en los datos reales la bandera
	// está puesta también en las instancias, así que el guard dejaba fuera la
	// serie entera y la sincronización duplicaba las reuniones que el coordinador
	// ya tenía —con su asistencia ya capturada—.
	const existing = await AppDataSource.getRepository(CommunityMeeting).find({
		where: { communityId: community.id, meetingType: 'preparation' },
	});
	const adoptable = new Map<string, CommunityMeeting>();
	for (const meeting of existing) {
		if (meeting.exceptionType === 'cancelled') continue;
		const day = calendarDayIn(meeting.startDate, tz);
		const current = adoptable.get(day);
		// Con varias el mismo día gana la instancia materializada sobre la
		// plantilla raíz: es la que lleva la asistencia de ESE día.
		if (!current || (current.parentMeetingId === null && meeting.parentMeetingId !== null)) {
			adoptable.set(day, meeting);
		}
	}

	return {
		retreat,
		community,
		tz,
		existing,
		adoptable,
		alreadyLinked: new Set(
			preparations.map((p) => p.communityMeetingId).filter((id): id is string => Boolean(id)),
		),
		label: retreatLabel(retreat),
		durationMinutes: community.defaultMeetingDurationMinutes || DEFAULT_DURATION_MINUTES,
		preparations,
	};
};

type SessionOutcome =
	| { kind: 'linked'; meetingId: string }
	| { kind: 'adopted'; meetingId: string }
	| { kind: 'created'; meetingId: string }
	| { kind: 'mismatched'; meetingId: string; calendarDay: string; meetingDay: string };

/**
 * Materializa (o reengancha) UNA sesión. Es el corazón compartido por el botón
 * de sincronizar todo y el de crear la reunión de una semana concreta.
 */
const syncSession = async (
	ctx: SyncContext,
	session: RetreatPreparation,
): Promise<SessionOutcome> => {
	const prepRepo = AppDataSource.getRepository(RetreatPreparation);
	const meetingRepo = AppDataSource.getRepository(CommunityMeeting);
	const startDate = instantFor(session.date!, session.time, ctx.tz);
	const calendarDay = calendarDayIn(startDate, ctx.tz);

	// 1. Ya vinculada y la reunión sigue viva: no se toca.
	//
	// Ni el título ni la fecha se sobreescriben. El título puede ser el que el
	// coordinador eligió a mano ("Preparacion Retiro"), y renombrarlo desde aquí
	// sería pisarle su decisión sin avisar. La fecha es peor: mover una reunión
	// que ya tiene asistencia capturada falsea el registro — el mismo motivo por
	// el que `pickPropagableFields` deja `startDate` fuera de la propagación por
	// scope. Si el calendario se movió, se reporta y decide el coordinador.
	if (session.communityMeetingId) {
		const linked = ctx.existing.find((m) => m.id === session.communityMeetingId);
		if (linked) {
			const meetingDay = calendarDayIn(linked.startDate, ctx.tz);
			return meetingDay === calendarDay
				? { kind: 'linked', meetingId: linked.id }
				: { kind: 'mismatched', meetingId: linked.id, calendarDay, meetingDay };
		}
		// El id quedó colgado (la reunión se borró desde comunidad): se recrea.
	}

	// 2. Sin vincular: adoptar la reunión de preparación que ya exista ese día.
	const candidate = ctx.adoptable.get(calendarDay);
	if (candidate && !ctx.alreadyLinked.has(candidate.id)) {
		await prepRepo.update(session.id, { communityMeetingId: candidate.id });
		ctx.alreadyLinked.add(candidate.id);
		return { kind: 'adopted', meetingId: candidate.id };
	}

	// 3. No hay nada ese día: crear la reunión.
	const saved = await meetingRepo.save(
		meetingRepo.create({
			communityId: ctx.community.id,
			title: `${session.title} — ${ctx.label}`,
			description: `Preparación del equipo servidor · ${ctx.retreat.parish}`,
			startDate,
			durationMinutes: ctx.durationMinutes,
			isAnnouncement: false,
			meetingType: 'preparation',
		}),
	);
	await prepRepo.update(session.id, { communityMeetingId: saved.id });
	ctx.alreadyLinked.add(saved.id);
	ctx.existing.push(saved);
	return { kind: 'created', meetingId: saved.id };
};

/** Sesiones del calendario que pueden ser una reunión (con fecha, no descansos). */
const syncableSessions = (preparations: RetreatPreparation[]): RetreatPreparation[] =>
	preparations.filter((p) => p.type === 'session' && p.date);

/**
 * Materializa (o reengancha) todas las sesiones del calendario como reuniones de
 * la comunidad. Idempotente: correrla dos veces no duplica nada.
 *
 * **Adopta** una reunión de tipo `preparation` que ya exista el mismo día
 * calendario en vez de crear otra. Sin eso, un coordinador que ya venía creando
 * sus "Preparacion Retiro" a mano se encontraría la serie duplicada y la
 * asistencia ya capturada colgando de las reuniones viejas.
 */
export const syncPreparationsToCommunityMeetings = async (
	retreatId: string,
): Promise<PreparationSyncResult> => {
	const ctx = await buildSyncContext(retreatId);
	const sessions = syncableSessions(ctx.preparations);

	const result: PreparationSyncResult = {
		retreatId,
		communityId: ctx.community.id,
		created: 0,
		adopted: 0,
		mismatched: [],
		skipped: ctx.preparations.length - sessions.length,
		meetingIds: [],
	};

	for (const session of sessions) {
		const outcome = await syncSession(ctx, session);
		result.meetingIds.push(outcome.meetingId);
		if (outcome.kind === 'created') result.created += 1;
		else if (outcome.kind === 'adopted') result.adopted += 1;
		else if (outcome.kind === 'mismatched') {
			result.mismatched.push({
				preparationId: session.id,
				meetingId: outcome.meetingId,
				calendarDay: outcome.calendarDay,
				meetingDay: outcome.meetingDay,
			});
		}
	}

	return result;
};

export interface SinglePreparationSyncResult {
	preparationId: string;
	meetingId: string;
	/** `created` = se creó nueva; `adopted` = se enganchó una que ya existía ese día. */
	outcome: SessionOutcome['kind'];
}

/**
 * Crea (o engancha) la reunión de UNA preparación. Es lo que dispara el botón de
 * la fila: cuando el coordinador añade una semana suelta al calendario, sólo le
 * falta esa, y sincronizar todo para una sola es ruido.
 *
 * Un descanso o una sesión sin fecha no puede ser una reunión → error explícito.
 */
export const syncSinglePreparationToCommunity = async (
	preparationId: string,
): Promise<SinglePreparationSyncResult> => {
	const session = await AppDataSource.getRepository(RetreatPreparation).findOne({
		where: { id: preparationId },
	});
	if (!session) throw new PreparationSyncError('La preparación no existe');
	if (session.type !== 'session' || !session.date) {
		throw new PreparationSyncError(
			'Sólo las preparaciones con fecha pueden convertirse en reunión (un festivo no lo es)',
		);
	}
	const ctx = await buildSyncContext(session.retreatId);
	const outcome = await syncSession(ctx, session);
	return { preparationId, meetingId: outcome.meetingId, outcome: outcome.kind };
};

export interface PreparationAttendance {
	meetingId: string;
	attended: number;
	eligible: number;
	ratePercent: number;
	/**
	 * La reunión aún no ocurrió y nadie pasó lista: la UI debe mostrar "pendiente",
	 * NUNCA 0 %. "Sin dato" no es "no vino".
	 */
	pending: boolean;
}

/**
 * Asistencia capturada en las reuniones vinculadas a las preparaciones de un
 * retiro, por id de preparación. Devuelve un mapa vacío si el retiro no está
 * vinculado o si ninguna sesión está sincronizada — el caso normal.
 *
 * `eligible` es el roster canónico de la comunidad a la fecha de la reunión, la
 * misma regla que el reporte de asistencia, para que los dos porcentajes
 * coincidan.
 */
export const loadPreparationAttendance = async (
	retreatId: string,
	now: Date = new Date(),
): Promise<Map<string, PreparationAttendance>> => {
	const byPreparation = new Map<string, PreparationAttendance>();

	const prepRepo = AppDataSource.getRepository(RetreatPreparation);
	const linked = await prepRepo.find({
		where: { retreatId, communityMeetingId: Not(IsNull()) },
		select: ['id', 'communityMeetingId'],
	});
	if (linked.length === 0) return byPreparation;

	const meetingIds = linked.map((p) => p.communityMeetingId!);
	const meetingRepo = AppDataSource.getRepository(CommunityMeeting);
	const meetings = await meetingRepo.find({ where: { id: In(meetingIds) } });
	if (meetings.length === 0) return byPreparation;

	const communityId = meetings[0].communityId;
	const memberRepo = AppDataSource.getRepository(CommunityMember);
	const roster = await memberRepo.find({
		where: { communityId, state: In([...ROSTER_STATES]) },
		relations: ['participant'],
	});
	const rosterMembers = roster.filter((m) => !m.participant?.dataDeletedAt);

	const attendanceRepo = AppDataSource.getRepository(CommunityAttendance);
	const records = await attendanceRepo.find({
		where: { meetingId: In(meetings.map((m) => m.id)) },
		select: ['meetingId', 'attended'],
	});
	const attendedByMeeting = new Map<string, number>();
	const recordedByMeeting = new Map<string, number>();
	for (const record of records) {
		recordedByMeeting.set(record.meetingId, (recordedByMeeting.get(record.meetingId) ?? 0) + 1);
		if (record.attended) {
			attendedByMeeting.set(record.meetingId, (attendedByMeeting.get(record.meetingId) ?? 0) + 1);
		}
	}

	for (const preparation of linked) {
		const meeting = meetings.find((m) => m.id === preparation.communityMeetingId);
		if (!meeting) continue; // id colgado: se trata como no sincronizada
		const eligible =
			rosterMembers.filter((m) => m.joinedAt <= meeting.startDate).length || rosterMembers.length;
		const attended = attendedByMeeting.get(meeting.id) ?? 0;
		// Misma regla que el reporte: cuenta como celebrada si ya pasó o si ya se
		// capturó algún registro (a veces se pasa lista minutos antes de empezar).
		const pending = meeting.startDate > now && (recordedByMeeting.get(meeting.id) ?? 0) === 0;
		byPreparation.set(preparation.id, {
			meetingId: meeting.id,
			attended,
			eligible,
			ratePercent: eligible > 0 ? (attended / eligible) * 100 : 0,
			pending,
		});
	}

	return byPreparation;
};
