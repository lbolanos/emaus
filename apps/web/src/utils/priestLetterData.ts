/**
 * Adapts the DTOs of a retreat into the input of `buildPriestLetterMarkdown`.
 *
 * Everything that depends on a timezone or on the shape of an API payload lives
 * here, so `@repo/utils` can keep the letter itself pure and testable in Jest.
 */

import {
	derivePriestLetterMeetings,
	selectPriestScheduleItems,
	type PriestLetterData,
	type PriestLetterScheduleSource,
} from '@repo/utils';
import type { RetreatPreparationDTO, RetreatScheduleItemDTO } from '@/services/api';
import { DEFAULT_RETREAT_TIMEZONE } from '@/utils/retreatLiveStatus';

/**
 * The retreat fields the letter needs, declared structurally: `retreatSchema`
 * does not describe `house`, which the API does send, and the views already
 * reach it untyped.
 */
export interface PriestLetterRetreatInput {
	parish?: string | null;
	startDate?: string | Date | null;
	endDate?: string | Date | null;
	retreat_type?: string | null;
	retreat_number_version?: string | null;
	closingChurchName?: string | null;
	timezone?: string | null;
	house?: { name?: string | null; timezone?: string | null } | null;
}

/**
 * Logo per retreat type. Mirrors `retreatTypeLogo` of
 * `apps/web/src/composables/useFlyerContent.ts` — the repo's source of truth
 * for which artwork belongs to which retreat. Duplicated instead of imported
 * because that one is a composable and needs `useI18n()` plus a retreat ref.
 */
export function retreatLetterLogoUrl(retreatType?: string | null): string {
	const logos: Record<string, string> = {
		men: '/oficial_mejorado.png',
		women: '/woman_logo.png',
		couples: '/crossRoseButtT.png',
		effeta: '/crossRoseButtT.png',
	};
	if (!retreatType) return '/crossRoseButtT.png';
	return logos[retreatType] ?? '/crossRoseButtT.png';
}

/** Effective timezone of a retreat: its own, else its house's, else CDMX. */
export function resolveRetreatTimezone(retreat: PriestLetterRetreatInput | null | undefined): string {
	return retreat?.timezone || retreat?.house?.timezone || DEFAULT_RETREAT_TIMEZONE;
}

/**
 * Trims what Google Places appends to a church name.
 *
 * `closingChurchName` is filled from `place.displayName` through the
 * autocomplete, and comes back as "Parroquia del Señor del Buen Despacho |
 * Mexico City". That tail reads as noise in a formal letter, where the name
 * appears three times, and the extra line it wraps to is the difference between
 * the letter fitting on one sheet or not.
 */
export function cleanChurchName(name: string | null | undefined): string | null {
	if (!name) return null;
	const cleaned = name.split('|')[0].trim().replace(/[,;]+$/, '');
	return cleaned || null;
}

/** `YYYY-MM-DD` out of a `date` column, reading UTC parts so no day shifts. */
function toYmd(value: string | Date | null | undefined): string | null {
	if (!value) return null;
	if (typeof value === 'string') return value.slice(0, 10);
	const y = value.getUTCFullYear();
	const m = String(value.getUTCMonth() + 1).padStart(2, '0');
	const d = String(value.getUTCDate()).padStart(2, '0');
	return `${y}-${m}-${d}`;
}

/**
 * Calendar date and wall-clock time of an instant, in a IANA timezone.
 *
 * `retreat_schedule_item.startTime` is a UTC instant that stands for the
 * retreat's local time. `MinuteByMinuteView` renders it with `getHours()`, i.e.
 * the BROWSER's timezone — fine on screen for a coordinator sitting at the
 * retreat, wrong on a letter printed from another country. Hence the explicit
 * `timeZone` here.
 *
 * `hourCycle: 'h23'` and not `hour12: false`: several ICU builds return `24`
 * for midnight with the latter.
 */
export function zonedWallClock(
	iso: string,
	timezone: string,
): { date: string; time: string } | null {
	const instant = new Date(iso);
	if (Number.isNaN(instant.getTime())) return null;

	// `Intl` lanza `RangeError` con una zona que no reconoce, y `retreat.timezone`
	// es una columna de texto libre: un valor viejo o mal escrito tumbaría el
	// diálogo entero. Cae a la zona por defecto, que es peor que la correcta pero
	// mucho mejor que una carta que no abre.
	let parts: Intl.DateTimeFormatPart[];
	const options: Intl.DateTimeFormatOptions = {
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		hourCycle: 'h23',
	};
	try {
		parts = new Intl.DateTimeFormat('en-CA', { ...options, timeZone: timezone }).formatToParts(
			instant,
		);
	} catch {
		parts = new Intl.DateTimeFormat('en-CA', {
			...options,
			timeZone: DEFAULT_RETREAT_TIMEZONE,
		}).formatToParts(instant);
	}

	const get = (type: Intl.DateTimeFormatPartTypes) =>
		parts.find((part) => part.type === type)?.value ?? '';

	const year = get('year');
	const month = get('month');
	const day = get('day');
	const hour = get('hour');
	const minute = get('minute');
	if (!year || !month || !day || !hour || !minute) return null;

	return { date: `${year}-${month}-${day}`, time: `${hour}:${minute}` };
}

/**
 * Minute-by-Minute items normalised to the retreat's wall clock, with the
 * responsability name flattened.
 *
 * The name comes from `item.responsability`, the relation that
 * `GET /schedule/retreats/:id/items` already loads (`listForRetreat` asks for
 * it). Resolving it against `GET /responsibilities` instead would cost an extra
 * request and the `responsability:list` permission for data already in hand.
 *
 * The date comes from the item's own instant, never from `startDate + day - 1`:
 * materialisation shifts after-midnight activities to the next calendar day.
 */
export function toPriestLetterSource(
	items: RetreatScheduleItemDTO[],
	timezone: string,
): PriestLetterScheduleSource[] {
	const source: PriestLetterScheduleSource[] = [];
	for (const item of items ?? []) {
		const when = zonedWallClock(item.startTime, timezone);
		if (!when) continue;
		source.push({
			name: item.name,
			type: item.type,
			day: item.day,
			responsabilityName: item.responsability?.name ?? null,
			date: when.date,
			time: when.time,
			location: item.location ?? null,
		});
	}
	return source;
}

/** Everything `buildPriestLetterMarkdown` needs, out of the raw payloads. */
export function buildPriestLetterData(input: {
	retreat: PriestLetterRetreatInput | null | undefined;
	preparations: RetreatPreparationDTO[];
	scheduleItems: RetreatScheduleItemDTO[];
}): PriestLetterData | null {
	const { retreat } = input;
	const startDate = toYmd(retreat?.startDate);
	const endDate = toYmd(retreat?.endDate);
	// Without the dates there is no letter: every request in it is anchored to
	// the retreat weekend.
	if (!retreat || !startDate || !endDate) return null;

	const timezone = resolveRetreatTimezone(retreat);

	return {
		retreatName: retreat.parish?.trim() || '',
		startDate,
		endDate,
		retreatType: retreat.retreat_type ?? null,
		retreatNumber: retreat.retreat_number_version ?? null,
		parishChurchName: cleanChurchName(retreat.closingChurchName),
		meetings: derivePriestLetterMeetings(
			(input.preparations ?? []).map((prep) => ({
				type: prep.type,
				date: prep.date ?? null,
				time: prep.time ?? null,
			})),
		),
		scheduleItems: selectPriestScheduleItems(
			toPriestLetterSource(input.scheduleItems ?? [], timezone),
		),
	};
}
