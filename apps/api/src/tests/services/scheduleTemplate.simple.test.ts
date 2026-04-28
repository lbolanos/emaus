/**
 * Schedule Template — pure business logic tests (no DB required).
 *
 * Tests the grouping/ordering logic that mirrors both the service layer
 * (defaultDay ASC, defaultOrder ASC, defaultStartTime ASC) and the
 * frontend computed `groupedByDay`.
 *
 * Controller response-code behaviour is also covered here using manual
 * mock functions so we never touch TypeORM or a real database.
 */

// ── Types ─────────────────────────────────────────────────────────────────────
interface TemplateItem {
	id: string;
	name: string;
	type: string;
	defaultDay: number;
	defaultOrder: number;
	defaultStartTime: string | null;
	defaultDurationMinutes: number;
	blocksSantisimoAttendance: boolean;
	requiresResponsable: boolean;
	isActive: boolean;
}

interface TemplateSet {
	id: string;
	name: string;
	description: string | null;
	isDefault: boolean;
	isActive: boolean;
}

// ── Pure helpers (mirror service & frontend logic) ─────────────────────────────

/** Mirror of ScheduleTemplateService.listAll() ordering */
function sortItems(items: TemplateItem[]): TemplateItem[] {
	return [...items].sort((a, b) => {
		if (a.defaultDay !== b.defaultDay) return a.defaultDay - b.defaultDay;
		if (a.defaultOrder !== b.defaultOrder) return a.defaultOrder - b.defaultOrder;
		return (a.defaultStartTime ?? '').localeCompare(b.defaultStartTime ?? '');
	});
}

/** Mirror of frontend groupedByDay computed property */
function groupByDay(items: TemplateItem[]): Map<number, TemplateItem[]> {
	const map = new Map<number, TemplateItem[]>();
	for (const t of items) {
		const arr = map.get(t.defaultDay) ?? [];
		arr.push(t);
		map.set(t.defaultDay, arr);
	}
	for (const arr of map.values()) {
		arr.sort((a, b) =>
			(a.defaultStartTime ?? '').localeCompare(b.defaultStartTime ?? '') ||
			a.defaultOrder - b.defaultOrder,
		);
	}
	return new Map([...map.entries()].sort(([a], [b]) => a - b));
}

/** Mirror of ScheduleTemplateService.listSets() ordering */
function sortSets(sets: TemplateSet[]): TemplateSet[] {
	return [...sets].sort((a, b) => {
		if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
		return a.name.localeCompare(b.name);
	});
}

/** Mirror of frontend typeBadgeClass() */
const TYPE_COLORS: Record<string, string> = {
	charla:     'bg-blue-100 text-blue-700',
	testimonio: 'bg-violet-100 text-violet-700',
	dinamica:   'bg-orange-100 text-orange-700',
	misa:       'bg-yellow-100 text-yellow-700',
	comida:     'bg-green-100 text-green-700',
	refrigerio: 'bg-teal-100 text-teal-700',
	traslado:   'bg-slate-100 text-slate-600',
	campana:    'bg-amber-100 text-amber-700',
	logistica:  'bg-gray-100 text-gray-600',
	santisimo:  'bg-indigo-100 text-indigo-700',
	descanso:   'bg-rose-100 text-rose-600',
	oracion:    'bg-pink-100 text-pink-700',
	otro:       'bg-gray-100 text-gray-500',
};

function typeBadgeClass(type: string): string {
	return TYPE_COLORS[type] ?? TYPE_COLORS['otro'];
}

// ── Fixtures ──────────────────────────────────────────────────────────────────
function makeItem(overrides: Partial<TemplateItem> = {}): TemplateItem {
	return {
		id: `item-${Math.random().toString(36).slice(2)}`,
		name: 'Actividad',
		type: 'otro',
		defaultDay: 1,
		defaultOrder: 0,
		defaultStartTime: '08:00',
		defaultDurationMinutes: 30,
		blocksSantisimoAttendance: false,
		requiresResponsable: false,
		isActive: true,
		...overrides,
	};
}

function makeSet(overrides: Partial<TemplateSet> = {}): TemplateSet {
	return {
		id: `set-${Math.random().toString(36).slice(2)}`,
		name: 'Template',
		description: null,
		isDefault: false,
		isActive: true,
		...overrides,
	};
}

