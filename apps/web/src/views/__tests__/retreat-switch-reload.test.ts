import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { ref, computed, watch, nextTick, effectScope } from 'vue';
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
 * Regression test for: "cuando estoy en registro y cambio de retiro no se actualiza".
 *
 * When a user switched retreats via the sidebar selector while on a retreat-scoped
 * route (reception, inventory, flyer, bed-assignments), the view kept showing stale
 * data for the old retreat because:
 *
 *   1. The sidebar selector only updated `retreatStore.selectedRetreatId` — the URL
 *      param `:id` stayed pointing to the old retreat.
 *   2. The views captured retreatId once in onMounted (or in a `const` at setup time)
 *      and never rewatched it.
 *
 * The fix has two parts:
 *   a) Sidebar watcher calls `router.replace` with the new :id when on a
 *      retreat-scoped route, so the URL actually changes.
 *   b) Each retreat-scoped view watches the retreatId (route param) and
 *      re-fetches when it changes.
 *
 * These tests mirror both pieces with lightweight harnesses (following the
 * pattern already used in RetreatDashboardView.two-retreats-loop.test.ts).
 */
describe('Retreat switch: URL + view reload', () => {
	let scope: ReturnType<typeof effectScope>;
	let useRetreatStore: any;
	let retreatStore: any;

	const retreatA = createMockRetreat({ id: 'retreat-a', name: 'Retreat A' });
	const retreatB = createMockRetreat({ id: 'retreat-b', name: 'Retreat B' });

	beforeEach(async () => {
		(window.localStorage as any)?._reset?.();
		setActivePinia(createPinia());
		const mod = await import('@/stores/retreatStore');
		useRetreatStore = mod.useRetreatStore;
		retreatStore = useRetreatStore();
		retreatStore.retreats = [retreatA, retreatB];
		scope = effectScope();
		vi.clearAllMocks();
	});

	afterEach(() => {
		scope.stop();
		vi.restoreAllMocks();
	});

	/**
	 * Mirrors the Sidebar fix: when selectedRetreatId changes AND we are on a
	 * retreat-scoped route whose :id differs, router.replace is called with
	 * the new id, keeping the URL in sync with the selected retreat.
	 */
	function setupSidebarHarness(opts: {
		requiresRetreat: boolean;
		routeName: string;
		initialRouteParamId: string | null;
	}) {
		const routeParamsId = ref<string | null>(opts.initialRouteParamId);
		const replaceCalls: Array<{ name: string; id: string }> = [];

		const route = {
			meta: { requiresRetreat: opts.requiresRetreat },
			name: opts.routeName,
			params: computed(() => ({ id: routeParamsId.value })),
			query: {},
		};

		const router = {
			replace: (dest: { name: string; params: { id: string } }) => {
				replaceCalls.push({ name: dest.name, id: dest.params.id });
				// Simulate the actual nav: URL param updates
				routeParamsId.value = dest.params.id;
				return Promise.resolve();
			},
		};

		scope.run(() => {
			watch(
				() => retreatStore.selectedRetreatId,
				(newId: string | null, oldId: string | null) => {
					if (!newId || newId === oldId) return;
					if (
						route.meta?.requiresRetreat &&
						route.params.value.id &&
						route.params.value.id !== newId
					) {
						router
							.replace({
								name: route.name as string,
								params: { id: newId },
							})
							.catch(() => {});
					}
				},
			);
		});

		return { routeParamsId, replaceCalls };
	}

	it('sidebar navigates via router.replace when switching retreats on retreat-scoped route', async () => {
		retreatStore.selectRetreat(retreatA.id);
		const { routeParamsId, replaceCalls } = setupSidebarHarness({
			requiresRetreat: true,
			routeName: 'reception',
			initialRouteParamId: retreatA.id,
		});

		await nextTick();
		retreatStore.selectRetreat(retreatB.id);
		for (let i = 0; i < 5; i++) await nextTick();

		expect(replaceCalls).toEqual([{ name: 'reception', id: retreatB.id }]);
		expect(routeParamsId.value).toBe(retreatB.id);
	});

	it('sidebar does NOT navigate when on a non-retreat-scoped route', async () => {
		retreatStore.selectRetreat(retreatA.id);
		const { replaceCalls } = setupSidebarHarness({
			requiresRetreat: false,
			routeName: 'profile',
			initialRouteParamId: null,
		});

		await nextTick();
		retreatStore.selectRetreat(retreatB.id);
		for (let i = 0; i < 5; i++) await nextTick();

		expect(replaceCalls).toHaveLength(0);
	});

	it('sidebar does NOT navigate when new id matches current route param', async () => {
		retreatStore.selectRetreat(retreatA.id);
		const { replaceCalls } = setupSidebarHarness({
			requiresRetreat: true,
			routeName: 'reception',
			initialRouteParamId: retreatA.id,
		});

		await nextTick();
		// "Select" the same retreat — no-op
		retreatStore.selectRetreat(retreatA.id);
		for (let i = 0; i < 5; i++) await nextTick();

		expect(replaceCalls).toHaveLength(0);
	});

	/**
	 * Mirrors the per-view fix (RecepcionView / InventoryView / BedAssignmentsView /
	 * RetreatFlyerView): when the :id route param changes, re-run the data load.
	 */
	function setupViewHarness(initialRouteParamId: string) {
		const routeParamsId = ref<string>(initialRouteParamId);
		const retreatId = computed(() => routeParamsId.value);
		const loadCalls: string[] = [];
		const unsubscribeCalls: string[] = [];
		const subscribeCalls: string[] = [];

		async function loadForRetreat(id: string) {
			if (!id) return;
			loadCalls.push(id);
			// Simulate RecepcionView's socket re-subscription flow
			if (subscribeCalls.length > 0) {
				unsubscribeCalls.push(subscribeCalls[subscribeCalls.length - 1]);
			}
			subscribeCalls.push(id);
		}

		scope.run(() => {
			// Initial load (onMounted-equivalent)
			void loadForRetreat(retreatId.value);

			watch(retreatId, async (id, prev) => {
				if (id && id !== prev) await loadForRetreat(id);
			});
		});

		return { routeParamsId, loadCalls, unsubscribeCalls, subscribeCalls };
	}

	it('view re-fetches data when retreatId (route param) changes', async () => {
		const { routeParamsId, loadCalls } = setupViewHarness(retreatA.id);
		await nextTick();

		expect(loadCalls).toEqual([retreatA.id]);

		routeParamsId.value = retreatB.id;
		for (let i = 0; i < 5; i++) await nextTick();

		expect(loadCalls).toEqual([retreatA.id, retreatB.id]);
	});

	it('view unsubscribes from old retreat realtime channel before subscribing to new', async () => {
		const { routeParamsId, unsubscribeCalls, subscribeCalls } = setupViewHarness(retreatA.id);
		await nextTick();

		routeParamsId.value = retreatB.id;
		for (let i = 0; i < 5; i++) await nextTick();

		expect(subscribeCalls).toEqual([retreatA.id, retreatB.id]);
		expect(unsubscribeCalls).toEqual([retreatA.id]);
	});

	it('view ignores no-op updates where retreatId stays the same', async () => {
		const { routeParamsId, loadCalls } = setupViewHarness(retreatA.id);
		await nextTick();

		// Trigger by setting same value
		routeParamsId.value = retreatA.id;
		for (let i = 0; i < 5; i++) await nextTick();

		expect(loadCalls).toEqual([retreatA.id]);
	});

	it('end-to-end: sidebar + view together reload after retreat switch', async () => {
		retreatStore.selectRetreat(retreatA.id);

		// Shared route param ref between sidebar and view harnesses
		const routeParamsId = ref<string>(retreatA.id);
		const retreatId = computed(() => routeParamsId.value);
		const loadCalls: string[] = [];
		const replaceCalls: string[] = [];

		const route = {
			meta: { requiresRetreat: true },
			name: 'reception',
			params: computed(() => ({ id: routeParamsId.value })),
			query: {},
		};
		const router = {
			replace: (dest: { name: string; params: { id: string } }) => {
				replaceCalls.push(dest.params.id);
				routeParamsId.value = dest.params.id;
				return Promise.resolve();
			},
		};

		async function loadForRetreat(id: string) {
			if (!id) return;
			loadCalls.push(id);
		}

		scope.run(() => {
			// Sidebar watcher
			watch(
				() => retreatStore.selectedRetreatId,
				(newId: string | null, oldId: string | null) => {
					if (!newId || newId === oldId) return;
					if (
						route.meta?.requiresRetreat &&
						route.params.value.id &&
						route.params.value.id !== newId
					) {
						void router.replace({ name: route.name, params: { id: newId } });
					}
				},
			);
			// View watcher
			void loadForRetreat(retreatId.value);
			watch(retreatId, async (id, prev) => {
				if (id && id !== prev) await loadForRetreat(id);
			});
		});

		await nextTick();
		expect(loadCalls).toEqual([retreatA.id]);

		// User switches retreat in sidebar
		retreatStore.selectRetreat(retreatB.id);
		for (let i = 0; i < 10; i++) await nextTick();

		expect(replaceCalls).toEqual([retreatB.id]);
		expect(loadCalls).toEqual([retreatA.id, retreatB.id]);
	});
});
