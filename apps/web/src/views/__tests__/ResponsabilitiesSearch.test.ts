/**
 * Búsqueda de la vista de responsabilidades: encuentra tanto por el nombre de
 * la responsabilidad como por el servidor que la tiene asignada.
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
	api: { get: vi.fn(async () => ({ data: [] })), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

const RETREAT_ID = 'retreat-1';

const jose = {
	id: 's1',
	firstName: 'José Luis',
	lastName: 'García Ramírez',
	type: 'server',
	isCancelled: false,
};

const responsibilities = [
	{ id: 'r1', name: 'Cocina', responsabilityType: 'other', participant: jose, retreatId: RETREAT_ID },
	{ id: 'r2', name: 'Música', responsabilityType: 'other', participant: null, retreatId: RETREAT_ID },
];

async function mountView(): Promise<VueWrapper<any>> {
	setActivePinia(createPinia());

	const { useRetreatStore } = await import('@/stores/retreatStore');
	const retreatStore = useRetreatStore();
	(retreatStore as any).retreats = [{ id: RETREAT_ID, parish: 'Test' }];
	retreatStore.selectedRetreatId = RETREAT_ID;

	const ResponsabilitiesView = (await import('@/views/ResponsabilitiesView.vue')).default;
	const wrapper = mount(ResponsabilitiesView, { global: { mocks: { $t: (k: string) => k } } });
	await flushPromises();
	wrapper.vm.responsibilities = responsibilities;
	await nextTick();
	return wrapper;
}

describe('ResponsabilitiesView - buscador', () => {
	beforeEach(() => vi.clearAllMocks());

	const search = async (wrapper: any, query: string) => {
		wrapper.vm.searchQuery = query;
		await nextTick();
		return wrapper.vm.filteredResponsibilities.map((r: any) => r.id);
	};

	it('encuentra por el nombre de la responsabilidad, sin acentos', async () => {
		const wrapper = await mountView();

		expect(await search(wrapper, 'musica')).toEqual(['r2']);
	});

	it('encuentra por el servidor asignado, sin acentos', async () => {
		const wrapper = await mountView();

		expect(await search(wrapper, 'ramirez')).toEqual(['r1']);
	});

	it('encuentra al servidor por nombre completo aunque lleve otro nombre en medio', async () => {
		const wrapper = await mountView();

		expect(await search(wrapper, 'jose garcia')).toEqual(['r1']);
	});

	it('devuelve todo con la búsqueda vacía', async () => {
		const wrapper = await mountView();

		expect(await search(wrapper, '  ')).toHaveLength(2);
	});

	it('no devuelve nada cuando no coincide', async () => {
		const wrapper = await mountView();

		expect(await search(wrapper, 'zzz')).toEqual([]);
	});
});
