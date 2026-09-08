/**
 * La tarjeta de retiros de la comunidad.
 *
 * La convocatoria de servidores NO se manda desde aquí: es una secuencia de
 * WhatsApp que se despacha uno por uno desde la bandeja. Lo que se fija es que
 * el botón lleve al motor de secuencias y que la tarjeta no corra el día del
 * retiro (columna date-only).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { nextTick, ref } from 'vue';

vi.mock('@/services/api', () => ({
	getUpcomingBirthdays: vi.fn(async () => []),
}));

const mockStats = ref<any>(null);
const mockCurrentCommunity = ref<any>({ id: 'comm-1', name: 'Buen despacho', timezone: 'America/Mexico_City' });
vi.mock('@/stores/communityStore', () => ({
	useCommunityStore: () => ({
		get currentCommunity() {
			return mockCurrentCommunity.value;
		},
		get stats() {
			return mockStats.value;
		},
		loadingCommunity: false,
		meetings: [],
		members: [],
		fetchCommunity: vi.fn(),
		fetchMeetings: vi.fn(),
		fetchMembers: vi.fn(),
		fetchDashboardStats: vi.fn(),
	}),
}));

vi.mock('vue-router', () => ({
	useRoute: () => ({ params: { id: 'comm-1' }, query: {} }),
	useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('vue-chartjs', () => ({ Pie: { name: 'Pie', template: '<div />', props: ['data', 'options'] } }));
vi.mock('chart.js', () => ({
	Chart: { register: vi.fn() },
	Title: {}, Tooltip: {}, Legend: {}, ArcElement: {}, CategoryScale: {},
}));
vi.mock('@/components/community/MeetingFormModal.vue', () => ({
	default: { name: 'MeetingFormModal', template: '<div />' },
}));
vi.mock('@/components/MessageDialog.vue', () => ({
	default: { name: 'MessageDialog', template: '<div />' },
}));
vi.mock('@/components/community/MemberAvatar.vue', () => ({
	default: { name: 'MemberAvatar', template: '<div />' },
}));

vi.mock('@repo/ui', () => new Proxy(
	{},
	{
		get: (_t, name) => {
			const n = String(name);
			if (n === '__esModule') return false;
			if (n === 'useToast') return () => ({ toast: vi.fn() });
			if (n.startsWith('use')) return () => ({});
			if (n === 'Dialog') {
				return { name: 'Dialog', template: '<div v-if="open"><slot /></div>', props: ['open'] };
			}
			if (n === 'Button') {
				return {
					name: 'Button',
					template: `<button :disabled="disabled" @click="$emit('click', $event)"><slot /></button>`,
					props: ['variant', 'size', 'disabled', 'asChild'],
				};
			}
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

import CommunityDashboardView from '../CommunityDashboardView.vue';

const factory = () =>
	mount(CommunityDashboardView, {
		props: { id: 'comm-1' },
		global: {
			mocks: { $t: (k: string) => k, t: (k: string) => k },
			stubs: { 'router-link': { template: '<a><slot /></a>' } },
		},
	});

const baseStats = (overrides: Record<string, any> = {}) => ({
	memberCount: 84,
	meetingCount: 8,
	upcomingMeetingsCount: 2,
	averageAttendance: 63,
	recentMeetings: [],
	memberStateDistribution: [],
	participationFrequency: [],
	retreatCount: 1,
	upcomingRetreats: [
		{
			id: 'retreat-1',
			parish: 'Buen Despacho',
			numberVersion: 'Del Valle II',
			startDate: '2026-10-16T00:00:00.000Z',
			endDate: '2026-10-18T00:00:00.000Z',
			slug: 'delvalleii',
		},
	],
	...overrides,
});

describe('CommunityDashboardView — retiros y convocatoria', () => {
	beforeEach(() => {
		mockStats.value = baseStats();
	});

	it('lista los próximos retiros de la comunidad', async () => {
		const wrapper = factory();
		await flushPromises();
		await nextTick();

		expect(wrapper.text()).toContain('Del Valle II');
		expect(wrapper.text()).toContain('community.stats.upcomingRetreats');
	});

	// La fecha del retiro es date-only: formatearla en la zona de la comunidad la
	// corría al día anterior (el retiro del 16 se mostraba como 15).
	it('muestra el día civil correcto del retiro, no el anterior', async () => {
		const wrapper = factory();
		await flushPromises();
		await nextTick();

		expect(wrapper.text()).toContain('16 oct');
		expect(wrapper.text()).not.toContain('15 oct');
	});

	it('sin retiros vinculados no muestra la tarjeta', async () => {
		mockStats.value = baseStats({ upcomingRetreats: [], retreatCount: 0 });
		const wrapper = factory();
		await flushPromises();
		await nextTick();

		expect(wrapper.text()).not.toContain('community.stats.upcomingRetreats');
	});

	it('el botón de convocar lleva al motor de secuencias, no manda nada', async () => {
		const wrapper = factory();
		await flushPromises();
		await nextTick();

		// El único camino a la convocatoria es la vista de secuencias: aquí no hay
		// ningún handler de envío que pudiera escribirle al padrón.
		expect(wrapper.text()).toContain('community.convoke.action');
		expect(wrapper.vm.openConvoke).toBeUndefined();
	});

});
