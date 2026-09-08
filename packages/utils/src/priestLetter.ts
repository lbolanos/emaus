/**
 * Request letter to the parish priest, ready to print.
 *
 * Reproduces the letter the coordination team used to write by hand in Word for
 * every retreat: a hall for the follow-up meetings, the Sunday announcements,
 * and the acts the priest has to attend (sending mass, sacraments talk,
 * confessions, night mass and closing mass).
 *
 * Same contract as `buildPreparationsTableMarkdown`: a pure helper the caller
 * feeds with ALREADY RESOLVED rows — dates as `YYYY-MM-DD`, times as `HH:MM`
 * wall clock in the retreat's timezone. Nothing here touches `Intl`, `new
 * Date()` without arguments or the DTO shapes, so the whole letter is testable
 * without a browser.
 *
 * And, unlike the message scopes, there is NO fallback to mock data: an invented
 * date in a letter handed to a parish priest is worse than a visible
 * "(por confirmar)".
 *
 * The letter body is in Spanish because it IS the document the user delivers —
 * the one exception to the "Spanish only in the UI layer" rule of this repo.
 *
 * This module must NOT import from `./index`: that file re-exports this one and
 * the cycle would break the build.
 */

export const PRIEST_LETTER_TITLE = 'Solicitud de Apoyo al Párroco';

/** Shown wherever the system has no data. Italic so it stands out on paper. */
export const PRIEST_LETTER_PENDING = '_(por confirmar)_';

/** Weeks before the retreat when the parish announcements start. */
export const ANNOUNCEMENT_LEAD_WEEKS = 5;

/** How long a follow-up meeting lasts, to state the end time in the letter. */
export const MEETING_DURATION_HOURS = 2;

/** Canonical responsability that marks the acts needing a priest. */
export const PRIEST_RESPONSABILITY_NAME = 'Sacerdotes';

/** Canonical responsability of the sacraments talk (a priest gives it). */
export const SACRAMENTS_TALK_RESPONSABILITY_NAME =
	'Charla: Conociendo a Dios a través de los Sacramentos';

// Declared locally on purpose: the `MONTH_NAMES_ES` of `./index` is private to
// that module, and importing from `./index` would create a cycle.
const MONTH_NAMES_ES = [
	'enero',
	'febrero',
	'marzo',
	'abril',
	'mayo',
	'junio',
	'julio',
	'agosto',
	'septiembre',
	'octubre',
	'noviembre',
	'diciembre',
] as const;

const WEEKDAY_NAMES_ES = [
	'domingo',
	'lunes',
	'martes',
	'miércoles',
	'jueves',
	'viernes',
	'sábado',
] as const;

/** Plural form used to describe a recurring meeting ("los martes"). */
const WEEKDAY_PLURAL_ES = [
	'los domingos',
	'los lunes',
	'los martes',
	'los miércoles',
	'los jueves',
	'los viernes',
	'los sábados',
] as const;

const RETREAT_TYPE_LABELS_ES: Record<string, string> = {
	men: 'Hombres',
	women: 'Mujeres',
	couples: 'Matrimonios',
	effeta: 'Effetá',
};

/** The role a Minute-by-Minute item plays in the letter. */
export type PriestLetterItemRole =
	| 'sendingMass'
	| 'sacramentsTalk'
	| 'confessions'
	| 'nightMass'
	| 'closingMass';

/**
 * A Minute-by-Minute item already normalised to the retreat's wall clock.
 *
 * `date`/`time` come from the item's own instant, NOT from
 * `startDate + (day - 1)`: materialisation applies `h < 6 ? day : day - 1`, so
 * an after-midnight activity falls on the next calendar day and only the
 * instant knows it.
 */
export interface PriestLetterScheduleSource {
	name: string;
	/** `misa` | `charla` | `oracion` | `logistica` | `dinamica` | … */
	type: string;
	day: number;
	/** Responsability name, already resolved by the caller. */
	responsabilityName?: string | null;
	/** `YYYY-MM-DD` in the retreat's timezone. */
	date: string;
	/** `HH:MM` (24h) in the retreat's timezone. */
	time: string;
	location?: string | null;
}

