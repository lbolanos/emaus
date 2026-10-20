/**
 * Collapsing days of the Minuto a Minuto (specs/ux-mam-responsabilidades, D4):
 * the default opens only today during the retreat, the coordinator's choice is
 * remembered per retreat, and a search into a collapsed day opens it.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { useRetreatStore } from '@/stores/retreatStore';
import { collapseStorageKey } from '../mamCollapse';

vi.mock('vue-router', () => ({
	useRoute: () => ({ params: { id: 'retreat-1' }, query: {} }),
	useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock('@repo/ui', () => new Proxy(
	{},
	{
		get: (_t, name) => {
			const n = String(name);
			if (n === '__esModule') return false;
			if (n === 'useToast') return () => ({ toast: vi.fn() });
			if (n === 'toast') return vi.fn();
			if (n.startsWith('use')) return () => ({});
			return { name: n, template: '<div><slot /></div>' };
		},
		has: () => true,
	},
));

vi.mock('lucide-vue-next', () => new Proxy(
	{},
	{
		get: (_t, name) => (name === '__esModule' ? false : { name: String(name), template: '<svg />' }),
		has: () => true,
	},
));

const item = (id: string, day: number, name: string, start: string) => ({
	id,
	retreatId: 'retreat-1',
	name,
	type: 'charla',
	day,
	startTime: start,
	endTime: start,
	durationMinutes: 30,
	orderInDay: 1,
	status: 'pending',
	responsabilityId: null,
	blocksSantisimoAttendance: false,
	responsables: [],
});

vi.mock('@/services/api', () => ({
	api: { get: vi.fn(async () => ({ data: [] })), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
	apiErrorMessage: (e: unknown) => String(e),
	retreatScheduleApi: {
		list: vi.fn(async () => [
			item('a', 1, 'Bienvenida', '2026-10-16T22:00:00.000Z'),
			item('b', 2, 'Charla del sábado', '2026-10-17T16:00:00.000Z'),
			item('c', 3, 'Misa de Cierre', '2026-10-18T21:00:00.000Z'),
		]),
	},
	scheduleTemplateApi: { list: vi.fn(async () => []), listSets: vi.fn(async () => []) },
}));

vi.mock('@/services/realtime', () => ({
	getSocket: () => ({ connected: false, on: vi.fn(), off: vi.fn(), emit: vi.fn() }),
}));

vi.mock('@/composables/useAuthPermissions', async () => {
	const { ref } = await import('vue');
	return { useAuthPermissions: () => ({ canManage: new Proxy({}, { get: () => ref(false) }) }) };
});

vi.mock('@/composables/useMyParticipantId', async () => {
	const { computed } = await import('vue');
	return { useMyParticipantId: () => computed(() => null) };
});

vi.mock('@/components/ResponsabilityAttachmentsDialog.vue', () => ({
	default: { name: 'ResponsabilityAttachmentsDialog', template: '<div />' },
}));
vi.mock('@/components/ScheduleItemEditModal.vue', () => ({
	default: { name: 'ScheduleItemEditModal', template: '<div />' },
}));
vi.mock('@/components/MamHelpDialog.vue', () => ({
	default: { name: 'MamHelpDialog', template: '<div />' },
}));
vi.mock('@/components/MamMoreActions.vue', () => ({
	default: { name: 'MamMoreActions', template: '<div />' },
}));

const KEY = collapseStorageKey('retreat-1');

async function mountView(): Promise<VueWrapper> {
	setActivePinia(createPinia());
	const retreatStore = useRetreatStore();
	retreatStore.retreats = [
		{ id: 'retreat-1', startDate: '2026-10-16', endDate: '2026-10-18', timezone: 'America/Mexico_City' } as any,
	];
	retreatStore.selectedRetreatId = 'retreat-1';
	const View = (await import('@/views/MinuteByMinuteView.vue')).default;
	const wrapper = mount(View, { global: { mocks: { $t: (k: string) => k } } });
	await flushPromises();
	return wrapper;
}

const collapsed = (w: VueWrapper, day: number) =>
	w.find(`#mam-day-rows-${day}`).classes().includes('mam-day-collapsed');

describe('MinuteByMinuteView — collapsing days', () => {
	beforeEach(() => {
		localStorage.clear();
		Element.prototype.scrollIntoView = vi.fn();
		// Saturday of the retreat, midday in CDMX: day 2.
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(new Date('2026-10-17T18:00:00Z'));
	});
	afterEach(() => vi.useRealTimers());

	it('opens only today during the retreat, without saving that default', async () => {
		const w = await mountView();
		expect([collapsed(w, 1), collapsed(w, 2), collapsed(w, 3)]).toEqual([true, false, true]);
		expect(localStorage.getItem(KEY)).toBeNull();
		w.unmount();
	});

	it('toggles a day from its header and remembers it per retreat', async () => {
		const w = await mountView();
		await w.find('button[aria-controls="mam-day-rows-2"]').trigger('click');
		expect(collapsed(w, 2)).toBe(true);
		expect(w.find('button[aria-controls="mam-day-rows-2"]').attributes('aria-expanded')).toBe('false');
		expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual([1, 2, 3]);
		w.unmount();
	});

	it('restores the saved choice over the default', async () => {
		localStorage.setItem(KEY, '[]');
		const w = await mountView();
		expect([collapsed(w, 1), collapsed(w, 2), collapsed(w, 3)]).toEqual([false, false, false]);
		w.unmount();
	});

	it('collapses and expands every day from the menu', async () => {
		const w = await mountView();
		const menu = w.findComponent({ name: 'MamMoreActions' });
		menu.vm.$emit('expand-all');
		await flushPromises();
		expect([collapsed(w, 1), collapsed(w, 2), collapsed(w, 3)]).toEqual([false, false, false]);
		menu.vm.$emit('collapse-all');
		await flushPromises();
		expect([collapsed(w, 1), collapsed(w, 2), collapsed(w, 3)]).toEqual([true, true, true]);
		w.unmount();
	});

	it('opens a collapsed day when the search lands on one of its rows', async () => {
		const w = await mountView();
		expect(collapsed(w, 3)).toBe(true);
		w.findComponent({ name: 'Input' }).vm.$emit('update:modelValue', 'Misa de Cierre');
		// The search scrolls after a 200 ms debounce (real timers: only Date is faked).
		await new Promise((r) => setTimeout(r, 260));
		await flushPromises();
		expect(collapsed(w, 3)).toBe(false);
		expect(collapsed(w, 1)).toBe(true);
		w.unmount();
	});
});
