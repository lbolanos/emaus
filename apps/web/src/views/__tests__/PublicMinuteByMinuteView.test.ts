/**
 * UI tests for PublicMinuteByMinuteView (vista pública big-screen).
 *
 * Covers the auth-less view used by `/mam/:slug`:
 *   - Initial load and 404 handling
 *   - AHORA banner: prefers explicit `status: 'active'`, fallbacks to time-window
 *   - Upcoming list: top 5 items, excludes AHORA, excludes completed/skipped
 *   - Active day calculation: prefers day containing `now`, fallbacks
 *     forward/backward
 *   - Polling: setInterval + clear on unmount
 *   - PII stripping verified server-side, but here we verify the view
 *     doesn't render anything that wasn't in the API payload
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { nextTick } from 'vue';

const apiPublic = vi.fn();
vi.mock('@/services/api', () => ({
	retreatScheduleApi: {
		publicGetMam: (...a: any[]) => apiPublic(...a),
	},
}));

vi.mock('@repo/ui', () => ({
	useToast: () => ({ toast: vi.fn() }),
}));

// Mock realtime socket — record subscribe calls + expose a way to fire
// events back to the component for assertion of WS-driven updates.
const socketHandlers = new Map<string, (...args: any[]) => void>();
const socketEmits: Array<{ event: string; args: any[] }> = [];
const fakeSocket = {
	connected: true,
	on: (event: string, handler: (...args: any[]) => void) => {
		socketHandlers.set(event, handler);
	},
	off: (event: string) => {
		socketHandlers.delete(event);
	},
	emit: (event: string, ...args: any[]) => {
		socketEmits.push({ event, args });
		// public:schedule:subscribe expects the server to invoke the ack with
		// {ok:true, retreatId}. Mirror that here so the component proceeds.
		if (event === 'public:schedule:subscribe') {
			const ack = args[args.length - 1];
			if (typeof ack === 'function') ack({ ok: true, retreatId: 'r1' });
		}
	},
};
vi.mock('@/services/realtime', () => ({
	getSocket: () => fakeSocket,
}));

function fireEvent(event: string, ...args: any[]): void {
	socketHandlers.get(event)?.(...args);
}

import PublicMinuteByMinuteView from '../PublicMinuteByMinuteView.vue';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeItem(overrides: Partial<any> = {}) {
	return {
		id: overrides.id ?? 'i1',
		day: overrides.day ?? 1,
		startTime: overrides.startTime ?? '2026-04-26T08:00:00.000Z',
		endTime: overrides.endTime ?? '2026-04-26T08:30:00.000Z',
		durationMinutes: overrides.durationMinutes ?? 30,
		name: overrides.name ?? 'Bienvenida',
		type: overrides.type ?? 'logistica',
		status: overrides.status ?? 'pending',
		location: overrides.location ?? null,
		responsabilityName: overrides.responsabilityName ?? null,
	};
}

function makeData(items: any[]) {
	return {
		retreat: {
			id: 'r1',
			parish: 'Parroquia Santa Cruz',
			startDate: '2026-04-26T00:00:00.000Z',
			endDate: '2026-04-28T23:59:59.000Z',
		},
		items,
	};
}

async function mountView(slug = 'mi-retiro') {
	const wrapper = mount(PublicMinuteByMinuteView, { props: { slug } });
	await flushPromises();
	await nextTick();
	return wrapper;
}

beforeEach(() => {
	vi.useFakeTimers();
	apiPublic.mockReset();
	socketHandlers.clear();
	socketEmits.length = 0;
});

afterEach(() => {
	vi.useRealTimers();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('PublicMinuteByMinuteView — initial load', () => {
	it('calls publicGetMam with the slug prop', async () => {
		apiPublic.mockResolvedValueOnce(makeData([]));
		await mountView('san-judas-tadeo');
		expect(apiPublic).toHaveBeenCalledWith('san-judas-tadeo');
	});

	it('renders the parish name', async () => {
		apiPublic.mockResolvedValueOnce(makeData([]));
		const wrapper = await mountView();
		expect(wrapper.text()).toContain('Parroquia Santa Cruz');
	});

	it('shows error message on 404 (private retreat or missing)', async () => {
		apiPublic.mockRejectedValueOnce({ response: { status: 404 } });
		const wrapper = await mountView('does-not-exist');
		expect(wrapper.text()).toContain('no existe o no es público');
	});

	it('shows generic error on other API failures', async () => {
		apiPublic.mockRejectedValueOnce({ message: 'Network down' });
		const wrapper = await mountView();
		expect(wrapper.text()).toContain('No se pudo cargar');
	});
});

describe('PublicMinuteByMinuteView — AHORA banner', () => {
	it('shows AHORA when an item has status=active', async () => {
		// Set "now" to 12:00 UTC on day 1
		vi.setSystemTime(new Date('2026-04-26T12:00:00.000Z'));
		apiPublic.mockResolvedValueOnce(
			makeData([
				makeItem({
					id: 'active',
					day: 1,
					startTime: '2026-04-26T11:00:00.000Z',
					endTime: '2026-04-26T13:00:00.000Z',
					name: 'Charla actual',
					status: 'active',
				}),
			]),
		);
		const wrapper = await mountView();
		expect(wrapper.text()).toContain('AHORA');
		expect(wrapper.text()).toContain('Charla actual');
	});

	it('falls back to time-window when no item is explicitly active', async () => {
		vi.setSystemTime(new Date('2026-04-26T12:30:00.000Z'));
		apiPublic.mockResolvedValueOnce(
			makeData([
				makeItem({
					id: 'pending-but-now',
					day: 1,
					startTime: '2026-04-26T12:00:00.000Z',
					endTime: '2026-04-26T13:00:00.000Z',
					name: 'En su slot',
					status: 'pending',
				}),
			]),
		);
		const wrapper = await mountView();
		expect(wrapper.text()).toContain('AHORA');
		expect(wrapper.text()).toContain('En su slot');
	});

	it('does NOT show AHORA when no item is in its slot AND none is active', async () => {
		vi.setSystemTime(new Date('2026-04-26T05:00:00.000Z')); // before all items
		apiPublic.mockResolvedValueOnce(
			makeData([
				makeItem({
					id: 'future',
					day: 1,
					startTime: '2026-04-26T08:00:00.000Z',
					endTime: '2026-04-26T08:30:00.000Z',
					status: 'pending',
				}),
			]),
		);
		const wrapper = await mountView();
		// The "AHORA" header doesn't render — only the transition state
		const text = wrapper.text();
		expect(text.includes('AHORA · ')).toBe(false);
	});

	it('shows responsability name and location when present in the active item', async () => {
		vi.setSystemTime(new Date('2026-04-26T12:00:00.000Z'));
		apiPublic.mockResolvedValueOnce(
			makeData([
				makeItem({
					id: 'a',
					day: 1,
					startTime: '2026-04-26T11:00:00.000Z',
					endTime: '2026-04-26T13:00:00.000Z',
					status: 'active',
					responsabilityName: 'Charlista: rosa',
					location: 'Capilla',
				}),
			]),
		);
		const wrapper = await mountView();
		expect(wrapper.text()).toContain('Charlista: rosa');
		expect(wrapper.text()).toContain('Capilla');
	});
});

describe('PublicMinuteByMinuteView — upcoming list', () => {
	it('lists items after AHORA, sorted by startTime, max 5', async () => {
		vi.setSystemTime(new Date('2026-04-26T12:00:00.000Z'));
		apiPublic.mockResolvedValueOnce(
			makeData([
				makeItem({
					id: 'now',
					day: 1,
					startTime: '2026-04-26T11:00:00.000Z',
					endTime: '2026-04-26T13:00:00.000Z',
					status: 'active',
					name: 'Active item',
				}),
				makeItem({
					id: 'p1',
					day: 1,
					startTime: '2026-04-26T13:00:00.000Z',
					endTime: '2026-04-26T13:30:00.000Z',
					name: 'Upcoming 1',
				}),
				makeItem({
					id: 'p2',
					day: 1,
					startTime: '2026-04-26T14:00:00.000Z',
					endTime: '2026-04-26T14:30:00.000Z',
					name: 'Upcoming 2',
				}),
				makeItem({
					id: 'p3',
					day: 1,
					startTime: '2026-04-26T15:00:00.000Z',
					endTime: '2026-04-26T15:30:00.000Z',
					name: 'Upcoming 3',
				}),
				makeItem({
					id: 'p4',
					day: 1,
					startTime: '2026-04-26T16:00:00.000Z',
					endTime: '2026-04-26T16:30:00.000Z',
					name: 'Upcoming 4',
				}),
				makeItem({
					id: 'p5',
					day: 1,
					startTime: '2026-04-26T17:00:00.000Z',
					endTime: '2026-04-26T17:30:00.000Z',
					name: 'Upcoming 5',
				}),
				makeItem({
					id: 'p6',
					day: 1,
					startTime: '2026-04-26T18:00:00.000Z',
					endTime: '2026-04-26T18:30:00.000Z',
					name: 'Upcoming 6 (should NOT appear)',
				}),
			]),
		);
		const wrapper = await mountView();
		expect(wrapper.text()).toContain('Upcoming 1');
		expect(wrapper.text()).toContain('Upcoming 5');
		expect(wrapper.text()).not.toContain('Upcoming 6');
	});

	it('excludes completed items from upcoming', async () => {
		vi.setSystemTime(new Date('2026-04-26T12:00:00.000Z'));
		apiPublic.mockResolvedValueOnce(
			makeData([
				makeItem({
					id: 'done',
					day: 1,
					startTime: '2026-04-26T13:00:00.000Z',
					endTime: '2026-04-26T13:30:00.000Z',
					status: 'completed',
					name: 'Already done',
				}),
				makeItem({
					id: 'next',
					day: 1,
					startTime: '2026-04-26T14:00:00.000Z',
					endTime: '2026-04-26T14:30:00.000Z',
					status: 'pending',
					name: 'Next up',
				}),
			]),
		);
		const wrapper = await mountView();
		expect(wrapper.text()).toContain('Next up');
		expect(wrapper.text()).not.toContain('Already done');
	});

	it('excludes skipped items from upcoming', async () => {
		vi.setSystemTime(new Date('2026-04-26T12:00:00.000Z'));
		apiPublic.mockResolvedValueOnce(
			makeData([
				makeItem({
					id: 'sk',
					day: 1,
					startTime: '2026-04-26T13:00:00.000Z',
					endTime: '2026-04-26T13:30:00.000Z',
					status: 'skipped',
					name: 'Cancelled',
				}),
				makeItem({
					id: 'np',
					day: 1,
					startTime: '2026-04-26T14:00:00.000Z',
					endTime: '2026-04-26T14:30:00.000Z',
					status: 'pending',
					name: 'Real next',
				}),
			]),
		);
		const wrapper = await mountView();
		expect(wrapper.text()).toContain('Real next');
		expect(wrapper.text()).not.toContain('Cancelled');
	});

	it('shows "+Nm" minutes-until label per upcoming item', async () => {
		vi.setSystemTime(new Date('2026-04-26T12:00:00.000Z'));
		apiPublic.mockResolvedValueOnce(
			makeData([
				makeItem({
					id: 'p1',
					day: 1,
					// 15 minutes from now
					startTime: '2026-04-26T12:15:00.000Z',
					endTime: '2026-04-26T12:45:00.000Z',
				}),
			]),
		);
		const wrapper = await mountView();
		expect(wrapper.text()).toContain('+15m');
	});
});

describe('PublicMinuteByMinuteView — completed counter', () => {
	it('shows "Completados hoy: N / total" of the active day', async () => {
		vi.setSystemTime(new Date('2026-04-26T12:00:00.000Z'));
		apiPublic.mockResolvedValueOnce(
			makeData([
				makeItem({ id: '1', day: 1, status: 'completed' }),
				makeItem({ id: '2', day: 1, status: 'completed' }),
				makeItem({
					id: '3',
					day: 1,
					startTime: '2026-04-26T14:00:00.000Z',
					endTime: '2026-04-26T14:30:00.000Z',
					status: 'pending',
				}),
			]),
		);
		const wrapper = await mountView();
		expect(wrapper.text()).toMatch(/Completados hoy:\s*2\s*\/\s*3/);
	});
});

describe('PublicMinuteByMinuteView — polling fallback', () => {
	it('falls back to a 60s poll (the WS push is the primary path)', async () => {
		apiPublic.mockResolvedValue(makeData([]));
		await mountView();
		expect(apiPublic).toHaveBeenCalledTimes(1);
		await vi.advanceTimersByTimeAsync(60_000);
		expect(apiPublic).toHaveBeenCalledTimes(2);
		await vi.advanceTimersByTimeAsync(60_000);
		expect(apiPublic).toHaveBeenCalledTimes(3);
	});

	it('stops polling when unmounted', async () => {
		apiPublic.mockResolvedValue(makeData([]));
		const wrapper = await mountView();
		expect(apiPublic).toHaveBeenCalledTimes(1);
		wrapper.unmount();
		await vi.advanceTimersByTimeAsync(120_000);
		expect(apiPublic).toHaveBeenCalledTimes(1);
	});
});

describe('PublicMinuteByMinuteView — WebSocket realtime', () => {
	it('subscribes to public:schedule:subscribe with the slug on mount', async () => {
		apiPublic.mockResolvedValue(makeData([]));
		await mountView('mi-retiro');
		const sub = socketEmits.find((e) => e.event === 'public:schedule:subscribe');
		expect(sub).toBeTruthy();
		expect(sub!.args[0]).toBe('mi-retiro');
	});

	it('shows "● en vivo" when WS subscribe ack returns ok=true', async () => {
		apiPublic.mockResolvedValue(makeData([]));
		const wrapper = await mountView();
		await vi.advanceTimersByTimeAsync(0);
		expect(wrapper.text()).toContain('en vivo');
	});

	it('schedule:item-started flips item.status to active without a refetch', async () => {
		vi.setSystemTime(new Date('2026-04-26T12:00:00.000Z'));
		apiPublic.mockResolvedValue(
			makeData([
				makeItem({ id: 'i1', day: 1, status: 'pending', name: 'Item 1' }),
				makeItem({
					id: 'i2',
					day: 1,
					startTime: '2026-04-26T13:00:00.000Z',
					endTime: '2026-04-26T13:30:00.000Z',
					status: 'pending',
					name: 'Item 2',
				}),
			]),
		);
		const wrapper = await mountView();
		const callsBeforeEvent = apiPublic.mock.calls.length;
		fireEvent('schedule:item-started', {
			retreatId: 'r1',
			itemId: 'i1',
			actualStartTime: '2026-04-26T12:00:00.000Z',
		});
		await vi.advanceTimersByTimeAsync(0);
		expect(apiPublic.mock.calls.length).toBe(callsBeforeEvent); // no refetch
		expect(wrapper.text()).toContain('Item 1'); // still in view, now active
	});

	it('schedule:item-completed flips item.status to completed without a refetch', async () => {
		apiPublic.mockResolvedValue(
			makeData([
				makeItem({ id: 'i1', status: 'active', name: 'Active' }),
			]),
		);
		const wrapper = await mountView();
		const callsBefore = apiPublic.mock.calls.length;
		fireEvent('schedule:item-completed', {
			retreatId: 'r1',
			itemId: 'i1',
			actualEndTime: '2026-04-26T13:00:00.000Z',
		});
		await vi.advanceTimersByTimeAsync(0);
		expect(apiPublic.mock.calls.length).toBe(callsBefore);
		// Active text should disappear since item became completed
		expect(wrapper.text()).not.toMatch(/AHORA · /);
	});

	it('schedule:updated triggers a refetch (catch-all path)', async () => {
		apiPublic.mockResolvedValue(makeData([]));
		await mountView();
		const callsBefore = apiPublic.mock.calls.length;
		fireEvent('schedule:updated', { retreatId: 'r1', itemId: 'i1' });
		await vi.advanceTimersByTimeAsync(0);
		expect(apiPublic.mock.calls.length).toBeGreaterThan(callsBefore);
	});

	it('schedule:delay triggers a refetch (timing recalc)', async () => {
		apiPublic.mockResolvedValue(makeData([]));
		await mountView();
		const callsBefore = apiPublic.mock.calls.length;
		fireEvent('schedule:delay', { retreatId: 'r1', itemId: 'i1', minutesDelta: 5 });
		await vi.advanceTimersByTimeAsync(0);
		expect(apiPublic.mock.calls.length).toBeGreaterThan(callsBefore);
	});

	it('events for OTHER retreats are ignored (room isolation safeguard)', async () => {
		apiPublic.mockResolvedValue(
			makeData([makeItem({ id: 'i1', status: 'pending' })]),
		);
		await mountView();
		const callsBefore = apiPublic.mock.calls.length;
		// Event for a different retreat — should be a no-op
		fireEvent('schedule:updated', { retreatId: 'OTHER', itemId: 'i1' });
		await vi.advanceTimersByTimeAsync(0);
		expect(apiPublic.mock.calls.length).toBe(callsBefore);
	});

	it('emits public:schedule:unsubscribe on unmount with the retreatId', async () => {
		apiPublic.mockResolvedValue(makeData([]));
		const wrapper = await mountView();
		await vi.advanceTimersByTimeAsync(0);
		socketEmits.length = 0; // clear the subscribe call
		wrapper.unmount();
		const unsub = socketEmits.find((e) => e.event === 'public:schedule:unsubscribe');
		expect(unsub).toBeTruthy();
		expect(unsub!.args[0]).toBe('r1');
	});
});

describe('PublicMinuteByMinuteView — empty / future / past retreat', () => {
	it('handles a retreat that has not started yet (jumps to first day)', async () => {
		vi.setSystemTime(new Date('2026-04-25T12:00:00.000Z')); // day before retreat
		apiPublic.mockResolvedValueOnce(
			makeData([
				makeItem({
					id: 'd1',
					day: 1,
					startTime: '2026-04-26T08:00:00.000Z',
					endTime: '2026-04-26T08:30:00.000Z',
					name: 'Día 1 inicio',
				}),
			]),
		);
		const wrapper = await mountView();
		expect(wrapper.text()).toContain('Día 1');
		expect(wrapper.text()).toContain('Día 1 inicio');
	});

	it('handles a retreat that has already finished (shows last day)', async () => {
		vi.setSystemTime(new Date('2026-05-01T12:00:00.000Z')); // long after
		apiPublic.mockResolvedValueOnce(
			makeData([
				makeItem({
					id: 'd1',
					day: 1,
					startTime: '2026-04-26T08:00:00.000Z',
					endTime: '2026-04-26T08:30:00.000Z',
					name: 'Día 1 item',
					status: 'completed',
				}),
				makeItem({
					id: 'd3-last',
					day: 3,
					startTime: '2026-04-28T20:00:00.000Z',
					endTime: '2026-04-28T20:30:00.000Z',
					name: 'Despedida',
					status: 'completed',
				}),
			]),
		);
		const wrapper = await mountView();
		expect(wrapper.text()).toContain('Día 3');
	});

	it('handles empty schedule gracefully (no AHORA, no upcoming, no error)', async () => {
		apiPublic.mockResolvedValueOnce(makeData([]));
		const wrapper = await mountView();
		expect(wrapper.text()).not.toContain('AHORA');
		expect(wrapper.text()).not.toContain('A continuación');
		expect(wrapper.text()).not.toContain('No se pudo cargar');
	});
});

/**
 * Bug C regression test: when Día N ends late and Día N+1 starts early, both
 * day ranges contain `now`. The old logic returned the FIRST day in iteration
 * order (Día N), so the header showed "Día N" while the active item was from
 * Día N+1 — visual inconsistency. Fix: prefer the day of the explicitly-active
 * item; fall back to the LATER day when ranges overlap.
 */