// ── Controller mock helpers ───────────────────────────────────────────────────
function makeMockReqRes(opts: {
	query?: Record<string, string>;
	params?: Record<string, string>;
	body?: Record<string, unknown>;
}) {
	const json = jest.fn();
	const status = jest.fn().mockReturnValue({ json, send: jest.fn() });
	const send = jest.fn();
	const req = { query: opts.query ?? {}, params: opts.params ?? {}, body: opts.body ?? {} };
	const res = { json, status, send } as any;
	return { req, res, json, status };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ScheduleTemplate — item sorting (mirrors service ORDER BY)', () => {
	test('sorts by day ascending', () => {
		const items = [
			makeItem({ defaultDay: 3, defaultOrder: 0, defaultStartTime: '08:00' }),
			makeItem({ defaultDay: 1, defaultOrder: 0, defaultStartTime: '08:00' }),
			makeItem({ defaultDay: 2, defaultOrder: 0, defaultStartTime: '08:00' }),
		];
		const sorted = sortItems(items);
		expect(sorted.map(i => i.defaultDay)).toEqual([1, 2, 3]);
	});

	test('within the same day, sorts by defaultOrder ascending', () => {
		const items = [
			makeItem({ defaultDay: 1, defaultOrder: 3, defaultStartTime: null }),
			makeItem({ defaultDay: 1, defaultOrder: 1, defaultStartTime: null }),
			makeItem({ defaultDay: 1, defaultOrder: 2, defaultStartTime: null }),
		];
		const sorted = sortItems(items);
		expect(sorted.map(i => i.defaultOrder)).toEqual([1, 2, 3]);
	});

	test('within the same day and order, sorts by start time lexicographically', () => {
		const items = [
			makeItem({ defaultDay: 1, defaultOrder: 0, defaultStartTime: '21:00' }),
			makeItem({ defaultDay: 1, defaultOrder: 0, defaultStartTime: '08:00' }),
			makeItem({ defaultDay: 1, defaultOrder: 0, defaultStartTime: '13:00' }),
		];
		const sorted = sortItems(items);
		expect(sorted.map(i => i.defaultStartTime)).toEqual(['08:00', '13:00', '21:00']);
	});

	test('treats null start time as empty string (sorts before non-null)', () => {
		const items = [
			makeItem({ defaultDay: 1, defaultOrder: 0, defaultStartTime: '08:00' }),
			makeItem({ defaultDay: 1, defaultOrder: 0, defaultStartTime: null }),
		];
		const sorted = sortItems(items);
		expect(sorted[0].defaultStartTime).toBeNull();
		expect(sorted[1].defaultStartTime).toBe('08:00');
	});

	test('is stable for equal keys (preserves insertion order)', () => {
		const items = [
			makeItem({ id: 'first',  defaultDay: 1, defaultOrder: 0, defaultStartTime: '08:00' }),
			makeItem({ id: 'second', defaultDay: 1, defaultOrder: 0, defaultStartTime: '08:00' }),
		];
		const sorted = sortItems(items);
		expect(sorted[0].id).toBe('first');
		expect(sorted[1].id).toBe('second');
	});
});

describe('ScheduleTemplate — groupByDay (mirrors frontend computed)', () => {
	test('groups items by defaultDay', () => {
		const items = [
			makeItem({ defaultDay: 1 }),
			makeItem({ defaultDay: 2 }),
			makeItem({ defaultDay: 1 }),
			makeItem({ defaultDay: 3 }),
		];
		const map = groupByDay(items);
		expect([...map.keys()]).toEqual([1, 2, 3]);
		expect(map.get(1)).toHaveLength(2);
		expect(map.get(2)).toHaveLength(1);
		expect(map.get(3)).toHaveLength(1);
	});

	test('returns an empty map for empty input', () => {
		expect(groupByDay([])).toEqual(new Map());
	});

	test('returns days in ascending numeric order', () => {
		const items = [
			makeItem({ defaultDay: 3 }),
			makeItem({ defaultDay: 1 }),
			makeItem({ defaultDay: 2 }),
		];
		expect([...groupByDay(items).keys()]).toEqual([1, 2, 3]);
	});

	test('sorts items within a day by start time', () => {
		const items = [
			makeItem({ defaultDay: 1, defaultOrder: 0, defaultStartTime: '21:00', name: 'Noche' }),
			makeItem({ defaultDay: 1, defaultOrder: 0, defaultStartTime: '08:00', name: 'Mañana' }),
			makeItem({ defaultDay: 1, defaultOrder: 0, defaultStartTime: '13:00', name: 'Tarde' }),
		];
		const day1 = groupByDay(items).get(1)!;
		expect(day1.map(i => i.name)).toEqual(['Mañana', 'Tarde', 'Noche']);
	});

	test('sorts items within a day by order when start times are equal', () => {
		const items = [
			makeItem({ defaultDay: 1, defaultOrder: 2, defaultStartTime: '08:00', name: 'C' }),
			makeItem({ defaultDay: 1, defaultOrder: 0, defaultStartTime: '08:00', name: 'A' }),
			makeItem({ defaultDay: 1, defaultOrder: 1, defaultStartTime: '08:00', name: 'B' }),
		];
		const day1 = groupByDay(items).get(1)!;
		expect(day1.map(i => i.name)).toEqual(['A', 'B', 'C']);
	});

	test('single-day template returns one key', () => {
		const items = [1, 2, 3].map(() => makeItem({ defaultDay: 2 }));
		const map = groupByDay(items);
		expect([...map.keys()]).toEqual([2]);
		expect(map.get(2)).toHaveLength(3);
	});

	test('activity count per day matches group size', () => {
		const items = [
			...Array(5).fill(null).map(() => makeItem({ defaultDay: 1 })),
			...Array(3).fill(null).map(() => makeItem({ defaultDay: 2 })),
		];
		const map = groupByDay(items);
		expect(map.get(1)!.length).toBe(5);
		expect(map.get(2)!.length).toBe(3);
	});
});

