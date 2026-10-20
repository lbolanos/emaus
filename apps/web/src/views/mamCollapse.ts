/**
 * Collapsed days of the Minuto a Minuto (specs/ux-mam-responsabilidades, D4).
 *
 * Pure helpers; the view owns the reactive state. The state is remembered per
 * retreat in the browser, and only after the coordinator touches it: until then
 * the default is recomputed on every visit, so during the retreat each morning
 * opens on that day.
 */
import {
  DEFAULT_RETREAT_TIMEZONE,
  addDaysYmd,
  daysUntilRetreat,
  toYmd,
  todayYmdInTz,
  type RetreatLikeDates,
} from '@/utils/retreatLiveStatus';

export const collapseStorageKey = (retreatId: string) => `minuteByMinute.collapsedDays.${retreatId}`;

function storage(): Storage | null {
  // Private browsing or blocked site data can make the accessor itself throw.
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** Saved collapsed days of a retreat; null when the coordinator never chose. */
export function readCollapsedDays(retreatId: string): number[] | null {
  try {
    const raw = storage()?.getItem(collapseStorageKey(retreatId));
    if (raw == null) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed.filter((d): d is number => Number.isInteger(d));
  } catch {
    return null;
  }
}

export function writeCollapsedDays(retreatId: string, days: number[]): void {
  try {
    storage()?.setItem(collapseStorageKey(retreatId), JSON.stringify([...days].sort((a, b) => a - b)));
  } catch {
    /* the view keeps working without persistence */
  }
}

/**
 * Day of the retreat that today is (1 = start date), as a calendar day in the
 * retreat's timezone. Null before or after the retreat, or when that day has no
 * activities.
 */
export function retreatDayToday(
  retreat: Pick<RetreatLikeDates, 'startDate' | 'timezone'> | null | undefined,
  days: number[],
  now: Date = new Date(),
): number | null {
  const until = daysUntilRetreat(retreat, now);
  if (until === null) return null;
  const day = 1 - until;
  return days.includes(day) ? day : null;
}

/** First visit: during the retreat only today is open; otherwise every day is. */
export function initialCollapsedDays(days: number[], today: number | null): number[] {
  return today === null ? [] : days.filter((d) => d !== today);
}

/** The retreat ended more than a day ago: "hace 3d" next to every row is noise. */
export function isRetreatOver(
  retreat: Pick<RetreatLikeDates, 'endDate' | 'timezone'> | null | undefined,
  now: Date = new Date(),
): boolean {
  const endYmd = toYmd(retreat?.endDate);
  if (!endYmd) return false;
  const today = todayYmdInTz(retreat?.timezone || DEFAULT_RETREAT_TIMEZONE, now);
  return today > addDaysYmd(endYmd, 1);
}