describe('PublicMinuteByMinuteView — activeDay tie-break (Bug C)', () => {
	it('prefers the day of the explicit `status:active` item over time-window match', async () => {
		// `now` falls inside both Día 2 (last item) AND Día 3 (first item) ranges.
		vi.setSystemTime(new Date('2026-04-28T05:05:00.000Z'));
		apiPublic.mockResolvedValueOnce(
			makeData([
				// Día 2 ends late
				makeItem({
					id: 'd2-late',
					day: 2,
					startTime: '2026-04-27T20:00:00.000Z',
					endTime: '2026-04-28T05:30:00.000Z',
					name: 'Último item Día 2',
					status: 'completed',
				}),
				// Día 3 active
				makeItem({
					id: 'd3-active',
					day: 3,
					startTime: '2026-04-28T05:00:00.000Z',
					endTime: '2026-04-28T05:20:00.000Z',
					name: 'Primer item Día 3',
					status: 'active',
				}),
				makeItem({
					id: 'd3-next',
					day: 3,
					startTime: '2026-04-28T05:30:00.000Z',
					endTime: '2026-04-28T05:50:00.000Z',
					name: 'Siguiente Día 3',
					status: 'pending',
				}),
			]),
		);
		const wrapper = await mountView();
		// Header should reflect the day of the active item (Día 3), not Día 2
		expect(wrapper.text()).toContain('Día 3');
		expect(wrapper.text()).not.toContain('Día 2');
		expect(wrapper.text()).toContain('Primer item Día 3');
	});

	it('when no explicit active item, prefers the LATER day when ranges overlap', async () => {
		vi.setSystemTime(new Date('2026-04-28T05:05:00.000Z'));
		apiPublic.mockResolvedValueOnce(
			makeData([
				makeItem({
					id: 'd2-late',
					day: 2,
					startTime: '2026-04-27T20:00:00.000Z',
					endTime: '2026-04-28T06:00:00.000Z',
					name: 'Día 2 still in range',
				}),
				makeItem({
					id: 'd3-early',
					day: 3,
					startTime: '2026-04-28T04:00:00.000Z',
					endTime: '2026-04-28T15:00:00.000Z',
					name: 'Día 3 early',
				}),
			]),
		);
		const wrapper = await mountView();
		// Should show Día 3 (the later day) since both contain `now`
		expect(wrapper.text()).toContain('Día 3');
		expect(wrapper.text()).toContain('Día 3 early');
	});

	it('non-overlapping case: returns the day that contains now', async () => {
		vi.setSystemTime(new Date('2026-04-27T08:00:00.000Z'));
		apiPublic.mockResolvedValueOnce(
			makeData([
				makeItem({
					id: 'd1',
					day: 1,
					startTime: '2026-04-26T08:00:00.000Z',
					endTime: '2026-04-26T16:00:00.000Z',
					name: 'Día 1 item',
				}),
				makeItem({
					id: 'd2',
					day: 2,
					startTime: '2026-04-27T07:00:00.000Z',
					endTime: '2026-04-27T20:00:00.000Z',
					name: 'Día 2 item',
				}),
			]),
		);
		const wrapper = await mountView();
		expect(wrapper.text()).toContain('Día 2');
	});
});
