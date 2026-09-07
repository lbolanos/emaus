/**
 * Búsqueda de la vista de equipos de servicio. Comparte el normalizador con el
 * resto del sistema, así que lo que se fija aquí es que buscar sin acentos
 * encuentre a un servidor y a un equipo por su nombre, su líder o sus miembros.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises, VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { nextTick } from 'vue';

vi.mock('vue-router', () => ({
	useRoute: () => ({ params: {} }),
	useRouter: () => ({ push: vi.fn() }),
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

vi.mock('@/services/api', () => ({
	exportServiceTeamsToDocx: vi.fn(),
	api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

const RETREAT_ID = 'retreat-1';

const server = (id: string, firstName: string, lastName: string) => ({
	id,
	firstName,
	lastName,
	type: 'server',
	isCancelled: false,
	retreatId: RETREAT_ID,
});

const ramirez = server('s1', 'José Luis', 'García Ramírez');
const perez = server('s2', 'Ana', 'Pérez');
const lopez = server('s3', 'Beto', 'López');

async function mountView(teams: any[] = []): Promise<VueWrapper<any>> {
	setActivePinia(createPinia());

	const { useRetreatStore } = await import('@/stores/retreatStore');
	const { useParticipantStore } = await import('@/stores/participantStore');
	const { useServiceTeamStore } = await import('@/stores/serviceTeamStore');

	const retreatStore = useRetreatStore();
	(retreatStore as any).retreats = [{ id: RETREAT_ID, parish: 'Test' }];
	retreatStore.selectedRetreatId = RETREAT_ID;

	const participantStore = useParticipantStore();
	participantStore.participants = [ramirez, perez, lopez] as any;
	(participantStore as any).fetchParticipants = vi.fn();

	const serviceTeamStore = useServiceTeamStore();
	(serviceTeamStore as any).fetchTeams = vi.fn();
	(serviceTeamStore as any).teams = teams;

	const ServiceTeamsView = (await import('@/views/ServiceTeamsView.vue')).default;
	const wrapper = mount(ServiceTeamsView, { global: { mocks: { $t: (k: string) => k } } });
	await flushPromises();
	await nextTick();
	return wrapper;
}

describe('ServiceTeamsView - buscador', () => {
	beforeEach(() => vi.clearAllMocks());

	it('encuentra un servidor escrito sin acentos', async () => {
		const wrapper = await mountView();

		wrapper.vm.serverSearchQuery = 'ramirez';
		await nextTick();

		const found = [...wrapper.vm.filteredServersWithoutTeam, ...wrapper.vm.filteredServersWithTeam];
		expect(found.map((s: any) => s.id)).toEqual(['s1']);
	});

	it('encuentra un servidor por nombre y apellido juntos', async () => {
		const wrapper = await mountView();

		wrapper.vm.serverSearchQuery = 'jose garcia';
		await nextTick();

		const found = [...wrapper.vm.filteredServersWithoutTeam, ...wrapper.vm.filteredServersWithTeam];
		expect(found.map((s: any) => s.id)).toEqual(['s1']);
	});

	it('devuelve todos los servidores con la búsqueda vacía', async () => {
		const wrapper = await mountView();

		wrapper.vm.serverSearchQuery = '   ';
		await nextTick();

		const found = [...wrapper.vm.filteredServersWithoutTeam, ...wrapper.vm.filteredServersWithTeam];
		expect(found).toHaveLength(3);
	});

	it('encuentra un equipo por su nombre sin acentos', async () => {
		const wrapper = await mountView([
			{ id: 't1', name: 'Cocina y Comedor', teamType: 'kitchen', leader: null, members: [] },
			{ id: 't2', name: 'Música', teamType: 'music', leader: null, members: [] },
		]);

		wrapper.vm.teamSearchQuery = 'musica';
		await nextTick();

		expect(wrapper.vm.filteredTeams.map((t: any) => t.id)).toEqual(['t2']);
	});

	it('encuentra un equipo por el apellido de su líder', async () => {
		const wrapper = await mountView([
			{ id: 't1', name: 'Cocina', teamType: 'kitchen', leader: perez, members: [] },
			{ id: 't2', name: 'Música', teamType: 'music', leader: lopez, members: [] },
		]);

		wrapper.vm.teamSearchQuery = 'perez';
		await nextTick();

		expect(wrapper.vm.filteredTeams.map((t: any) => t.id)).toEqual(['t1']);
	});

	it('encuentra un equipo por uno de sus miembros', async () => {
		const wrapper = await mountView([
			{ id: 't1', name: 'Cocina', teamType: 'kitchen', leader: null, members: [{ participant: ramirez }] },
			{ id: 't2', name: 'Música', teamType: 'music', leader: null, members: [{ participant: lopez }] },
		]);

		wrapper.vm.teamSearchQuery = 'ramirez';
		await nextTick();

		expect(wrapper.vm.filteredTeams.map((t: any) => t.id)).toEqual(['t1']);
	});
});