/** One act of the letter, once classified. */
export interface PriestLetterScheduleItem {
	role: PriestLetterItemRole;
	date: string;
	time: string;
	location?: string | null;
}

/** Minimal mirror of `retreat_preparation`, compatible with `PreparationEntryData`. */
export interface PriestLetterPreparationEntry {
	type: 'session' | 'break';
	date?: string | null;
	time?: string | null;
}

export interface PriestLetterMeetingCadence {
	/** 0 = Sunday … 6 = Saturday. */
	weekday: number;
	/** `HH:MM`, or null when the calendar has no time set. */
	time: string | null;
	/** 7 = weekly, 14 = every fortnight. */
	intervalDays: number;
	sessionCount: number;
}

export interface PriestLetterData {
	/** Retreat name — `retreat.parish`, the only name a retreat has. */
	retreatName: string;
	/** `YYYY-MM-DD`. */
	startDate: string;
	/** `YYYY-MM-DD`. */
	endDate: string;
	/** `men` | `women` | `couples` | `effeta`. */
	retreatType?: string | null;
	retreatNumber?: string | null;
	/** Parish church where the masses happen — `retreat.closingChurchName`. */
	parishChurchName?: string | null;
	/** Retreat house, where the talk and the confessions happen. */
	houseName?: string | null;
	meetings?: PriestLetterMeetingCadence | null;
	scheduleItems: PriestLetterScheduleItem[];
}

// --------------------------------------------------------------------------
// Date-only arithmetic, pure UTC (model: `computeDueDate` in @repo/types)
// --------------------------------------------------------------------------

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

function ymdToUtcMillis(ymd: string): number | null {
	if (!YMD_RE.test(ymd)) return null;
	const [y, m, d] = ymd.split('-').map(Number);
	const ms = Date.UTC(y, m - 1, d);
	return Number.isNaN(ms) ? null : ms;
}

/** Adds (or subtracts) calendar days to a `YYYY-MM-DD`, never shifting a day. */
export function addDaysYmdUtc(ymd: string, days: number): string | null {
	const ms = ymdToUtcMillis(ymd);
	if (ms === null) return null;
	return new Date(ms + days * 86_400_000).toISOString().slice(0, 10);
}

/** Day of the week of a `YYYY-MM-DD` (0 = Sunday), read in UTC. */
export function weekdayOfYmd(ymd: string): number | null {
	const ms = ymdToUtcMillis(ymd);
	if (ms === null) return null;
	return new Date(ms).getUTCDay();
}

/** The Sunday on or before `ymd`. */
export function previousSundayYmd(ymd: string): string | null {
	const weekday = weekdayOfYmd(ymd);
	if (weekday === null) return null;
	return weekday === 0 ? ymd : addDaysYmdUtc(ymd, -weekday);
}

/**
 * Sunday the parish announcements start on: the Sunday on or before
 * `ANNOUNCEMENT_LEAD_WEEKS` weeks prior to the retreat.
 */
export function announcementStartDate(startDate: string): string | null {
	const lead = addDaysYmdUtc(startDate, -ANNOUNCEMENT_LEAD_WEEKS * 7);
	return lead === null ? null : previousSundayYmd(lead);
}

