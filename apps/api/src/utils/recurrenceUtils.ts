/**
 * Utility functions for calculating recurring meeting occurrences.
 *
 * ## Why every calculation is timezone-aware
 *
 * `startDate` is stored in UTC (see `DateTimeTransformer`). A meeting at
 * 19:45 America/Mexico_City is persisted as `01:45Z` **of the next day**, so
 * reading its calendar fields with the local getters of `Date` (`getDay()`,
 * `getDate()`, `getHours()`) yields the wrong day whenever the Node process
 * does not run in the meeting's timezone — which is always the case in
 * production, where the Lightsail box runs on `Etc/UTC`.
 *
 * That produced a weekly series configured for Wednesday that materialized
 * every Tuesday: `getDay()` saw Thursday (UTC), the target was Wednesday, so
 * `(3 - 4 + 7) % 7` advanced 6 days instead of 7 and the whole series slid one
 * day back. The monthly branch had the same defect (day 2 of the month
 * generated day 1).
 *
 * Rule: decompose the instant into calendar fields **of the meeting's
 * timezone**, do the calendar arithmetic on those plain numbers, and rebuild
 * the instant with `makeDateInTimezone` (which is DST-aware). Never use the
 * local getters/setters of `Date` for this.
 */
import { makeDateInTimezone } from './date.transformer';

/** Fallback when the community has no IANA timezone persisted yet. */
export const DEFAULT_RECURRENCE_TIMEZONE = 'America/Mexico_City';

interface ZonedParts {
	year: number;
	month0: number;
	day: number;
	hour: number;
	minute: number;
	second: number;
	millisecond: number;
	/** 0=Sunday … 6=Saturday, as seen in the target timezone. */
	weekday: number;
}

/**
 * Decomposes an instant into the calendar fields an observer in `timeZone`
 * would read off a wall clock.
 */
function getPartsInTimeZone(date: Date, timeZone: string): ZonedParts {
	const parts = new Intl.DateTimeFormat('en-US', {
		timeZone,
		hourCycle: 'h23',
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit',
	}).formatToParts(date);
	const get = (k: string): number => Number(parts.find((p) => p.type === k)?.value ?? '0');

	const year = get('year');
	const month0 = get('month') - 1;
	const day = get('day');

	return {
		year,
		month0,
		day,
		hour: get('hour'),
		minute: get('minute'),
		second: get('second'),
		// Milliseconds never differ across timezones (offsets are whole minutes).
		millisecond: date.getMilliseconds(),
		// Derived from the civil date, not from a locale string: the weekday of
		// a given Y-M-D is the same everywhere.
		weekday: new Date(Date.UTC(year, month0, day)).getUTCDay(),
	};
}

/** Pure civil-calendar arithmetic — no timezone, no DST involved. */
function addCivilDays(
	year: number,
	month0: number,
	day: number,
	days: number,
): { year: number; month0: number; day: number } {
	const scratch = new Date(Date.UTC(year, month0, day));
	scratch.setUTCDate(scratch.getUTCDate() + days);
	return {
		year: scratch.getUTCFullYear(),
		month0: scratch.getUTCMonth(),
		day: scratch.getUTCDate(),
	};
}

/** Rebuilds the instant for a wall-clock reading in `timeZone`. */
function composeInTimeZone(
	year: number,
	month0: number,
	day: number,
	hour: number,
	minute: number,
	second: number,
	millisecond: number,
	timeZone: string,
): Date {
	// `makeDateInTimezone` resolves the DST offset; seconds/milliseconds are
	// offset-invariant, so they can be added on top of the resulting instant.
	const base = makeDateInTimezone(year, month0, day, hour, minute, timeZone);
	return new Date(base.getTime() + second * 1000 + millisecond);
}

/**
 * Calculates the next occurrence date for a recurring meeting
 * @param currentStartDate - The current meeting's start date (UTC instant)
 * @param frequency - Recurrence frequency ('daily' | 'weekly' | 'monthly')
 * @param interval - Recurrence interval (e.g., 1 for every week, 2 for every 2 weeks)
 * @param dayOfWeek - Day of week for weekly recurrence ('monday', 'tuesday', etc.)
 * @param dayOfMonth - Day of month for monthly recurrence (1-31)
 * @param timeZone - IANA timezone the series is anchored to (the community's).
 *                   Defaults to CDMX so pre-existing callers keep working.
 * @returns The next occurrence date, or null if calculation fails
 */
