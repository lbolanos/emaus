import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { ref, watch, nextTick, effectScope } from 'vue';
import { createMockRetreat } from '@/test/utils';

vi.mock('@/services/api', () => ({
	api: {
		get: vi.fn(),
		post: vi.fn(),
		put: vi.fn(),
		delete: vi.fn(),
	},
}));

vi.mock('@repo/ui', () => ({
	useToast: () => ({ toast: vi.fn() }),
}));

/**
 * Regression tests for the two-retreat ping-pong loop.
 *
 * When a user has two retreats and localStorage holds a different retreatId
 * than the URL's route.params.id, the old code created an infinite loop:
 *
 *   1. route.params.id watcher (immediate) → loadRetreatData(routeId)
 *      → fetchRetreat → selectRetreat(routeId) → selectedRetreatId changes
 *   2. onMounted fires with selectedRetreatId from localStorage (different!)
 *      → loadRetreatData(storageId) passes the dedup guard (different id)
 *      → fetchRetreat → selectRetreat(storageId) → selectedRetreatId changes
 *   3. selectedRetreatId watcher sees change → loadRetreatData(storageId)
 *      → fetchRetreat → selectRetreat → back to step 1
 *
 * Fix: removed the redundant onMounted and changed the selectedRetreatId
 * watcher to navigate via router.replace instead of calling loadRetreatData.
 */
describe('Two-retreat ping-pong loop prevention', () => {
	let useRetreatStore: any;
	let retreatStore: any;
	let scope: ReturnType<typeof effectScope>;

	const retreatA = createMockRetreat({ id: 'retreat-a', name: 'Retreat A' });
	const retreatB = createMockRetreat({ id: 'retreat-b', name: 'Retreat B' });

	beforeEach(async () => {
		(window.localStorage as any)?._reset?.();
		setActivePinia(createPinia());
		const mod = await import('@/stores/retreatStore');
		useRetreatStore = mod.useRetreatStore;
		retreatStore = useRetreatStore();
		scope = effectScope();
		vi.clearAllMocks();
	});

	afterEach(() => {
		scope.stop();
		vi.restoreAllMocks();
	});

	/**
	 * Mirrors the fixed RetreatDashboardView: route.params.id watcher loads
	 * data, selectedRetreatId watcher only records navigation intent
	 * (simulated via routerReplaceCalls) instead of calling loadRetreatData.
	 */
	function setupFixedHarness(initialRouteId: string | null) {
		const routeParamsId = ref<string | null>(initialRouteId);
		const loadCalls: string[] = [];
		const routerReplaceCalls: string[] = [];
		let loadedRetreatId: string | null = null;

		const loadRetreatData = async (retreatId: string) => {
			if (loadedRetreatId === retreatId) return;
			loadedRetreatId = retreatId;
			loadCalls.push(retreatId);
			try {
				await retreatStore.fetchRetreat(retreatId);
			} catch (e) {
				loadedRetreatId = null;
				throw e;
			}
		};

		scope.run(() => {
			// Watcher 1: route.params.id (source of truth for which retreat to load)
			watch(
				routeParamsId,
				(newId, oldId) => {
					if (newId && newId !== oldId) {
						void loadRetreatData(newId);
					}
				},
				{ immediate: true },
			);

			// Watcher 2: selectedRetreatId — navigate, don't load directly
			watch(
				() => retreatStore.selectedRetreatId,
				(newId: string | null, oldId: string | null) => {
					if (newId && newId !== oldId && newId !== routeParamsId.value) {
						routerReplaceCalls.push(newId);
					}
				},
			);

			// NOTE: no onMounted — the immediate watcher handles the initial load
		});

		return { routeParamsId, loadCalls, routerReplaceCalls };
	}

	it('does not ping-pong when localStorage has a different retreat than the URL', async () => {
		const { api } = await import('@/services/api');
		(api.get as any).mockImplementation(async (url: string) => {
			if (url === `/retreats/${retreatA.id}`) return { data: retreatA };
			if (url === `/retreats/${retreatB.id}`) return { data: retreatB };
			throw new Error(`Unexpected url: ${url}`);
		});

		// Simulate: localStorage selected retreat-b, but URL points to retreat-a
		retreatStore.retreats = [retreatA, retreatB];
		retreatStore.selectRetreat(retreatB.id);

		const { loadCalls, routerReplaceCalls } = setupFixedHarness(retreatA.id);

		// Let all watchers settle
		for (let i = 0; i < 20; i++) await nextTick();

		// Should only load retreat-a (from the URL), NOT retreat-b
		expect(loadCalls).toEqual([retreatA.id]);

		// The selectedRetreatId watcher should have recorded a navigation intent
		// for retreat-b → retreat-a transition (but NOT triggered more loads)
		const retreatACalls = (api.get as any).mock.calls.filter(
			(c: any[]) => c[0] === `/retreats/${retreatA.id}`,
		);
		const retreatBCalls = (api.get as any).mock.calls.filter(
			(c: any[]) => c[0] === `/retreats/${retreatB.id}`,
		);

		expect(retreatACalls).toHaveLength(1);
		expect(retreatBCalls).toHaveLength(0);
	});

	it('total API calls stay bounded with two retreats', async () => {
		const { api } = await import('@/services/api');
		let callCount = 0;
		(api.get as any).mockImplementation(async (url: string) => {
			callCount++;
			if (callCount > 10) throw new Error('Too many API calls — loop detected');
			if (url === `/retreats/${retreatA.id}`) return { data: retreatA };
			if (url === `/retreats/${retreatB.id}`) return { data: retreatB };
			throw new Error(`Unexpected url: ${url}`);
		});

		retreatStore.retreats = [retreatA, retreatB];
		retreatStore.selectRetreat(retreatB.id);

		setupFixedHarness(retreatA.id);

		for (let i = 0; i < 30; i++) await nextTick();

		// With the fix, only 1 API call should be made (for the route retreat)
		expect(callCount).toBeLessThanOrEqual(2);
	});

	it('navigates via router when sidebar changes retreat instead of loading directly', async () => {
		const { api } = await import('@/services/api');
		(api.get as any).mockImplementation(async (url: string) => {
			if (url === `/retreats/${retreatA.id}`) return { data: retreatA };
			if (url === `/retreats/${retreatB.id}`) return { data: retreatB };
			throw new Error(`Unexpected url: ${url}`);
		});

		const { loadCalls, routerReplaceCalls } = setupFixedHarness(retreatA.id);

		for (let i = 0; i < 5; i++) await nextTick();

		// Simulate sidebar picking retreat-b
		retreatStore.selectRetreat(retreatB.id);
		for (let i = 0; i < 5; i++) await nextTick();

		// Should NOT have loaded retreat-b directly — instead recorded a router.replace intent
		expect(loadCalls).toEqual([retreatA.id]);
		expect(routerReplaceCalls).toContain(retreatB.id);
	});

	it('loads correctly when localStorage and URL agree on the same retreat', async () => {
		const { api } = await import('@/services/api');
		(api.get as any).mockImplementation(async (url: string) => {
			if (url === `/retreats/${retreatA.id}`) return { data: retreatA };
			throw new Error(`Unexpected url: ${url}`);
		});

		// Both localStorage and URL point to the same retreat
		retreatStore.retreats = [retreatA, retreatB];
		retreatStore.selectRetreat(retreatA.id);

		const { loadCalls, routerReplaceCalls } = setupFixedHarness(retreatA.id);

		for (let i = 0; i < 10; i++) await nextTick();

		expect(loadCalls).toEqual([retreatA.id]);
		expect(routerReplaceCalls).toEqual([]);
	});
});