/** Adds whole hours to a `HH:MM`, wrapping around midnight. */
export function addHoursToTime(hhmm: string, hours: number): string | null {
	const match = /^(\d{1,2}):(\d{2})$/.exec((hhmm ?? '').trim());
	if (!match) return null;
	const h = Number(match[1]);
	const m = Number(match[2]);
	if (h > 23 || m > 59) return null;
	const total = (((h + hours) % 24) + 24) % 24;
	return `${String(total).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// --------------------------------------------------------------------------
// Spanish prose formatting
// --------------------------------------------------------------------------

function ymdParts(ymd: string): { year: number; month: number; day: number } | null {
	if (!YMD_RE.test(ymd)) return null;
	const [year, month, day] = ymd.split('-').map(Number);
	return { year, month, day };
}

/**
 * A date as the letter reads it: `viernes 5 de junio`.
 *
 * Built from a month table instead of `toLocaleDateString` on purpose: the
 * locale output depends on the runtime's ICU, which would make the tests
 * fragile, and reading the parts of the string keeps it immune to timezones.
 */
export function formatLetterDateEs(ymd: string): string {
	const parts = ymdParts(ymd);
	const weekday = weekdayOfYmd(ymd);
	if (!parts || weekday === null) return PRIEST_LETTER_PENDING;
	return `${WEEKDAY_NAMES_ES[weekday]} ${parts.day} de ${MONTH_NAMES_ES[parts.month - 1]}`;
}

/** The retreat dates as prose: `del 5 al 7 de junio`. */
export function formatRetreatDateRangeEs(startDate: string, endDate: string): string {
	const from = ymdParts(startDate);
	const to = ymdParts(endDate);
	if (!from || !to) return PRIEST_LETTER_PENDING;

	const fromMonth = MONTH_NAMES_ES[from.month - 1];
	const toMonth = MONTH_NAMES_ES[to.month - 1];

	if (from.year !== to.year) {
		return `del ${from.day} de ${fromMonth} de ${from.year} al ${to.day} de ${toMonth} de ${to.year}`;
	}
	if (from.month !== to.month) {
		return `del ${from.day} de ${fromMonth} al ${to.day} de ${toMonth}`;
	}
	return `del ${from.day} al ${to.day} de ${fromMonth}`;
}

/** `men` → `Hombres`. Mirrors `retreatModal.types` of the web locales. */
export function retreatTypeLabelEs(type?: string | null): string {
	if (!type) return RETREAT_TYPE_LABELS_ES.men;
	return RETREAT_TYPE_LABELS_ES[type] ?? RETREAT_TYPE_LABELS_ES.men;
}

/** `los martes de cada 15 días`. */
export function describeMeetingCadenceEs(meetings?: PriestLetterMeetingCadence | null): string {
	if (!meetings) return PRIEST_LETTER_PENDING;
	const weekday = WEEKDAY_PLURAL_ES[meetings.weekday] ?? PRIEST_LETTER_PENDING;
	if (meetings.intervalDays === 7) return `${weekday} de cada semana`;
	if (meetings.intervalDays === 14) return `${weekday} de cada 15 días`;
	return `${weekday} de cada ${meetings.intervalDays} días`;
}

// --------------------------------------------------------------------------
// Derivations
// --------------------------------------------------------------------------

/** Accent-insensitive, case-insensitive key for matching Spanish names. */
function normalizeLetterKey(value: string | null | undefined): string {
	return (value ?? '')
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLowerCase()
		.replace(/\s+/g, ' ')
		.trim();
}

/**
 * Weekday, time and cadence of the follow-up meetings.
 *
 * The calendar is generated evenly, but the coordinator can move dates and
 * insert holidays (`type: 'break'`), so the cadence is the MODE of the gaps
 * between consecutive sessions, not the first gap.
 */
export function derivePriestLetterMeetings(
	entries: PriestLetterPreparationEntry[],
): PriestLetterMeetingCadence | null {
	const sessions = (entries ?? [])
		.filter((entry) => entry.type === 'session' && !!entry.date)
		.map((entry) => ({ date: entry.date as string, time: entry.time ?? null }))
		.sort((a, b) => a.date.localeCompare(b.date));

	if (sessions.length === 0) return null;

	const weekday = weekdayOfYmd(sessions[0].date);
	if (weekday === null) return null;

	const time = sessions.find((session) => !!session.time)?.time ?? null;

	const gapCounts = new Map<number, number>();
	for (let i = 1; i < sessions.length; i += 1) {
		const from = ymdToUtcMillis(sessions[i - 1].date);
		const to = ymdToUtcMillis(sessions[i].date);
		if (from === null || to === null) continue;
		const gap = Math.round((to - from) / 86_400_000);
		if (gap <= 0) continue;
		gapCounts.set(gap, (gapCounts.get(gap) ?? 0) + 1);
	}

	// A single session tells nothing about cadence; weekly is the sane default.
	let intervalDays = 7;
	let best = 0;
	for (const [gap, count] of gapCounts) {
		if (count > best) {
			best = count;
			intervalDays = gap;
		}
	}

	return { weekday, time, intervalDays, sessionCount: sessions.length };
}

/**
 * Keeps only the acts a priest must be present for, and labels each with its
 * role in the letter.
 *
 * The discriminator is the RESPONSABILITY, not the name: the Minute-by-Minute
 * templates already tag every one of these items with `Sacerdotes` (or with the
 * sacraments-talk responsability). Items that merely involve a priest without
 * him having to come to anything — `logistica` ("Recepción de sacerdotes"),
 * `dinamica` ("Imposición de Ceniza") and the blessing of the meals — fall out
 * of the type filter.
 */
export function selectPriestScheduleItems(
	source: PriestLetterScheduleSource[],
): PriestLetterScheduleItem[] {
	const items = source ?? [];
	if (items.length === 0) return [];

	// The last day is taken from the WHOLE agenda: if the closing day happened to
	// have no priest item, using the max of the filtered ones would promote an
	// intermediate mass to closing mass.
	const lastDay = items.reduce((max, item) => Math.max(max, item.day), 0);

	const priestKey = normalizeLetterKey(PRIEST_RESPONSABILITY_NAME);
	const talkKey = normalizeLetterKey(SACRAMENTS_TALK_RESPONSABILITY_NAME);

	const byRole = new Map<PriestLetterItemRole, PriestLetterScheduleSource>();

	const claim = (role: PriestLetterItemRole, item: PriestLetterScheduleSource) => {
		const current = byRole.get(role);
		if (!current) {
			byRole.set(role, item);
			return;
		}
		// Two masses on the closing day: the later one is the closing mass. For
		// every other role the first occurrence wins.
		if (role !== 'closingMass') return;
		// Numérico y no por cadena: `'9T…' > '10T…'` en orden lexicográfico, así
		// que un retiro de dos dígitos de días elegiría la misa equivocada.
		if (item.day !== current.day) {
			if (item.day > current.day) byRole.set(role, item);
			return;
		}
		if (item.time > current.time) byRole.set(role, item);
	};

	for (const item of items) {
		const nameKey = normalizeLetterKey(item.name);
		const responsabilityKey = normalizeLetterKey(item.responsabilityName);
		const type = normalizeLetterKey(item.type);

		// The sacraments talk carries its own responsability, and `Testimonio 6 —
		// Los Sacramentos` shares it: the `charla` type is what tells them apart.
		if (type === 'charla' && (nameKey.includes('sacramentos') || responsabilityKey === talkKey)) {
			claim('sacramentsTalk', item);
			continue;
		}

		if (responsabilityKey !== priestKey) continue;

		// Not conditioned on `type`: confessions are seeded as `oracion`, but the
		// letter must still find them if someone re-types them.
		if (nameKey.includes('confesion')) {
			claim('confessions', item);
			continue;
		}

		if (type !== 'misa') continue;
		if (item.day <= 1) claim('sendingMass', item);
		else if (item.day >= lastDay) claim('closingMass', item);
		else claim('nightMass', item);
	}

	const order: PriestLetterItemRole[] = [
		'sendingMass',
		'sacramentsTalk',
		'confessions',
		'nightMass',
		'closingMass',
	];

	return order
		.filter((role) => byRole.has(role))
		.map((role) => {
			const item = byRole.get(role) as PriestLetterScheduleSource;
			return { role, date: item.date, time: item.time, location: item.location ?? null };
		});
}

