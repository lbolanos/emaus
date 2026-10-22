import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
	DEFAULT_ATTENDANCE_LIST_OPTIONS,
	filterAndSortAttendanceMembers,
	formatSourceRetreat,
	loadAttendancePrefs,
	saveAttendancePrefs,
	mergeMembers,
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

describe('photo filter', () => {
	const withPhoto = [
		member('m-a', 'Ana', 'López', { photoUrl: 'https://s3.example.com/a.jpg?sig=1' }),
		member('m-b', 'Beto', 'Ruiz', { photoUrl: null }),
		member('m-c', 'Carla', 'Díaz'),
	];
	const run = (photo: 'all' | 'with' | 'without') =>
		filterAndSortAttendanceMembers(withPhoto, { ...DEFAULT_ATTENDANCE_LIST_OPTIONS, photo }).map(
			(m) => m.id,
		);

	it('keeps everyone by default', () => {
		expect(run('all')).toEqual(['m-a', 'm-b', 'm-c']);
	});

	it('shows only members with a photo', () => {
		expect(run('with')).toEqual(['m-a']);
	});

	it('shows only members without a photo (null or missing)', () => {
		expect(run('without')).toEqual(['m-b', 'm-c']);
	});
});

describe('mergeMembers', () => {
	const row = (id: string, photoUrl: string | null, extra: object = {}) => ({ id, photoUrl, ...extra });

	it('keeps the previous URL when the new one points to the same object', () => {
		const prev = [row('m-1', 'https://s3.example.com/m-1.jpg?sig=old')];
		const next = [row('m-1', 'https://s3.example.com/m-1.jpg?sig=new', { rate: 80 })];
		expect(mergeMembers(prev, next)).toEqual([
			row('m-1', 'https://s3.example.com/m-1.jpg?sig=old', { rate: 80 }),
		]);
	});

	it('takes the new URL when the photo is a different object', () => {
		const prev = [row('m-1', 'https://s3.example.com/m-1-v1.jpg?sig=a')];
		const next = [row('m-1', 'https://s3.example.com/m-1-v2.jpg?sig=b')];
		expect(mergeMembers(prev, next)[0].photoUrl).toBe('https://s3.example.com/m-1-v2.jpg?sig=b');
	});

	it('handles photos added, removed and members that are new', () => {
		const prev = [row('m-1', null), row('m-2', 'https://s3.example.com/m-2.jpg?sig=a')];
		const next = [
			row('m-1', 'https://s3.example.com/m-1.jpg?sig=a'),
			row('m-2', null),
			row('m-3', 'https://s3.example.com/m-3.jpg?sig=a'),
		];
		expect(mergeMembers(prev, next).map((m) => m.photoUrl)).toEqual([
			'https://s3.example.com/m-1.jpg?sig=a',
			null,
			'https://s3.example.com/m-3.jpg?sig=a',
		]);
	});

	it('does not mutate its inputs', () => {
		const prev = [row('m-1', 'https://s3.example.com/m-1.jpg?sig=old')];
		const next = [row('m-1', 'https://s3.example.com/m-1.jpg?sig=new')];
		mergeMembers(prev, next);
		expect(next[0].photoUrl).toBe('https://s3.example.com/m-1.jpg?sig=new');
	});
});

describe('attendance prefs', () => {
	const { query: _q, ...defaults } = DEFAULT_ATTENDANCE_LIST_OPTIONS;

	beforeEach(() => {
		localStorage.clear();
		vi.restoreAllMocks();
	});

	it('round-trips per community', () => {
		const prefs = { status: 'absent', retreat: 'r-1', frequency: 'low', photo: 'without', sort: 'joined' } as const;
		saveAttendancePrefs('c-1', prefs);
		expect(loadAttendancePrefs('c-1')).toEqual(prefs);
		expect(loadAttendancePrefs('c-2')).toEqual(defaults);
	});

	it('falls back to defaults on invalid values or corrupt JSON', () => {
		localStorage.setItem('emaus:community-attendance:c-1', JSON.stringify({ status: 'bogus', sort: 'attendance' }));
		expect(loadAttendancePrefs('c-1')).toEqual({ ...defaults, sort: 'attendance' });
		localStorage.setItem('emaus:community-attendance:c-1', '{nope');
		expect(loadAttendancePrefs('c-1')).toEqual(defaults);
	});

	it('survives storage that throws', () => {
		vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
			throw new Error('blocked');
		});
		vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
			throw new Error('blocked');
		});
		expect(loadAttendancePrefs('c-1')).toEqual(defaults);
		expect(() => saveAttendancePrefs('c-1', defaults)).not.toThrow();
	});
});
