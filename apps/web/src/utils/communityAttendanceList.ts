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
	participant?: any;
}

export type AttendanceStatusFilter = 'all' | 'present' | 'absent';
/** `'all'`, `'none'` (no source retreat) or a retreat id. */
export type SourceRetreatFilter = string;
export type FrequencyFilter = 'all' | 'high' | 'medium' | 'low' | 'none';
export type AttendanceSort = 'name' | 'attendance' | 'retreat' | 'joined';

export interface AttendanceListOptions {
	query: string;
	status: AttendanceStatusFilter;
	retreat: SourceRetreatFilter;
	frequency: FrequencyFilter;
	sort: AttendanceSort;
}

export const DEFAULT_ATTENDANCE_LIST_OPTIONS: AttendanceListOptions = {
	query: '',
	status: 'all',
	retreat: 'all',
	frequency: 'all',
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
