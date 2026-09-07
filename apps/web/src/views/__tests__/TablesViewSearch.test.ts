/**
 * Tests del buscador de la vista de mesas: el ciclo al navegar, el contador
 * cuando no hay resultados, el atenuado del resto del tablero y el aviso de
 * cancelados.
 *
 * La vista arrastra muchas dependencias, así que `@repo/ui` y los íconos se
 * mockean con un Proxy que responde a cualquier export.
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

const getCancelledParticipantsMock = vi.fn(async () => [] as any[]);

vi.mock('@/services/api', () => ({
	getCancelledParticipants: (...args: any[]) => getCancelledParticipantsMock(...args),
	exportTablesToDocx: vi.fn(),
	api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

const RETREAT_ID = 'retreat-1';

const makeParticipant = (over: Record<string, any>) => ({
	id: over.id,
	firstName: over.firstName ?? '',
	lastName: over.lastName ?? '',
	nickname: over.nickname,
	id_on_retreat: over.id_on_retreat ?? null,
	type: over.type ?? 'walker',
	isCancelled: over.isCancelled ?? false,
	retreatId: RETREAT_ID,
	...over,
});

// Dos "García" sin asignar y una tercera sentada en una mesa: suficiente para
// ver el ciclo y para que quede gente fuera de la búsqueda.
const ana = makeParticipant({ id: 'p1', firstName: 'Ana', lastName: 'García', id_on_retreat: 1 });
const luis = makeParticipant({ id: 'p2', firstName: 'Luis', lastName: 'García', id_on_retreat: 2 });
const beto = makeParticipant({ id: 'p3', firstName: 'Beto', lastName: 'Pérez', id_on_retreat: 3 });
const sara = makeParticipant({ id: 'p4', firstName: 'Sara', lastName: 'García', id_on_retreat: 4 });

async function mountView(): Promise<VueWrapper<any>> {
	setActivePinia(createPinia());

	const { useRetreatStore } = await import('@/stores/retreatStore');
	const { useParticipantStore } = await import('@/stores/participantStore');
	const { useTableMesaStore } = await import('@/stores/tableMesaStore');

	const retreatStore = useRetreatStore();
	(retreatStore as any).retreats = [{ id: RETREAT_ID, parish: 'Test' }];
	retreatStore.selectedRetreatId = RETREAT_ID;

	const participantStore = useParticipantStore();
	participantStore.participants = [ana, luis, beto, sara] as any;
	(participantStore as any).fetchParticipants = vi.fn();

	const tableMesaStore = useTableMesaStore();
	(tableMesaStore as any).fetchTables = vi.fn();
	tableMesaStore.tables = [
		{ id: 't1', name: 'Mesa 1', retreatId: RETREAT_ID, lider: null, colider1: null, colider2: null, walkers: [sara] },
	] as any;

	const TablesView = (await import('@/views/TablesView.vue')).default;
	const wrapper = mount(TablesView, { global: { mocks: { $t: (k: string) => k } } });
	await flushPromises();
	await nextTick();
	return wrapper;
}

describe('TablesView - buscador', () => {
	beforeEach(() => {
		getCancelledParticipantsMock.mockReset();
		getCancelledParticipantsMock.mockResolvedValue([]);
	});

	const search = async (wrapper: any, query: string) => {
		wrapper.vm.searchQuery = query;
		await nextTick();
	};

	it('cuenta las coincidencias del tablero completo', async () => {
		const wrapper = await mountView();

		await search(wrapper, 'garcia');

		// Ana y Luis sin asignar, Sara en la mesa.
		expect(wrapper.vm.totalMatches).toBe(3);
	});

	it('da la vuelta al pasar de la última coincidencia', async () => {
		const wrapper = await mountView();
		await search(wrapper, 'garcia');

		expect(wrapper.vm.currentMatchIndex).toBe(0);
		wrapper.vm.goToNextMatch();
		wrapper.vm.goToNextMatch();
		expect(wrapper.vm.currentMatchIndex).toBe(2);

		wrapper.vm.goToNextMatch();
		expect(wrapper.vm.currentMatchIndex).toBe(0);
	});

	it('da la vuelta hacia atrás desde la primera', async () => {
		const wrapper = await mountView();
		await search(wrapper, 'garcia');

		wrapper.vm.goToPreviousMatch();

		expect(wrapper.vm.currentMatchIndex).toBe(2);
	});

	it('no se mueve cuando la búsqueda no encuentra nada', async () => {
		const wrapper = await mountView();
		await search(wrapper, 'zzz');

		expect(wrapper.vm.totalMatches).toBe(0);
		wrapper.vm.goToNextMatch();
		expect(wrapper.vm.currentMatchIndex).toBe(0);
	});

	it('atenúa a quien no coincide y resalta a quien sí', async () => {
		const wrapper = await mountView();
		await search(wrapper, 'garcia');

		const pills = wrapper.findAll('[data-participant-id]');
		const byId = (id: string) => pills.find((p: any) => p.attributes('data-participant-id') === id);

		expect(byId('p3')!.classes()).toContain('opacity-40');
		expect(byId('p1')!.classes()).not.toContain('opacity-40');
		expect(byId('p2')!.classes()).not.toContain('opacity-40');
	});

	it('no atenúa a nadie mientras el buscador está vacío', async () => {
		const wrapper = await mountView();

		const atenuados = wrapper.findAll('[data-participant-id]').filter((p: any) => p.classes().includes('opacity-40'));

		expect(atenuados).toHaveLength(0);
	});

	it('avisa de los cancelados que coinciden, que no están en el tablero', async () => {
		getCancelledParticipantsMock.mockResolvedValue([
			makeParticipant({ id: 'c1', firstName: 'Mario', lastName: 'García', isCancelled: true }),
		]);
		const wrapper = await mountView();

		await search(wrapper, 'garcia');

		expect(wrapper.vm.cancelledMatches).toHaveLength(1);
		expect(wrapper.vm.cancelledMatchNames).toBe('Mario García');
		// No entran en el contador: no se puede navegar hasta ellos.
		expect(wrapper.vm.totalMatches).toBe(3);
	});

	it('no avisa de cancelados que no coinciden', async () => {
		getCancelledParticipantsMock.mockResolvedValue([
			makeParticipant({ id: 'c1', firstName: 'Mario', lastName: 'López', isCancelled: true }),
		]);
		const wrapper = await mountView();

		await search(wrapper, 'garcia');

		expect(wrapper.vm.cancelledMatches).toHaveLength(0);
	});
});