/** Someone the letter could be addressed to. */
const PRIEST_WHO = ['parroco', 'sacerdote'];

/**
 * What the letter is FOR. Mentioning a priest is not enough: the seeded
 * checklist has half a dozen tasks that name one (inviting confessors, their
 * transport, their supper, the parish's backing) and none of them is this one.
 */
const PRIEST_WHAT = ['calendario', 'carta', 'necesita'];

/**
 * Is this checklist task the one that sends the letter to the parish priest?
 *
 * Matched by normalised name — the project already treats the task name as the
 * template's stable key (`addMissingTemplateItems` deduplicates by
 * `(normalised parent name, normalised name)`) — and, as a safety net, by the
 * description too, which survives a rename of the task.
 *
 * Both halves are required, and that is the whole point: the canonical task
 * "Preparar con el párroco qué se necesita de él (calendario)" has them, while
 * "Tener Parroquia / apoyo del Párroco" or "Invitar sacerdotes a confesar" only
 * have the first and must NOT offer the letter.
 *
 * If the coordinator renames the task so that one half is gone AND clears the
 * description, the menu item disappears from that row. The way back is
 * re-importing the template with "Solo agregar faltantes", which recreates the
 * canonical task.
 */
export function isPriestLetterTask(task: {
	name?: string | null;
	description?: string | null;
}): boolean {
	const haystack = normalizeLetterKey([task?.name, task?.description].filter(Boolean).join(' '));
	if (!haystack) return false;
	return (
		PRIEST_WHO.some((word) => haystack.includes(word)) &&
		PRIEST_WHAT.some((word) => haystack.includes(word))
	);
}