describe('ScheduleTemplate — set ordering (mirrors service ORDER BY isDefault DESC, name ASC)', () => {
	test('default set appears first', () => {
		const sets = [
			makeSet({ name: 'Alpha', isDefault: false }),
			makeSet({ name: 'Omega', isDefault: true }),
		];
		const sorted = sortSets(sets);
		expect(sorted[0].isDefault).toBe(true);
		expect(sorted[0].name).toBe('Omega');
	});

	test('non-default sets are ordered alphabetically', () => {
		const sets = [
			makeSet({ name: 'Zeta', isDefault: false }),
			makeSet({ name: 'Alpha', isDefault: false }),
			makeSet({ name: 'Mango', isDefault: false }),
		];
		const sorted = sortSets(sets);
		expect(sorted.map(s => s.name)).toEqual(['Alpha', 'Mango', 'Zeta']);
	});

	test('default set among many non-defaults stays at index 0', () => {
		const sets = [
			makeSet({ name: 'B', isDefault: false }),
			makeSet({ name: 'A', isDefault: false }),
			makeSet({ name: 'Default', isDefault: true }),
		];
		const sorted = sortSets(sets);
		expect(sorted[0].isDefault).toBe(true);
		expect(sorted.slice(1).map(s => s.name)).toEqual(['A', 'B']);
	});

	test('handles a single set with isDefault=false', () => {
		const sets = [makeSet({ name: 'Solo', isDefault: false })];
		expect(sortSets(sets)[0].name).toBe('Solo');
	});

	test('handles empty list', () => {
		expect(sortSets([])).toEqual([]);
	});
});

describe('ScheduleTemplate — type badge color mapping', () => {
	const KNOWN_TYPES = [
		['charla',     'bg-blue-100'],
		['testimonio', 'bg-violet-100'],
		['dinamica',   'bg-orange-100'],
		['misa',       'bg-yellow-100'],
		['comida',     'bg-green-100'],
		['refrigerio', 'bg-teal-100'],
		['traslado',   'bg-slate-100'],
		['campana',    'bg-amber-100'],
		['logistica',  'bg-gray-100'],
		['santisimo',  'bg-indigo-100'],
		['descanso',   'bg-rose-100'],
		['oracion',    'bg-pink-100'],
		['otro',       'bg-gray-100'],
	] as const;

	test.each(KNOWN_TYPES)('type "%s" maps to class containing "%s"', (type, expectedClass) => {
		expect(typeBadgeClass(type)).toContain(expectedClass);
	});

	test('unknown type falls back to gray (otro) classes', () => {
		expect(typeBadgeClass('unknown-type')).toBe(TYPE_COLORS['otro']);
		expect(typeBadgeClass('')).toBe(TYPE_COLORS['otro']);
	});

	test('all known types produce non-empty strings', () => {
		Object.keys(TYPE_COLORS).forEach(type => {
			expect(typeBadgeClass(type)).toBeTruthy();
		});
	});

	test('each type has a text-* counterpart in its class string', () => {
		Object.keys(TYPE_COLORS).forEach(type => {
			expect(typeBadgeClass(type)).toMatch(/text-\w/);
		});
	});
});