export function calculateNextOccurrence(
	currentStartDate: Date,
	frequency: 'daily' | 'weekly' | 'monthly' | null,
	interval: number | null,
	dayOfWeek: string | null,
	dayOfMonth: number | null,
	timeZone: string = DEFAULT_RECURRENCE_TIMEZONE,
): Date | null {
	if (!frequency) return null;

	const current = getPartsInTimeZone(new Date(currentStartDate), timeZone);
	let next: { year: number; month0: number; day: number };

	switch (frequency) {
		case 'daily':
			next = addCivilDays(current.year, current.month0, current.day, interval || 1);
			break;

		case 'weekly': {
			const intervalWeeks = interval || 1;

			// When no explicit day-of-week is given, "weekly" means "+N weeks on the
			// same weekday as the start date" (i.e. always +7 days), NOT "jump to the
			// next Sunday". Falling back to Sunday (getDayNumber(null) === 0) made the
			// next occurrence land anywhere from +1 to +7 days depending on which
			// weekday the start fell on — a date-dependent bug that broke
			// recurrenceEndDate ceilings non-deterministically.
			const targetDay = dayOfWeek ? getDayNumber(dayOfWeek) : current.weekday;

			// Days until the next occurrence of the target day. If the current day
			// already is the target, we want the NEXT one (7 days later), not today.
			const daysUntilTarget = (targetDay - current.weekday + 7) % 7 || 7;

			next = addCivilDays(
				current.year,
				current.month0,
				current.day,
				daysUntilTarget + (intervalWeeks - 1) * 7,
			);
			break;
		}

		case 'monthly': {
			const intervalMonths = interval || 1;
			const targetDayOfMonth = dayOfMonth || current.day;

			// Normalize the month overflow by hand instead of `setMonth`: adding a
			// month to Jan 31 with `setMonth` lands on Mar 3, and the later clamp
			// then measures the wrong month.
			const totalMonths = current.month0 + intervalMonths;
			const year = current.year + Math.floor(totalMonths / 12);
			const month0 = ((totalMonths % 12) + 12) % 12;

			// Clamp for months with fewer days (day 31 in February → Feb 28/29).
			const daysInTargetMonth = new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
			next = { year, month0, day: Math.min(targetDayOfMonth, daysInTargetMonth) };
			break;
		}

		default:
			return null;
	}

	// Preserve the wall-clock time of the original meeting: a series at 20:00
	// local stays at 20:00 local across a DST boundary, even though its UTC
	// instant shifts by an hour.
	return composeInTimeZone(
		next.year,
		next.month0,
		next.day,
		current.hour,
		current.minute,
		current.second,
		current.millisecond,
		timeZone,
	);
}

/**
 * Converts day name to JavaScript day number
 * @param dayName - Name of day ('sunday', 'monday', etc.)
 * @returns Day number (0=Sunday, 1=Monday, ..., 6=Saturday)
 */
function getDayNumber(dayName: string | null): number {
	const days: Record<string, number> = {
		sunday: 0,
		monday: 1,
		tuesday: 2,
		wednesday: 3,
		thursday: 4,
		friday: 5,
		saturday: 6,
	};
	return days[dayName || ''] ?? 0;
}

/**
 * First upcoming occurrence of `dayOfWeek` at `hour:minute` **wall-clock time in
 * `timeZone`**, counting from `from`. If today already is that weekday and the
 * time has not passed yet, returns today.
 *
 * Used to seed the default meeting of a newly approved community. The previous
 * inline version read `getDay()`/`setHours()` off the process clock, so on the
 * UTC production box a community asking for "Wednesdays at 19:45" got a meeting
 * stored at 19:45Z — 13:45 in Mexico City, six hours early, and on the wrong
 * weekday whenever UTC and the community's date disagreed.
 *
 * @returns The occurrence instant, or null if `dayOfWeek` is not a valid name.
 */
export function nextWeekdayOccurrence(
	dayOfWeek: string,
	hour: number,
	minute: number,
	timeZone: string = DEFAULT_RECURRENCE_TIMEZONE,
	from: Date = new Date(),
): Date | null {
	const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
	const targetDay = days.indexOf(dayOfWeek.toLowerCase());
	if (targetDay < 0) return null;

	const today = getPartsInTimeZone(from, timeZone);
	const diff = (targetDay - today.weekday + 7) % 7;

	const at = (offsetDays: number): Date => {
		const d = addCivilDays(today.year, today.month0, today.day, offsetDays);
		return composeInTimeZone(d.year, d.month0, d.day, hour, minute, 0, 0, timeZone);
	};

	// Same weekday but the hour already went by → push a full week.
	const candidate = at(diff);
	return candidate > from ? candidate : at(diff + 7);
}