// --------------------------------------------------------------------------
// The letter
// --------------------------------------------------------------------------

/**
 * Numbered points are written as `1.-`, not `1.`, on purpose: `marked` only
 * opens an ordered list on `\d+[.)]` followed by a space, so `1.-` survives as
 * plain text and nothing gets renumbered. The blank line between points is what
 * keeps them as separate paragraphs.
 */
function point(index: number, text: string): string {
	return `${index}.- ${text}`;
}

function itemOf(
	items: PriestLetterScheduleItem[],
	role: PriestLetterItemRole,
): PriestLetterScheduleItem | undefined {
	return items.find((item) => item.role === role);
}

/**
 * Quita la puntuación final de un lugar antes de concatenarlo con la frase.
 * Los nombres de casa del Minuto a Minuto vienen con punto ("San José Del
 * Carmen."), y sin esto el papel sale con ".." a la vista.
 */
function placeText(value: string): string {
	return value.replace(/[.,;:\s]+$/, '');
}

/**
 * "a la Parroquia de San Agustín" pero "a San Agustín": el artículo solo cabe
 * cuando el nombre empieza por un sustantivo que lo admita. Sin esto sale
 * "pasaríamos por ellos a la San Agustín".
 */
function withArticle(place: string): string {
	const bare = placeText(place);
	return /^(parroquia|iglesia|catedral|capilla|casa)\b/i.test(bare) ? `la ${bare}` : bare;
}

function whenOf(item: PriestLetterScheduleItem | undefined): { date: string; time: string } {
	return {
		date: item ? formatLetterDateEs(item.date) : PRIEST_LETTER_PENDING,
		time: item?.time ? item.time : PRIEST_LETTER_PENDING,
	};
}

/**
 * Markdown of the letter, fully resolved.
 *
 * A missing role never removes its point: the letter must keep ASKING for the
 * thing even when the Minute-by-Minute is not materialised yet — it just says
 * "(por confirmar)" where the date or time would go.
 */