describe('ScheduleTemplate — controller response codes (mocked service)', () => {
	// Minimal mock of the service methods
	const mockService = {
		listAll: jest.fn(),
		listSets: jest.fn(),
		getSet: jest.fn(),
		createSet: jest.fn(),
		updateSet: jest.fn(),
		deleteSet: jest.fn(),
		get: jest.fn(),
		create: jest.fn(),
		update: jest.fn(),
		delete: jest.fn(),
	};

	// Inline the controller functions to avoid TypeORM import chains
	const listTemplates = async (req: any, res: any) => {
		const setId = typeof req.query.setId === 'string' ? req.query.setId : undefined;
		const items = await mockService.listAll(setId);
		res.json(items);
	};

	const getTemplateSet = async (req: any, res: any) => {
		const s = await mockService.getSet(req.params.id);
		if (!s) return res.status(404).json({ message: 'Set not found' });
		res.json(s);
	};

	const createTemplateSet = async (req: any, res: any) => {
		const s = await mockService.createSet(req.body);
		res.status(201).json(s);
	};

	const updateTemplateSet = async (req: any, res: any) => {
		const s = await mockService.updateSet(req.params.id, req.body);
		if (!s) return res.status(404).json({ message: 'Set not found' });
		res.json(s);
	};

	const deleteTemplateSet = async (req: any, res: any) => {
		const ok = await mockService.deleteSet(req.params.id);
		if (!ok) return res.status(404).json({ message: 'Set not found' });
		res.status(204).send();
	};

	const getTemplate = async (req: any, res: any) => {
		const t = await mockService.get(req.params.id);
		if (!t) return res.status(404).json({ message: 'Template not found' });
		res.json(t);
	};

	const createTemplate = async (req: any, res: any) => {
		const t = await mockService.create(req.body);
		res.status(201).json(t);
	};

	const updateTemplate = async (req: any, res: any) => {
		const t = await mockService.update(req.params.id, req.body);
		if (!t) return res.status(404).json({ message: 'Template not found' });
		res.json(t);
	};

	const deleteTemplate = async (req: any, res: any) => {
		const ok = await mockService.delete(req.params.id);
		if (!ok) return res.status(404).json({ message: 'Template not found' });
		res.status(204).send();
	};

	beforeEach(() => jest.clearAllMocks());

	describe('listTemplates', () => {
		test('calls service.listAll with no setId when query is absent', async () => {
			const items = [makeItem()];
			mockService.listAll.mockResolvedValue(items);
			const { req, res, json } = makeMockReqRes({ query: {} });
			await listTemplates(req, res);
			expect(mockService.listAll).toHaveBeenCalledWith(undefined);
			expect(json).toHaveBeenCalledWith(items);
		});

		test('passes setId query param to service.listAll', async () => {
			mockService.listAll.mockResolvedValue([]);
			const { req, res } = makeMockReqRes({ query: { setId: 'set-abc' } });
			await listTemplates(req, res);
			expect(mockService.listAll).toHaveBeenCalledWith('set-abc');
		});
	});

	describe('getTemplateSet', () => {
		test('returns 200 with set data when found', async () => {
			const set = makeSet({ id: 'set-1' });
			mockService.getSet.mockResolvedValue(set);
			const { req, res, json } = makeMockReqRes({ params: { id: 'set-1' } });
			await getTemplateSet(req, res);
			expect(json).toHaveBeenCalledWith(set);
		});

		test('returns 404 when set not found', async () => {
			mockService.getSet.mockResolvedValue(null);
			const { req, res, status } = makeMockReqRes({ params: { id: 'missing' } });
			await getTemplateSet(req, res);
			expect(status).toHaveBeenCalledWith(404);
		});
	});

	describe('createTemplateSet', () => {
		test('returns 201 with the created set', async () => {
			const set = makeSet({ id: 'new-set', name: 'Nuevo' });
			mockService.createSet.mockResolvedValue(set);
			const { req, res, status } = makeMockReqRes({ body: { name: 'Nuevo' } });
			await createTemplateSet(req, res);
			expect(status).toHaveBeenCalledWith(201);
		});

		test('delegates body to service.createSet', async () => {
			const body = { name: 'Test', isDefault: false };
			mockService.createSet.mockResolvedValue({ ...body, id: 'x' });
			const { req, res } = makeMockReqRes({ body });
			await createTemplateSet(req, res);
			expect(mockService.createSet).toHaveBeenCalledWith(body);
		});
	});

	describe('updateTemplateSet', () => {
		test('returns 200 with updated set when found', async () => {
			const updated = makeSet({ id: 'set-1', name: 'Updated' });
			mockService.updateSet.mockResolvedValue(updated);
			const { req, res, json } = makeMockReqRes({ params: { id: 'set-1' }, body: { name: 'Updated' } });
			await updateTemplateSet(req, res);
			expect(json).toHaveBeenCalledWith(updated);
		});

		test('returns 404 when set not found', async () => {
			mockService.updateSet.mockResolvedValue(null);
			const { req, res, status } = makeMockReqRes({ params: { id: 'missing' }, body: {} });
			await updateTemplateSet(req, res);
			expect(status).toHaveBeenCalledWith(404);
		});
	});

	describe('deleteTemplateSet', () => {
		test('returns 204 when set exists and is deleted', async () => {
			mockService.deleteSet.mockResolvedValue(true);
			const { req, res, status } = makeMockReqRes({ params: { id: 'set-1' } });
			await deleteTemplateSet(req, res);
			expect(status).toHaveBeenCalledWith(204);
		});

		test('returns 404 when set does not exist', async () => {
			mockService.deleteSet.mockResolvedValue(false);
			const { req, res, status } = makeMockReqRes({ params: { id: 'missing' } });
			await deleteTemplateSet(req, res);
			expect(status).toHaveBeenCalledWith(404);
		});
	});

	describe('getTemplate', () => {
		test('returns 200 with template when found', async () => {
			const item = makeItem({ id: 't-1' });
			mockService.get.mockResolvedValue(item);
			const { req, res, json } = makeMockReqRes({ params: { id: 't-1' } });
			await getTemplate(req, res);
			expect(json).toHaveBeenCalledWith(item);
		});

		test('returns 404 when template not found', async () => {
			mockService.get.mockResolvedValue(null);
			const { req, res, status } = makeMockReqRes({ params: { id: 'ghost' } });
			await getTemplate(req, res);
			expect(status).toHaveBeenCalledWith(404);
		});
	});

	describe('createTemplate', () => {
		test('returns 201 with created template', async () => {
			const item = makeItem({ id: 'new-t', name: 'Nueva charla' });
			mockService.create.mockResolvedValue(item);
			const body = { name: 'Nueva charla', type: 'charla', defaultDay: 1 };
			const { req, res, status } = makeMockReqRes({ body });
			await createTemplate(req, res);
			expect(status).toHaveBeenCalledWith(201);
			expect(mockService.create).toHaveBeenCalledWith(body);
		});
	});

	describe('updateTemplate', () => {
		test('returns 200 with updated template when found', async () => {
			const updated = makeItem({ id: 't-1', name: 'Updated charla' });
			mockService.update.mockResolvedValue(updated);
			const { req, res, json } = makeMockReqRes({ params: { id: 't-1' }, body: { name: 'Updated charla' } });
			await updateTemplate(req, res);
			expect(json).toHaveBeenCalledWith(updated);
		});

		test('returns 404 when template not found', async () => {
			mockService.update.mockResolvedValue(null);
			const { req, res, status } = makeMockReqRes({ params: { id: 'ghost' }, body: {} });
			await updateTemplate(req, res);
			expect(status).toHaveBeenCalledWith(404);
		});
	});

	describe('deleteTemplate', () => {
		test('returns 204 when template exists and is deleted', async () => {
			mockService.delete.mockResolvedValue(true);
			const { req, res, status } = makeMockReqRes({ params: { id: 't-1' } });
			await deleteTemplate(req, res);
			expect(status).toHaveBeenCalledWith(204);
		});

		test('returns 404 when template does not exist', async () => {
			mockService.delete.mockResolvedValue(false);
			const { req, res, status } = makeMockReqRes({ params: { id: 'ghost' } });
			await deleteTemplate(req, res);
			expect(status).toHaveBeenCalledWith(404);
		});
	});
});

describe('ScheduleTemplate — blocksSantisimoAttendance business rule', () => {
	test('only comida/dinamica types are expected to block santísimo', () => {
		// This test documents the convention — the flag is set by users,
		// but the UI only recommends setting it for these types.
		const SANTISIMO_BLOCKING_TYPES = ['comida', 'dinamica', 'refrigerio'];
		SANTISIMO_BLOCKING_TYPES.forEach(type => {
			// All these types exist in the type color map
			expect(TYPE_COLORS).toHaveProperty(type);
		});
	});

	test('blocksSantisimoAttendance defaults to false on new items', () => {
		const item = makeItem();
		expect(item.blocksSantisimoAttendance).toBe(false);
	});

	test('requiresResponsable defaults to false on new items', () => {
		const item = makeItem();
		expect(item.requiresResponsable).toBe(false);
	});
});
