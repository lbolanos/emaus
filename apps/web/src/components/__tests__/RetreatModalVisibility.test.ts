/**
 * El selector de visibilidad de 3 estados (Borrador / Anunciado / Publicado)
 * es una vista sobre las dos banderas del backend (isPublic + registrationOpen):
 *
 *   Borrador   (f, f) — invisible en landing
 *   Anunciado  (t, f) — tarjeta en landing con fechas, inscripción cerrada
 *   Publicado  (t, t) — landing + inscripción abierta
 *
 * El mapeo bidireccional importa en ambos sentidos: elegir estado escribe las
 * banderas del formData (create/edit), y al editar un retiro guardado el
 * estado se deriva de ellas — un retiro pre-migración sin `registrationOpen`
 * se muestra como Publicado (back-compat: ausente = abierto).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';

vi.mock('@/stores/retreatStore', () => ({
	useRetreatStore: () => ({
		retreats: [],
		fetchRetreats: vi.fn(),
		createRetreat: vi.fn(),
	}),
}));

vi.mock('@/stores/communityStore', () => ({
	useCommunityStore: () => ({ communities: [], fetchCommunities: vi.fn() }),
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

const baseRetreat = {
	id: 'retreat-1',
	parish: 'Parroquia',
	houseId: 'house-1',
	startDate: '2026-10-01',
	endDate: '2026-10-03',
};

describe('RetreatModal — estados de visibilidad', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('un retiro nuevo arranca en Borrador (isPublic false, registrationOpen false)', async () => {
		const wrapper = factory();
		await flushPromises();

		expect(wrapper.vm.visibilityState).toBe('draft');
		expect(wrapper.vm.formData.isPublic).toBe(false);
		expect(wrapper.vm.formData.registrationOpen).toBe(false);
		expect(wrapper.vm.visibilityHintKey).toBe('retreatModal.visibility.draftHint');
	});

	it('elegir Anunciado/Publicado escribe las dos banderas del formData', async () => {
		const wrapper = factory();
		await flushPromises();

		wrapper.vm.visibilityState = 'announced';
		expect(wrapper.vm.formData.isPublic).toBe(true);
		expect(wrapper.vm.formData.registrationOpen).toBe(false);
		expect(wrapper.vm.visibilityHintKey).toBe('retreatModal.visibility.announcedHint');

		wrapper.vm.visibilityState = 'published';
		expect(wrapper.vm.formData.isPublic).toBe(true);
		expect(wrapper.vm.formData.registrationOpen).toBe(true);
		expect(wrapper.vm.visibilityHintKey).toBe('retreatModal.visibility.publishedHint');

		wrapper.vm.visibilityState = 'draft';
		expect(wrapper.vm.formData.isPublic).toBe(false);
		expect(wrapper.vm.formData.registrationOpen).toBe(false);
	});

	it('al editar deriva el estado de las banderas guardadas', async () => {
		const wrapper = factory({
			open: false,
			mode: 'edit',
			retreat: { ...baseRetreat, isPublic: true, registrationOpen: false },
		});
		await wrapper.setProps({ open: true });
		await flushPromises();

		expect(wrapper.vm.visibilityState).toBe('announced');
		expect(wrapper.vm.formData.registrationOpen).toBe(false);
	});

	it('un retiro pre-migración sin registrationOpen se edita como Publicado', async () => {
		const wrapper = factory({
			open: false,
			mode: 'edit',
			retreat: { ...baseRetreat, isPublic: true }, // sin registrationOpen
		});
		await wrapper.setProps({ open: true });
		await flushPromises();

		expect(wrapper.vm.visibilityState).toBe('published');
		expect(wrapper.vm.formData.registrationOpen).toBe(true);
	});

	it('el payload de edición incluye registrationOpen', async () => {
		const wrapper = factory({
			open: false,
			mode: 'edit',
			retreat: { ...baseRetreat, isPublic: true, registrationOpen: true },
		});
		await wrapper.setProps({ open: true });
		await flushPromises();

		// Cambiar a Anunciado y guardar: el update debe llevar la bandera.
		wrapper.vm.visibilityState = 'announced';
		await wrapper.vm.handleSubmit();
		await flushPromises();

		const updates = wrapper.emitted('update');
		expect(updates).toBeTruthy();
		const payload = updates![0][0] as Record<string, unknown>;
		expect(payload.registrationOpen).toBe(false);
		expect(payload.isPublic).toBe(true);
	});
});
