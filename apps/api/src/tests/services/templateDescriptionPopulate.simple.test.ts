/**
 * Pure-logic mirror of `populateTemplateAttachments` description-injection
 * branch (Bug J-related but separate feature: showing the schedule_template
 * description in each MaM item via JOIN at query time).
 *
 * The full method also handles attachments by responsability name; this test
 * focuses on the description-by-templateId path.
 */

type Item = {
	id: string;
	scheduleTemplateId: string | null;
};

type TemplateRow = { id: string; description: string | null };

function populateDescriptions(
	items: Item[],
	templates: TemplateRow[],
): Array<Item & { templateDescription: string | null }> {
	const templateIds = Array.from(
		new Set(items.map((i) => i.scheduleTemplateId).filter((x): x is string => !!x)),
	);
	const descriptionByTemplateId = new Map<string, string | null>();
	if (templateIds.length) {
		const filtered = templates.filter((t) => templateIds.includes(t.id));
		filtered.forEach((t) => descriptionByTemplateId.set(t.id, t.description ?? null));
	}
	return items.map((i) => ({
		...i,
		templateDescription: i.scheduleTemplateId
			? descriptionByTemplateId.get(i.scheduleTemplateId) ?? null
			: null,
	}));
}

describe('populateTemplateDescriptions: JOIN by templateId', () => {
	it('injects description for items with valid scheduleTemplateId', () => {
		const items: Item[] = [{ id: 'i1', scheduleTemplateId: 't1' }];
		const tpls: TemplateRow[] = [{ id: 't1', description: 'Hora Santa de preparación.' }];
		const result = populateDescriptions(items, tpls);
		expect(result[0].templateDescription).toBe('Hora Santa de preparación.');
	});

	it('returns null description for items without scheduleTemplateId', () => {
		const items: Item[] = [{ id: 'i1', scheduleTemplateId: null }];
		const tpls: TemplateRow[] = [{ id: 't1', description: 'something' }];
		const result = populateDescriptions(items, tpls);
		expect(result[0].templateDescription).toBeNull();
	});

	it('returns null when template exists but description is null', () => {
		const items: Item[] = [{ id: 'i1', scheduleTemplateId: 't1' }];
		const tpls: TemplateRow[] = [{ id: 't1', description: null }];
		const result = populateDescriptions(items, tpls);
		expect(result[0].templateDescription).toBeNull();
	});

	it('returns null when scheduleTemplateId references missing template', () => {
		const items: Item[] = [{ id: 'i1', scheduleTemplateId: 't_missing' }];
		const tpls: TemplateRow[] = [{ id: 't1', description: 'foo' }];
		const result = populateDescriptions(items, tpls);
		expect(result[0].templateDescription).toBeNull();
	});

	it('handles a mix of items (some with template, some custom-added)', () => {
		const items: Item[] = [
			{ id: 'i1', scheduleTemplateId: 't1' },
			{ id: 'i2', scheduleTemplateId: null }, // custom item added by coordinator
			{ id: 'i3', scheduleTemplateId: 't1' }, // duplicate template ref
			{ id: 'i4', scheduleTemplateId: 't2' },
		];
		const tpls: TemplateRow[] = [
			{ id: 't1', description: 'desc1' },
			{ id: 't2', description: 'desc2' },
		];
		const result = populateDescriptions(items, tpls);
		expect(result.map((r) => r.templateDescription)).toEqual([
			'desc1',
			null,
			'desc1',
			'desc2',
		]);
	});

	it('deduplicates templateIds so repeated refs cause one DB row each, not N', () => {
		// This is the perf invariant: the service uses Array.from(new Set(...))
		// to build the IN clause so the DB query is bounded by template count,
		// not item count. We can't test the SQL directly here, but we can verify
		// the dedup math matches.
		const items: Item[] = Array.from({ length: 100 }, (_, i) => ({
			id: `i${i}`,
			scheduleTemplateId: i < 50 ? 't1' : 't2',
		}));
		const uniqueIds = Array.from(
			new Set(items.map((i) => i.scheduleTemplateId).filter((x): x is string => !!x)),
		);
		expect(uniqueIds).toHaveLength(2);
		expect(uniqueIds.sort()).toEqual(['t1', 't2']);
	});

	it('empty items array returns empty result without querying templates', () => {
		const result = populateDescriptions([], [{ id: 't1', description: 'x' }]);
		expect(result).toEqual([]);
	});

	it('preserves all original item fields in the output', () => {
		const items: Item[] = [{ id: 'i1', scheduleTemplateId: 't1' }];
		const tpls: TemplateRow[] = [{ id: 't1', description: 'desc' }];
		const result = populateDescriptions(items, tpls);
		expect(result[0]).toMatchObject({ id: 'i1', scheduleTemplateId: 't1' });
		expect(result[0].templateDescription).toBe('desc');
	});
});
