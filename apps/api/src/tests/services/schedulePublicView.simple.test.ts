/**
 * `getPublicSchedule(slug)` — pure-logic tests.
 *
 * The endpoint powers the auth-less big-screen view at `/mam/:slug`. The
 * service must:
 *   1. Reject retreats with `isPublic=false` (returns null → 404).
 *   2. Return null for missing slug.
 *   3. Strip PII: no participant emails/phones/IDs, no notes/descriptions.
 *   4. Sort items by day ASC, then startTime ASC.
 *   5. Include the responsability NAME (used to label "🎤 ...") but not
 *      anything else from the responsability entity.
 *
 * We can't easily boot TypeORM here, so we mirror the logic and verify the
 * shape + filtering invariants.
 */

interface MockRetreat {
	id: string;
	slug: string;
	parish: string;
	startDate: Date;
	endDate: Date;
	isPublic: boolean;
}

interface MockItem {
	id: string;
	retreatId: string;
	day: number;
	startTime: Date;
	endTime: Date;
	durationMinutes: number;
	name: string;
	type: string;
	status: 'pending' | 'active' | 'completed' | 'delayed' | 'skipped';
	location: string | null;
	notes: string | null;
	palanquitaNotes: string | null;
	responsability?: { id: string; name: string; description?: string | null } | null;
}

function getPublicSchedule(opts: {
	slug: string;
	retreats: MockRetreat[];
	items: MockItem[];
}): {
	retreat: { id: string; parish: string; startDate: string; endDate: string };
	items: Array<{
		id: string;
		day: number;
		startTime: string;
		endTime: string;
		durationMinutes: number;
		name: string;
		type: string;
		status: string;
		location: string | null;
		responsabilityName: string | null;
	}>;
} | null {
	const r = opts.retreats.find((x) => x.slug === opts.slug);
	if (!r || !r.isPublic) return null;
	const sorted = [...opts.items.filter((i) => i.retreatId === r.id)].sort((a, b) => {
		if (a.day !== b.day) return a.day - b.day;
		return a.startTime.getTime() - b.startTime.getTime();
	});
	return {
		retreat: {
			id: r.id,
			parish: r.parish,
			startDate: r.startDate.toISOString(),
			endDate: r.endDate.toISOString(),
		},
		items: sorted.map((it) => ({
			id: it.id,
			day: it.day,
			startTime: it.startTime.toISOString(),
			endTime: it.endTime.toISOString(),
			durationMinutes: it.durationMinutes,
			name: it.name,
			type: it.type,
			status: it.status,
			location: it.location ?? null,
			responsabilityName: it.responsability?.name ?? null,
		})),
	};
}

const baseRetreat = (overrides: Partial<MockRetreat> = {}): MockRetreat => ({
	id: overrides.id ?? 'r1',
	slug: overrides.slug ?? 'mi-retiro',
	parish: overrides.parish ?? 'Parroquia Santa Cruz',
	startDate: overrides.startDate ?? new Date('2026-04-26'),
	endDate: overrides.endDate ?? new Date('2026-04-28'),
	isPublic: overrides.isPublic ?? true,
});

const baseItem = (overrides: Partial<MockItem> = {}): MockItem => ({
	id: overrides.id ?? 'i1',
	retreatId: overrides.retreatId ?? 'r1',
	day: overrides.day ?? 1,
	startTime: overrides.startTime ?? new Date('2026-04-26T08:00:00Z'),
	endTime: overrides.endTime ?? new Date('2026-04-26T08:30:00Z'),
	durationMinutes: overrides.durationMinutes ?? 30,
	name: overrides.name ?? 'Bienvenida',
	type: overrides.type ?? 'logistica',
	status: overrides.status ?? 'pending',
	location: overrides.location ?? null,
	notes: overrides.notes ?? null,
	palanquitaNotes: overrides.palanquitaNotes ?? null,
	responsability: overrides.responsability,
});

describe('getPublicSchedule — public access guard', () => {
	it('returns null when retreat does not exist', () => {
		const r = getPublicSchedule({ slug: 'no-existe', retreats: [], items: [] });
		expect(r).toBeNull();
	});

	it('returns null when retreat has isPublic=false (private retreat)', () => {
		const r = getPublicSchedule({
			slug: 'mi-retiro',
			retreats: [baseRetreat({ isPublic: false })],
			items: [baseItem()],
		});
		expect(r).toBeNull();
	});

	it('returns data when isPublic=true', () => {
		const r = getPublicSchedule({
			slug: 'mi-retiro',
			retreats: [baseRetreat({ isPublic: true })],
			items: [baseItem()],
		});
		expect(r).not.toBeNull();
		expect(r!.retreat.parish).toBe('Parroquia Santa Cruz');
	});
});