export function buildPriestLetterMarkdown(data: PriestLetterData): string {
	const items = data.scheduleItems ?? [];
	const parishChurch = data.parishChurchName?.trim() || PRIEST_LETTER_PENDING;
	const house = data.houseName?.trim() || PRIEST_LETTER_PENDING;

	/** Talk and confessions happen at the retreat house; masses, at the parish. */
	const atHouse = (item?: PriestLetterScheduleItem) => placeText(item?.location?.trim() || house);
	const atParish = (item?: PriestLetterScheduleItem) => placeText(item?.location?.trim() || parishChurch);

	const retreatTitle = [data.retreatName?.trim(), data.retreatNumber?.trim()]
		.filter(Boolean)
		.join(' ');
	const dateRange = formatRetreatDateRangeEs(data.startDate, data.endDate);

	const meetingStart = data.meetings?.time || null;
	const meetingEnd = meetingStart ? addHoursToTime(meetingStart, MEETING_DURATION_HOURS) : null;
	const announcementSunday = announcementStartDate(data.startDate);

	const sending = itemOf(items, 'sendingMass');
	const talk = itemOf(items, 'sacramentsTalk');
	const confessions = itemOf(items, 'confessions');
	const nightMass = itemOf(items, 'nightMass');
	const closing = itemOf(items, 'closingMass');

	const sendingWhen = whenOf(sending);
	const talkWhen = whenOf(talk);
	const confessionsWhen = whenOf(confessions);
	const closingWhen = whenOf(closing);

	const nightMassSuffix = nightMass?.time ? ` (a las ${nightMass.time} hrs.)` : '';

	// El logo NO va aquí: es cromo del documento y lo pinta la hoja A4 en su
	// encabezado (`logoUrl` de `buildPrintableHtml`). Emitirlo también en el
	// markdown lo duplicaba en el papel — el del cuerpo cae bajo la regla global
	// `img { max-height: 105mm }` y se comía media hoja — y además dejaba al
	// coordinador borrar la marca al editar el texto.
	const blocks: string[] = [];

	blocks.push(
		`Por medio de este escrito, hacemos una amable solicitud para su apoyo en nuestro próximo retiro de **${
			retreatTitle || PRIEST_LETTER_PENDING
		}**, con fechas ${dateRange}.`,
	);

	blocks.push('## Peticiones previas al retiro');

	blocks.push(
		point(
			1,
			`Salón para llevar a cabo las reuniones de seguimiento ${describeMeetingCadenceEs(
				data.meetings,
			)}, después de la Santa Misa de las ${
				meetingStart ?? PRIEST_LETTER_PENDING
			} horas. (${placeText(parishChurch)}) La reunión terminaría a las ${
				meetingEnd ?? PRIEST_LETTER_PENDING
			} horas.`,
		),
	);

	blocks.push(
		point(
			2,
			`Dar los avisos de los retiros, en todas las misas dominicales como parte de los avisos parroquiales. Los avisos arrancarían el ${
				announcementSunday ? formatLetterDateEs(announcementSunday) : PRIEST_LETTER_PENDING
			}. (${ANNOUNCEMENT_LEAD_WEEKS} semanas antes del retiro) Nosotros apoyaríamos a la salida, entregando la información y si es posible, daríamos el aviso también.`,
		),
	);

	blocks.push('## Peticiones durante el retiro');

	blocks.push(
		point(
			1,
			`Misa de Arranque del retiro y envío de los servidores, ${sendingWhen.date}. Asistiremos a la Santa Misa de las ${sendingWhen.time} en ${atParish(sending)}.`,
		),
	);

	blocks.push(
		point(
			2,
			`Charla de los Sacramentos ${talkWhen.date}, a las ${talkWhen.time} hrs. ${atHouse(
				talk,
			)}. Esta charla la da un Sacerdote.`,
		),
	);

	blocks.push(
		point(
			3,
			`Confesiones, ${confessionsWhen.date}, a las ${confessionsWhen.time} hrs. ${atHouse(
				confessions,
			)}. (Entre 3 y 4 Sacerdotes) Nosotros pasaríamos por ellos a ${withArticle(parishChurch)} y los llevaríamos de regreso, al terminar las confesiones. Misa al terminar las confesiones${nightMassSuffix}.`,
		),
	);

	blocks.push(
		point(
			4,
			`Misa de Salida ${closingWhen.date}. ${atParish(closing)} a las ${
				closingWhen.time
			} horas. (Nosotros separaríamos las primeras 3 bancas de cada lado, para los asistentes al retiro).`,
		),
	);

	blocks.push('Gracias por su apoyo, este retiro no sería posible sin usted…');
	blocks.push('Atentamente.');
	blocks.push(`**EMAÚS ${retreatTypeLabelEs(data.retreatType)}.**`);

	return blocks.join('\n\n');
}
