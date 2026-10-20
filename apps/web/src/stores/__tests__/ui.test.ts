import { describe, it, expect, beforeEach } from 'vitest';
import { nextTick } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { useUIStore } from '../ui';

describe('useUIStore — sidebar accordion', () => {
	beforeEach(() => {
		localStorage.clear();
		setActivePinia(createPinia());
	});

	const readPersistedSections = (): Record<string, boolean> =>
		JSON.parse(localStorage.getItem('sidebar-collapsed-sections') || 'null');

	it('seeds categories missing from a stale saved record as collapsed', () => {
		// Pre-store record: 'logistics' (or any newer section) is missing.
		localStorage.setItem(
			'sidebar-collapsed-sections',
			JSON.stringify({ main: true, people: false }),
		);

		const store = useUIStore();
		store.initSidebarAccordion(['main', 'people', 'logistics']);

		expect(store.collapsedSections).toEqual({ main: true, people: false, logistics: true });
		// The seeded record is persisted back so the next mount starts in sync.
		expect(readPersistedSections()).toEqual(store.collapsedSections);
	});

	it('collapses every section when no record exists', () => {
		const store = useUIStore();
		store.initSidebarAccordion(['main', 'people', 'logistics']);

		expect(store.collapsedSections).toEqual({ main: true, people: true, logistics: true });
		expect(readPersistedSections()).toEqual(store.collapsedSections);
	});

	it('repairs a record with more than one open section, keeping the first', () => {
		localStorage.setItem(
			'sidebar-collapsed-sections',
			JSON.stringify({ main: false, people: false, logistics: true }),
		);

		const store = useUIStore();
		store.initSidebarAccordion(['main', 'people', 'logistics']);

		expect(store.collapsedSections).toEqual({ main: false, people: true, logistics: true });
	});

	it('is idempotent: a second init with the same categories changes nothing', () => {
		localStorage.setItem(
			'sidebar-collapsed-sections',
			JSON.stringify({ main: true, people: false }),
		);

		const store = useUIStore();
		store.initSidebarAccordion(['main', 'people', 'logistics']);
		const afterFirst = { ...store.collapsedSections };

		store.initSidebarAccordion(['main', 'people', 'logistics']);

		expect(store.collapsedSections).toEqual(afterFirst);
	});

	it('falls back to all collapsed when the saved record is corrupt', () => {
		localStorage.setItem('sidebar-collapsed-sections', '{not json');

		const store = useUIStore();
		store.initSidebarAccordion(['main', 'people']);

		expect(store.collapsedSections).toEqual({ main: true, people: true });
	});

	it('keeps at most one section open across toggles', () => {
		const store = useUIStore();
		store.initSidebarAccordion(['main', 'people', 'logistics']);

		expect(store.toggleSidebarSection('main')).toBe(true);
		expect(store.toggleSidebarSection('people')).toBe(true);

		const open = Object.entries(store.collapsedSections)
			.filter(([, collapsed]) => !collapsed)
			.map(([category]) => category);
		expect(open).toEqual(['people']);
		// The toggle result and the record agree, and it is persisted.
		expect(readPersistedSections()).toEqual(store.collapsedSections);
	});

	it('returns false and collapses everything when closing the open section', () => {
		const store = useUIStore();
		store.initSidebarAccordion(['main', 'people']);
		store.toggleSidebarSection('main');

		expect(store.toggleSidebarSection('main')).toBe(false);
		expect(Object.values(store.collapsedSections).every(Boolean)).toBe(true);
	});

	it('toggleRetreatGroup collapses all sections when the group opens', () => {
		const store = useUIStore();
		store.initSidebarAccordion(['main', 'people']);
		store.toggleSidebarSection('main');
		// Group starts expanded (default false): first toggle collapses it.
		store.toggleRetreatGroup();
		expect(store.isRetreatGroupCollapsed).toBe(true);

		store.toggleRetreatGroup();

		expect(store.isRetreatGroupCollapsed).toBe(false);
		expect(store.collapsedSections.main).toBe(true);
		expect(store.collapsedSections.people).toBe(true);
	});

	it('reads and persists the retreat group state', async () => {
		localStorage.setItem('sidebar-retreat-group-collapsed', 'true');

		const store = useUIStore();
		expect(store.isRetreatGroupCollapsed).toBe(true);

		store.toggleRetreatGroup();
		// The persistence watch flushes on the next tick.
		await nextTick();
		expect(localStorage.getItem('sidebar-retreat-group-collapsed')).toBe('false');
	});

	it('favorites section: expanded by default, toggle persists', async () => {
		const store = useUIStore();
		expect(store.favoritesCollapsed).toBe(false);

		store.toggleFavoritesSection();
		expect(store.favoritesCollapsed).toBe(true);
		// The persistence watch flushes on the next tick.
		await nextTick();
		expect(localStorage.getItem('sidebar-favorites-collapsed')).toBe('true');
	});

	it('folds favorites when a section opens', () => {
		const store = useUIStore();
		store.initSidebarAccordion(['main', 'people']);
		// No open sections → favorites keeps its default expanded state.
		expect(store.favoritesCollapsed).toBe(false);

		store.toggleSidebarSection('main');
		expect(store.favoritesCollapsed).toBe(true);

		// Closing that section does not silently re-expand favorites.
		store.toggleSidebarSection('main');
		expect(store.favoritesCollapsed).toBe(true);
	});

	it('folds favorites when the retreat group opens', () => {
		const store = useUIStore();
		store.initSidebarAccordion(['main', 'people']);

		store.toggleRetreatGroup(); // group starts expanded: collapsing it leaves favorites alone
		expect(store.favoritesCollapsed).toBe(false);

		store.toggleRetreatGroup(); // opening the group folds favorites
		expect(store.favoritesCollapsed).toBe(true);
	});

	it('opening favorites collapses the retreat group and every open section', () => {
		const store = useUIStore();
		store.initSidebarAccordion(['main', 'people']);
		store.toggleSidebarSection('main'); // main open → favorites folded

		store.toggleFavoritesSection(); // expand favorites → everything else folds

		expect(store.favoritesCollapsed).toBe(false);
		expect(store.collapsedSections.main).toBe(true);
		expect(store.collapsedSections.people).toBe(true);
		expect(store.isRetreatGroupCollapsed).toBe(true);
		// Favorites never leaks into the sections record (own storage key).
		expect('favorites' in store.collapsedSections).toBe(false);
	});

	it('init folds favorites when the saved record has a section open (legacy state)', () => {
		// Legal before favorites joined the full accordion: a section open AND
		// favorites expanded. initSidebarAccordion repairs it to one panel.
		localStorage.setItem('sidebar-collapsed-sections', JSON.stringify({ main: false }));
		localStorage.setItem('sidebar-favorites-collapsed', 'false');

		const store = useUIStore();
		store.initSidebarAccordion(['main', 'people']);

		expect(store.favoritesCollapsed).toBe(true);
	});
});
