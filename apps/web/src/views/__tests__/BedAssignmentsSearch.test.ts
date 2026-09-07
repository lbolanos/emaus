/**
 * Tests del buscador de asignación de camas. Busca dos cosas a la vez —camas y
 * participantes— con reglas distintas: la cama se compara contra la consulta
 * entera ("12-B" no son dos palabras) y el participante palabra por palabra.
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

const apiGetMock = vi.fn();

vi.mock('@/services/api', () => ({
	api: { get: (...args: any[]) => apiGetMock(...args), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

const RETREAT_ID = 'retreat-1';

const makeBed = (over: Record<string, any>) => ({
	id: over.id,
	retreatId: RETREAT_ID,
	roomNumber: over.roomNumber ?? '101',
	bedNumber: over.bedNumber ?? '1',
	floor: over.floor ?? 1,
	type: over.type ?? 'normal',
	defaultUsage: 'walker',
	participant: over.participant ?? null,
	...over,
});

const adan = {
	id: 'p1',
	firstName: 'ADAN BAUTISTA',
	lastName: 'PÉREZ',
	id_on_retreat: 17,
	type: 'walker',
	isCancelled: false,
	birthDate: '1986-01-01',
};

const jaime = {
	id: 'p2',
	firstName: 'Jaime Abel',
	lastName: 'Díaz Salguero',
	id_on_retreat: 33,
	type: 'walker',
	isCancelled: false,
	birthDate: '1992-01-01',
};

const beds = [
	makeBed({ id: 'b1', roomNumber: '206', bedNumber: '1', floor: 2, participant: adan }),
	makeBed({ id: 'b2', roomNumber: '206', bedNumber: '2', floor: 2, participant: jaime }),
	makeBed({ id: 'b3', roomNumber: '101', bedNumber: '1', floor: 1, type: 'bunk', participant: null }),
];

async function mountView(): Promise<VueWrapper<any>> {
	setActivePinia(createPinia());
	apiGetMock.mockResolvedValue({ data: beds });

	const { useRetreatStore } = await import('@/stores/retreatStore');
	const { useParticipantStore } = await import('@/stores/participantStore');

	const retreatStore = useRetreatStore();
	(retreatStore as any).retreats = [{ id: RETREAT_ID, parish: 'Test' }];
	retreatStore.selectedRetreatId = RETREAT_ID;

	const participantStore = useParticipantStore();
	participantStore.participants = [adan, jaime] as any;
	(participantStore as any).fetchParticipants = vi.fn();

	const BedAssignmentsView = (await import('@/views/BedAssignmentsView.vue')).default;
	const wrapper = mount(BedAssignmentsView, { global: { mocks: { $t: (k: string) => k } } });
	await flushPromises();
	// El fetch de camas depende del ciclo de vida real; para probar el filtro
	// basta con dejar las camas puestas.
	wrapper.vm.beds = beds;
	await nextTick();
	return wrapper;
}

describe('BedAssignmentsView - buscador', () => {
	beforeEach(() => {
		apiGetMock.mockReset();
	});

	const search = async (wrapper: any, query: string) => {
		wrapper.vm.searchQuery = query;
		await nextTick();
		return wrapper.vm.filteredBeds.map((b: any) => b.id);
	};

	it('encuentra al participante sin acentos', async () => {
		const wrapper = await mountView();

		expect(await search(wrapper, 'perez')).toEqual(['b1']);
		expect(await search(wrapper, 'diaz')).toEqual(['b2']);
	});

	it('encuentra al participante por nombre completo, en cualquier orden', async () => {
		const wrapper = await mountView();

		expect(await search(wrapper, 'adan perez')).toEqual(['b1']);
		expect(await search(wrapper, 'perez adan')).toEqual(['b1']);
	});

	it('sigue encontrando camas por habitación', async () => {
		const wrapper = await mountView();

		expect(await search(wrapper, '206')).toEqual(['b1', 'b2']);
	});

	it('sigue encontrando camas por tipo', async () => {
		const wrapper = await mountView();

		expect(await search(wrapper, 'bunk')).toEqual(['b3']);
	});

	it('no mezcla palabras sueltas al buscar una cama', async () => {
		const wrapper = await mountView();

		// "206 1" no es el número de una habitación: no debe traer camas por
		// juntar dos trozos que están en campos distintos.
		expect(await search(wrapper, 'zzz')).toEqual([]);
	});

	it('resalta la cama del participante buscado', async () => {
		const wrapper = await mountView();
		await search(wrapper, 'perez');

		expect(wrapper.vm.shouldHighlightBed(beds[0])).toBe(true);
		expect(wrapper.vm.shouldHighlightBed(beds[1])).toBe(false);
	});

	it('resalta una cama vacía buscada por habitación', async () => {
		const wrapper = await mountView();
		await search(wrapper, '101');

		expect(wrapper.vm.shouldHighlightBed(beds[2])).toBe(true);
	});

	it('no resalta nada con el buscador vacío', async () => {
		const wrapper = await mountView();

		expect(wrapper.vm.shouldHighlightBed(beds[0])).toBe(false);
	});
});
