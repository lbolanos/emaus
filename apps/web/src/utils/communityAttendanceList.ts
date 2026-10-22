import { resolveMemberProfile } from '@repo/utils';
import { createLocaleComparator } from './sort';

/**
 * Filtering and sorting for the attendance-taking list of a community meeting.
 * Pure so the view only holds the selected options.
 */

export interface SourceRetreat {
	id: string;
	parish: string;
	startDate: string | Date;
}

export interface AttendanceListMember {
	id: string;
	attended: boolean;
	joinedAt?: string | Date;
	lastMeetingsAttendanceRate?: number;
	lastMeetingsFrequency?: string;
	sourceRetreat?: SourceRetreat | null;
	firstName?: string | null;
	lastName?: string | null;
	email?: string | null;
	cellPhone?: string | null;
	photoUrl?: string | null;
	participant?: any;
}

export type AttendanceStatusFilter = 'all' | 'present' | 'absent';
/** `'all'`, `'none'` (no source retreat) or a retreat id. */
export type SourceRetreatFilter = string;
export type FrequencyFilter = 'all' | 'high' | 'medium' | 'low' | 'none';
export type PhotoFilter = 'all' | 'with' | 'without';
export type AttendanceSort = 'name' | 'attendance' | 'retreat' | 'joined';

export interface AttendanceListOptions {
	query: string;
	status: AttendanceStatusFilter;
	retreat: SourceRetreatFilter;
	frequency: FrequencyFilter;
	photo: PhotoFilter;
	sort: AttendanceSort;
}

export const DEFAULT_ATTENDANCE_LIST_OPTIONS: AttendanceListOptions = {
	query: '',
	status: 'all',
	retreat: 'all',
	frequency: 'all',
	photo: 'all',
	sort: 'name',
};

const nameComparator = createLocaleComparator('es', 'asc');
const time = (d: string | Date | undefined | null) => (d ? new Date(d).getTime() : 0);

const byName = (a: AttendanceListMember, b: AttendanceListMember) =>
	nameComparator(resolveMemberProfile(a as any).fullName, resolveMemberProfile(b as any).fullName);

// Every comparator ends on the name, so equal keys keep a stable, findable order.
const comparators: Record<
	AttendanceSort,
	(a: AttendanceListMember, b: AttendanceListMember) => number
> = {
	name: byName,
	attendance: (a, b) =>
		(b.lastMeetingsAttendanceRate ?? 0) - (a.lastMeetingsAttendanceRate ?? 0) || byName(a, b),
	// Most recent retreat first; members without one go last.
	retreat: (a, b) => {
		if (!a.sourceRetreat !== !b.sourceRetreat) return a.sourceRetreat ? -1 : 1;
		return (
			time(b.sourceRetreat?.startDate) - time(a.sourceRetreat?.startDate) ||
			nameComparator(a.sourceRetreat?.parish ?? '', b.sourceRetreat?.parish ?? '') ||
			byName(a, b)
		);
	},
	joined: (a, b) => time(b.joinedAt) - time(a.joinedAt) || byName(a, b),
};

export function filterAndSortAttendanceMembers<T extends AttendanceListMember>(
	members: T[],
	opts: AttendanceListOptions,
): T[] {
	const query = opts.query.toLowerCase().trim();
	return members
		.filter((m) => {
			if (opts.status === 'present' && !m.attended) return false;
			if (opts.status === 'absent' && m.attended) return false;

			if (opts.retreat === 'none' && m.sourceRetreat) return false;
			if (opts.retreat !== 'all' && opts.retreat !== 'none' && m.sourceRetreat?.id !== opts.retreat)
				return false;

			if (
				opts.frequency !== 'all' &&
				(m.lastMeetingsFrequency ?? 'none').toLowerCase() !== opts.frequency
			)
				return false;

			if (opts.photo === 'with' && !m.photoUrl) return false;
			if (opts.photo === 'without' && m.photoUrl) return false;

			if (!query) return true;
			const profile = resolveMemberProfile(m as any);
			return (
				profile.fullName.toLowerCase().includes(query) ||
				(!!profile.email && profile.email.toLowerCase().includes(query))
			);
		})
		.sort(comparators[opts.sort]);
}

/** Distinct source retreats among the members, most recent first, for the filter. */
export function sourceRetreatOptions(members: AttendanceListMember[]): SourceRetreat[] {
	const byId = new Map<string, SourceRetreat>();
	for (const m of members) if (m.sourceRetreat) byId.set(m.sourceRetreat.id, m.sourceRetreat);
	return [...byId.values()].sort((a, b) => time(b.startDate) - time(a.startDate));
}

/**
 * "Buen Despacho · oct 2026". The start date is a calendar date stored at UTC
 * midnight: formatting it in UTC keeps CDMX from showing the previous month.
 */
export function formatSourceRetreat(retreat: SourceRetreat): string {
	const monthYear = new Date(retreat.startDate).toLocaleDateString('es-MX', {
		month: 'short',
		year: 'numeric',
		timeZone: 'UTC',
	});
	return `${retreat.parish} · ${monthYear}`;
}

/** The object a signed URL points to: everything before the signature query. */
const photoObjectPath = (url: string) => url.split('?')[0];

/**
 * Rebuilds the list from a fresh API read. Photo URLs are signed and change on
 * every read: when the new URL points at the same object as the one already on
 * screen, keep the old one so the browser does not download the photo again.
 */
export function mergeMembers<T extends { id: string; photoUrl?: string | null }>(
	prev: T[],
	next: T[],
): T[] {
	const prevById = new Map(prev.map((m) => [m.id, m]));
	return next.map((m) => {
		const old = prevById.get(m.id)?.photoUrl;
		if (old && m.photoUrl && old !== m.photoUrl && photoObjectPath(old) === photoObjectPath(m.photoUrl))
			return { ...m, photoUrl: old };
		return m;
	});
}

/** Filters and sort remembered per community; the search text is not. */
export type AttendancePrefs = Pick<
	AttendanceListOptions,
	'status' | 'retreat' | 'frequency' | 'photo' | 'sort'
>;

const prefsKey = (communityId: string) => `emaus:community-attendance:${communityId}`;

const ALLOWED = {
	status: ['all', 'present', 'absent'],
	frequency: ['all', 'high', 'medium', 'low', 'none'],
	photo: ['all', 'with', 'without'],
	sort: ['name', 'attendance', 'retreat', 'joined'],
} as const;

/** Reads the saved prefs; anything missing, invalid or unreadable falls back to the defaults. */
export function loadAttendancePrefs(communityId: string): AttendancePrefs {
	const { query: _query, ...defaults } = DEFAULT_ATTENDANCE_LIST_OPTIONS;
	try {
		const raw = JSON.parse(localStorage.getItem(prefsKey(communityId)) ?? 'null');
		if (!raw || typeof raw !== 'object') return defaults;
		const pick = <K extends keyof typeof ALLOWED>(key: K): AttendancePrefs[K] =>
			(ALLOWED[key] as readonly string[]).includes(raw[key]) ? raw[key] : defaults[key];
		return {
			status: pick('status'),
			frequency: pick('frequency'),
			photo: pick('photo'),
			sort: pick('sort'),
			retreat: typeof raw.retreat === 'string' && raw.retreat ? raw.retreat : defaults.retreat,
		};
	} catch {
		return defaults;
	}
}

/** Best effort: storage can be blocked (private mode) or full. */
export function saveAttendancePrefs(communityId: string, prefs: AttendancePrefs): void {
	try {
		localStorage.setItem(prefsKey(communityId), JSON.stringify(prefs));
	} catch {
		// Not remembering is fine.
	}
}