describe('getPublicSchedule — PII stripping', () => {
	it('does NOT include `notes` or `palanquitaNotes` from items', () => {
		const r = getPublicSchedule({
			slug: 'mi-retiro',
			retreats: [baseRetreat()],
			items: [
				baseItem({
					notes: 'private staff notes',
					palanquitaNotes: 'sensitive song name',
				}),
			],
		})!;
		const json = JSON.stringify(r);
		expect(json).not.toContain('private staff notes');
		expect(json).not.toContain('sensitive song name');
	});

	it('does NOT include `responsability.description` (could contain PII or inline scripts)', () => {
		const r = getPublicSchedule({
			slug: 'mi-retiro',
			retreats: [baseRetreat()],
			items: [
				baseItem({
					responsability: {
						id: 'resp-1',
						name: 'Comedor',
						description: 'private guion text with personal data',
					},
				}),
			],
		})!;
		const json = JSON.stringify(r);
		expect(json).not.toContain('private guion text');
		// Name SHOULD be there
		expect(r.items[0].responsabilityName).toBe('Comedor');
	});

	it('does NOT include responsabilityId (only the name, by design)', () => {
		const r = getPublicSchedule({
			slug: 'mi-retiro',
			retreats: [baseRetreat()],
			items: [
				baseItem({
					responsability: { id: 'resp-internal-id', name: 'Comedor' },
				}),
			],
		})!;
		expect(JSON.stringify(r)).not.toContain('resp-internal-id');
	});
});

describe('getPublicSchedule — filtering & ordering', () => {
	it('only includes items for the matched retreat (filters out other retreats)', () => {
		const r = getPublicSchedule({
			slug: 'mi-retiro',
			retreats: [
				baseRetreat({ id: 'r1', slug: 'mi-retiro' }),
				baseRetreat({ id: 'r2', slug: 'otro-retiro' }),
			],
			items: [
				baseItem({ id: 'a', retreatId: 'r1' }),
				baseItem({ id: 'b', retreatId: 'r2' }),
			],
		})!;
		expect(r.items).toHaveLength(1);
		expect(r.items[0].id).toBe('a');
	});

	it('sorts items by day ASC, then startTime ASC', () => {
		const r = getPublicSchedule({
			slug: 'mi-retiro',
			retreats: [baseRetreat()],
			items: [
				baseItem({ id: 'd2-late', day: 2, startTime: new Date('2026-04-27T15:00:00Z'), endTime: new Date('2026-04-27T15:30:00Z') }),
				baseItem({ id: 'd1-late', day: 1, startTime: new Date('2026-04-26T20:00:00Z'), endTime: new Date('2026-04-26T20:30:00Z') }),
				baseItem({ id: 'd2-early', day: 2, startTime: new Date('2026-04-27T07:00:00Z'), endTime: new Date('2026-04-27T07:30:00Z') }),
				baseItem({ id: 'd1-early', day: 1, startTime: new Date('2026-04-26T07:00:00Z'), endTime: new Date('2026-04-26T07:30:00Z') }),
			],
		})!;
		expect(r.items.map((i) => i.id)).toEqual(['d1-early', 'd1-late', 'd2-early', 'd2-late']);
	});

	it('returns empty items array when retreat has no schedule yet (still 200, not 404)', () => {
		const r = getPublicSchedule({
			slug: 'mi-retiro',
			retreats: [baseRetreat()],
			items: [],
		});
		expect(r).not.toBeNull();
		expect(r!.items).toEqual([]);
	});
});

describe('getPublicSchedule — payload shape', () => {
	it('exposes all 10 expected item fields and no extras', () => {
		const r = getPublicSchedule({
			slug: 'mi-retiro',
			retreats: [baseRetreat()],
			items: [baseItem({ responsability: { id: 'x', name: 'Comedor' } })],
		})!;
		const keys = Object.keys(r.items[0]).sort();
		expect(keys).toEqual([
			'day',
			'durationMinutes',
			'endTime',
			'id',
			'location',
			'name',
			'responsabilityName',
			'startTime',
			'status',
			'type',
		]);
	});

	it('exposes only 4 retreat fields (no internal config)', () => {
		const r = getPublicSchedule({
			slug: 'mi-retiro',
			retreats: [baseRetreat()],
			items: [],
		})!;
		const keys = Object.keys(r.retreat).sort();
		expect(keys).toEqual(['endDate', 'id', 'parish', 'startDate']);
	});

	it('all status values pass through (pending/active/completed/delayed/skipped)', () => {
		const statuses = ['pending', 'active', 'completed', 'delayed', 'skipped'] as const;
		const r = getPublicSchedule({
			slug: 'mi-retiro',
			retreats: [baseRetreat()],
			items: statuses.map((s, i) =>
				baseItem({
					id: `i${i}`,
					day: 1,
					startTime: new Date(`2026-04-26T0${i}:00:00Z`),
					endTime: new Date(`2026-04-26T0${i}:30:00Z`),
					status: s,
				}),
			),
		})!;
		expect(r.items.map((i) => i.status)).toEqual(statuses);
	});
});
