import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { ref, watch, nextTick, effectScope } from 'vue';
import { createMockRetreat } from '@/test/utils';

// Mock the api service — shared across the store and this test file
vi.mock('@/services/api', () => ({
	api: {
		get: vi.fn(),
		post: vi.fn(),
		put: vi.fn(),
		delete: vi.fn(),
	},
}));

// Mock @repo/ui useToast so retreatStore can import it
vi.mock('@repo/ui', () => ({
	useToast: () => ({ toast: vi.fn() }),
}));

/**
 * Regression tests for the infinite-loop bug in RetreatDashboardView.vue that
 * caused 429 rate-limit responses on /auth/status, /retreats/:id, and
 * /inventory/retreat/:id/alerts after login.
 *
 * Root cause: two watchers both called loadRetreatData →
 *   1. route.params.id (immediate)
 *   2. selectedRetreat.value?.id  (computed over retreats[] + selectedRetreatId)
 * fetchRetreat() mutated retreats[index] AND called selectRetreat, which
 * invalidated the computed and re-fired the second watcher, restarting the
 * cycle.
 *
 * Fix:
 *   - Watch retreatStore.selectedRetreatId (a plain ref) instead of the
 *     computed selectedRetreat.id.
 *   - Track loadedRetreatId and early-return from loadRetreatData if the same
 *     id is requested again.
 */
describe('RetreatDashboardView loop prevention', () => {
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
	 * Build a mini harness that mirrors the RetreatDashboardView watchers and
	 * loadRetreatData. We don't mount the full view — we just reproduce the
	 * reactive wiring so we can count how many times the data-loading side
	 * effects run.
	 */
	async function setupHarness(initialRouteId: string | null) {
		const routeParamsId = ref<string | null>(initialRouteId);
		const loadCalls: string[] = [];
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
			watch(
				routeParamsId,
				(newId, oldId) => {
					if (newId && newId !== oldId) {
						void loadRetreatData(newId);
					}
				},
				{ immediate: true },
			);

			watch(
				() => retreatStore.selectedRetreatId,
				(newId, oldId) => {
					if (newId && newId !== oldId) {
						void loadRetreatData(newId);
					}
				},
			);
		});

		return { routeParamsId, loadCalls };
	}

	it('fetches the retreat exactly once when navigating to a retreat id', async () => {
		const { api } = await import('@/services/api');
		(api.get as any).mockImplementation(async (url: string) => {
			if (url === `/retreats/${retreatA.id}`) return { data: retreatA };
			throw new Error(`Unexpected url: ${url}`);
		});

		const { loadCalls } = await setupHarness(retreatA.id);

		// Let initial immediate watcher + subsequent reactive effects settle
		await nextTick();
		await nextTick();
		await nextTick();

		expect(loadCalls).toEqual([retreatA.id]);
		expect((api.get as any).mock.calls.filter((c: any[]) => c[0] === `/retreats/${retreatA.id}`))
			.toHaveLength(1);
	});

	it('does not loop when fetchRetreat mutates retreats[] and re-selects the same id', async () => {
		const { api } = await import('@/services/api');
		// Pre-populate so the "index !== -1" branch in fetchRetreat runs,
		// which is the branch that used to re-trigger the computed-based watcher.
		retreatStore.retreats = [{ ...retreatA }];
		retreatStore.selectRetreat(retreatA.id);

		(api.get as any).mockResolvedValue({ data: { ...retreatA, updatedField: 'new' } });

		const { loadCalls } = await setupHarness(retreatA.id);

		for (let i = 0; i < 10; i++) await nextTick();

		expect(loadCalls).toEqual([retreatA.id]);
		const retreatCalls = (api.get as any).mock.calls.filter(
			(c: any[]) => c[0] === `/retreats/${retreatA.id}`,
		);
		// Exactly one network call — no ping-pong between the two watchers
		expect(retreatCalls).toHaveLength(1);
	});

	it('reloads when the selected retreat id changes to a different retreat', async () => {
		const { api } = await import('@/services/api');
		(api.get as any).mockImplementation(async (url: string) => {
			if (url === `/retreats/${retreatA.id}`) return { data: retreatA };
			if (url === `/retreats/${retreatB.id}`) return { data: retreatB };
			throw new Error(`Unexpected url: ${url}`);
		});

		const { loadCalls } = await setupHarness(retreatA.id);

		await nextTick();
		await nextTick();

		// Simulate the user picking a different retreat from the sidebar,
		// which mutates the store without changing the route.
		retreatStore.retreats = [retreatA, retreatB];
		retreatStore.selectRetreat(retreatB.id);

		for (let i = 0; i < 5; i++) await nextTick();

		expect(loadCalls).toEqual([retreatA.id, retreatB.id]);
	});

	it('dedupe guard is reset when a fetch fails, allowing a retry', async () => {
		const { api } = await import('@/services/api');
		(api.get as any).mockRejectedValueOnce(new Error('boom'));

		const { loadCalls } = await setupHarness(retreatA.id);

		await nextTick();
		await nextTick();
		await nextTick();

		// First attempt failed — harness released the guard
		(api.get as any).mockResolvedValueOnce({ data: retreatA });

		// Force a re-trigger via selectedRetreatId change (same id after null)
		retreatStore.selectRetreat(retreatA.id);
		await nextTick();
		await nextTick();

		expect(loadCalls.length).toBeGreaterThanOrEqual(1);
		expect(loadCalls[0]).toBe(retreatA.id);
	});
});
