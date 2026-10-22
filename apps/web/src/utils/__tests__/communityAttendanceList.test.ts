import { describe, it, expect } from 'vitest';
import {
	DEFAULT_ATTENDANCE_LIST_OPTIONS,
	filterAndSortAttendanceMembers,
	formatSourceRetreat,
	sourceRetreatOptions,
	type AttendanceListMember,
	type AttendanceListOptions,
} from '../communityAttendanceList';

const october2026 = { id: 'r-oct26', parish: 'Buen Despacho', startDate: '2026-10-16T00:00:00.000Z' };
const october2025 = { id: 'r-oct25', parish: 'Buen despacho', startDate: '2025-10-17T00:00:00.000Z' };

const member = (
	id: string,
	firstName: string,
	lastName: string,
	over: Partial<AttendanceListMember> = {},
): AttendanceListMember => ({
	id,
	attended: false,
	joinedAt: '2026-01-01T00:00:00.000Z',
	lastMeetingsAttendanceRate: 0,
	lastMeetingsFrequency: 'none',
	sourceRetreat: null,
	participant: { firstName, lastName, email: `${id}@example.com` },
	...over,
});

const members = [
	member('m-zoe', 'Zoé', 'Arias', {
		attended: true,
		lastMeetingsAttendanceRate: 50,
		lastMeetingsFrequency: 'medium',
		sourceRetreat: october2025,
		joinedAt: '2025-11-01T00:00:00.000Z',
	}),
	member('m-ana', 'Ana', 'López', {
		lastMeetingsAttendanceRate: 90,
		lastMeetingsFrequency: 'high',
		sourceRetreat: october2026,
		joinedAt: '2026-10-20T00:00:00.000Z',
	}),
	member('m-beto', 'Beto', 'Ruiz', { firstName: 'Alberto' }),
	member('m-carla', 'Carla', 'Díaz', {
		attended: true,
		lastMeetingsAttendanceRate: 90,
		lastMeetingsFrequency: 'high',
		sourceRetreat: october2026,
		joinedAt: '2026-03-01T00:00:00.000Z',
	}),
];

const ids = (opts: Partial<AttendanceListOptions>) =>
	filterAndSortAttendanceMembers(members, { ...DEFAULT_ATTENDANCE_LIST_OPTIONS, ...opts }).map(
		(m) => m.id,
	);

describe('filterAndSortAttendanceMembers', () => {
	it('sorts by the displayed name by default, overlay included', () => {
		// Beto has the overlay first name "Alberto", so he sorts first.
		expect(ids({})).toEqual(['m-beto', 'm-ana', 'm-carla', 'm-zoe']);
	});

	it('sorts by attendance rate, breaking ties by name', () => {
		expect(ids({ sort: 'attendance' })).toEqual(['m-ana', 'm-carla', 'm-zoe', 'm-beto']);
	});

	it('sorts by most recent source retreat, members without one last', () => {
		expect(ids({ sort: 'retreat' })).toEqual(['m-ana', 'm-carla', 'm-zoe', 'm-beto']);
	});

	it('sorts by most recent join date', () => {
		expect(ids({ sort: 'joined' })).toEqual(['m-ana', 'm-carla', 'm-beto', 'm-zoe']);
	});

	it('filters by attendance status in this meeting', () => {
		expect(ids({ status: 'present' })).toEqual(['m-carla', 'm-zoe']);
		expect(ids({ status: 'absent' })).toEqual(['m-beto', 'm-ana']);
	});

	it('filters by source retreat, or by having none', () => {
		expect(ids({ retreat: 'r-oct26' })).toEqual(['m-ana', 'm-carla']);
		expect(ids({ retreat: 'none' })).toEqual(['m-beto']);
	});

	it('filters by attendance frequency', () => {
		expect(ids({ frequency: 'high' })).toEqual(['m-ana', 'm-carla']);
		expect(ids({ frequency: 'none' })).toEqual(['m-beto']);
	});

	it('combines the search with the filters', () => {
		expect(ids({ query: 'ana', retreat: 'r-oct26' })).toEqual(['m-ana']);
		expect(ids({ query: 'm-zoe@example', status: 'absent' })).toEqual([]);
	});
});

describe('sourceRetreatOptions', () => {
	it('lists each retreat once, most recent first', () => {
		expect(sourceRetreatOptions(members).map((r) => r.id)).toEqual(['r-oct26', 'r-oct25']);
	});
});

describe('formatSourceRetreat', () => {
	it('shows the start month in UTC so a calendar date does not slip a month', () => {
		const firstOfMonth = { id: 'r', parish: 'San Agustín', startDate: '2026-06-01T00:00:00.000Z' };
		expect(formatSourceRetreat(firstOfMonth)).toMatch(/^San Agustín · jun\.? 2026$/);
	});
});
