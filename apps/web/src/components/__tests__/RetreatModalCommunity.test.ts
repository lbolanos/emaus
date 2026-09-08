/**
 * El vínculo opcional retiro ↔ comunidad en el formulario del retiro.
 *
 *   - Un retiro nuevo sale con `communityId: null`: sin comunidad es el default
 *     y sigue siendo un caso válido.
 *   - Elegir una comunidad la manda; volver a "Sin comunidad" manda `null`, no
 *     `''` ni `'__none__'`.
 *   - Al editar se precarga la comunidad guardada, para que guardar sin tocar
 *     el campo no desvincule el retiro.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { ref } from 'vue';

const communities = ref<any[]>([{ id: 'comm-1', name: 'Buen despacho' }]);
const fetchCommunities = vi.fn();
vi.mock('@/stores/communityStore', () => ({
	useCommunityStore: () => ({
		get communities() {
			return communities.value;
		},
		fetchCommunities,
	}),
}));

vi.mock('@/stores/houseStore', () => ({
	useHouseStore: () => ({ houses: [], fetchHouses: vi.fn() }),
}));

vi.mock('@/services/api', () => ({
	api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
	scheduleTemplateApi: { listSets: vi.fn(async () => []) },
	retreatScheduleApi: { materialize: vi.fn() },
	preRetreatTaskApi: { materialize: vi.fn() },
	preRetreatTaskTemplateApi: { listSets: vi.fn(async () => []) },
}));

vi.mock('@/utils/googleMaps', () => ({ loadGoogleMaps: vi.fn(async () => undefined) }));
vi.mock('@/components/social/MemoryUploadForm.vue', () => ({
	default: { name: 'MemoryUploadForm', template: '<div />' },
}));

vi.mock('@repo/ui', () => new Proxy(
	{},
	{
		get: (_t, name) => {
			const n = String(name);
			if (n === '__esModule') return false;
			if (n === 'useToast') return () => ({ toast: vi.fn() });
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

import RetreatModal from '../RetreatModal.vue';

const factory = (props: Record<string, unknown> = {}) =>
	mount(RetreatModal, {
		props: { open: true, mode: 'add', ...props },
		global: { mocks: { $t: (key: string) => key } },
	});

describe('RetreatModal — comunidad organizadora', () => {
	beforeEach(() => {
		fetchCommunities.mockClear();
	});

	it('un retiro nuevo arranca sin comunidad', async () => {
		const wrapper = factory();
		await flushPromises();

		expect(wrapper.vm.formData.communityId).toBeNull();
	});

	it('carga las comunidades que el usuario administra', async () => {
		communities.value = [];
		factory();
		await flushPromises();

		expect(fetchCommunities).toHaveBeenCalled();
		communities.value = [{ id: 'comm-1', name: 'Buen despacho' }];
	});

	it('elegir una comunidad la guarda en el formulario', async () => {
		const wrapper = factory();
		await flushPromises();

		wrapper.vm.onCommunitySelect('comm-1');
		expect(wrapper.vm.formData.communityId).toBe('comm-1');
	});

	it('"Sin comunidad" manda null, no el sentinel ni cadena vacía', async () => {
		const wrapper = factory();
		await flushPromises();
		wrapper.vm.onCommunitySelect('comm-1');

		wrapper.vm.onCommunitySelect('__none__');

		expect(wrapper.vm.formData.communityId).toBeNull();
	});

	it('al editar precarga la comunidad guardada', async () => {
		// El formulario se rellena en el watch de `open`, que no es `immediate`:
		// hay que montar cerrado y abrir, como hace la vista real.
		const wrapper = factory({
			open: false,
			mode: 'edit',
			retreat: {
				id: 'retreat-1',
				parish: 'Parroquia',
				houseId: 'house-1',
				startDate: '2026-10-01',
				endDate: '2026-10-03',
				communityId: 'comm-1',
			},
		});
		await wrapper.setProps({ open: true });
		await flushPromises();

		expect(wrapper.vm.formData.communityId).toBe('comm-1');
	});
});
