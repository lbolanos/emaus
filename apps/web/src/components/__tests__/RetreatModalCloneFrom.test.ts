/**
 * La pestaña "Copiar de un retiro anterior" del RetreatModal (solo modo add):
 *
 *   - Elegir un origen prefilla el retiro nuevo con lo que suele heredarse tal
 *     cual: identidad (parish/número), comunidad, registro externo, casa, TZ,
 *     costos, notas y flags del volante. Fechas, slug (autogenerado) y
 *     visibilidad nunca se copian: el retiro nuevo nace Borrador con sus
 *     propias fechas.
 *   - La pestaña de secciones (y los checks MAM/pretareas que la acompañan)
 *     aparece solo cuando hay origen elegido; marcar schedule/pretareas en la
 *     copia apaga el import por template para no duplicar trabajo.
 *   - Al crear, el modal llama retreatStore.createRetreat con { cloneFrom }
 *     solo si hay origen Y al menos una sección encendida.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { ref } from 'vue';

const retreats = ref<any[]>([]);
const fetchRetreats = vi.fn();
const createRetreat = vi.fn();
vi.mock('@/stores/retreatStore', () => ({
	useRetreatStore: () => ({
		get retreats() {
			return retreats.value;
		},
		fetchRetreats,
		createRetreat,
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

const ORIGIN = {
	id: 'ret-origin',
	parish: 'La Esperanza de María',
	retreat_number_version: 'XII',
	communityId: 'comm-1',
	externalRegistrationUrl: 'https://parroquia.org/inscripcion',
	houseId: 'house-1',
	timezone: 'America/Mexico_City',
	startDate: '2026-10-02',
	endDate: '2026-10-04',
	cost: '3100',
	paymentInfo: 'Depósito en sucursal',
	paymentMethods: 'Transferencia o efectivo',
	contactPhones: 'Marco 55-6525-0861',
	retreat_type: 'men',
	flyer_options: {
		showQrCodesLocation: false,
		showQrCodesRegistration: true,
		showPickupInfo: false,
	},
};

const factory = (props: Record<string, unknown> = {}) =>
	mount(RetreatModal, {
		props: { open: true, mode: 'add', ...props },
		global: { mocks: { $t: (key: string) => key } },
	});

const filledForm = (wrapper: ReturnType<typeof factory>) => {
	// Mínimo para validateForm: parish, casa y fechas válidas (el formData
	// inicial trae startDate === endDate, que validateDates rechaza).
	const start = new Date();
	start.setDate(start.getDate() + 1);
	const end = new Date(start);
	end.setDate(end.getDate() + 2);
	wrapper.vm.formData.parish = 'Tlalpan';
	wrapper.vm.formData.houseId = 'house-1';
	wrapper.vm.formData.startDate = start;
	wrapper.vm.formData.endDate = end;
};

describe('RetreatModal — copiar de un retiro anterior', () => {
	beforeEach(() => {
		retreats.value = [{ ...ORIGIN }];
		fetchRetreats.mockClear();
		createRetreat.mockReset();
		createRetreat.mockResolvedValue({
			id: 'ret-new',
			startDate: '2027-03-05',
			isPublic: true,
			registrationOpen: false,
		});
	});

	it('prefilla identidad y configuración del origen; fechas y visibilidad no', async () => {
		const wrapper = factory();
		await flushPromises();

		wrapper.vm.onCopySourceSelect('ret-origin');
		await flushPromises();

		const f = wrapper.vm.formData;
		// Identidad y configuración operativa: se heredan del origen.
		expect(f.parish).toBe('La Esperanza de María');
		expect(f.retreat_number_version).toBe('XII');
		expect(f.communityId).toBe('comm-1');
		expect(f.externalRegistrationUrl).toBe('https://parroquia.org/inscripcion');
		expect(f.houseId).toBe('house-1');
		expect(f.timezone).toBe('America/Mexico_City');
		expect(f.cost).toBe('3100');
		expect(f.paymentInfo).toBe('Depósito en sucursal');
		expect(f.contactPhones).toBe('Marco 55-6525-0861');
		expect(f.flyer_options).toEqual({
			showQrCodesLocation: false,
			showQrCodesRegistration: true,
			showPickupInfo: false,
		});
		// El calendario del retiro NUEVO es el suyo: las fechas del origen no viajan.
		expect(String(new Date(f.startDate).getTime())).not.toBe(String(new Date(ORIGIN.startDate).getTime()));
		// Un origen publicado no hace nacer abierto al nuevo.
		expect(f.isPublic).toBe(false);
		expect(f.registrationOpen).toBe(false);
	});

	it('la pestaña de secciones existe solo con origen elegido', async () => {
		const wrapper = factory();
		await flushPromises();

		expect(wrapper.vm.showCopyTab).toBe(false);
		expect(wrapper.vm.copySourceRetreatId).toBe('__none__');

		wrapper.vm.onCopySourceSelect('ret-origin');
		expect(wrapper.vm.showCopyTab).toBe(true);

		wrapper.vm.onCopySourceSelect('__none__');
		expect(wrapper.vm.showCopyTab).toBe(false);
	});

	it('copiar la agenda/pretareas apaga el import por template', async () => {
		const wrapper = factory();
		await flushPromises();

		// Con la casilla de template marcada, elegir origen + schedule la apaga.
		wrapper.vm.materializeOnCreate = true;
		wrapper.vm.materializePreTasksOnCreate = true;
		wrapper.vm.onCopySourceSelect('ret-origin');
		await flushPromises();

		expect(wrapper.vm.copySections.schedule).toBe(true);
		expect(wrapper.vm.materializeOnCreate).toBe(false);
		expect(wrapper.vm.materializePreTasksOnCreate).toBe(false);
	});

	it('crea vía store con cloneFrom solo cuando hay origen y secciones on', async () => {
		const wrapper = factory();
		await flushPromises();

		// Sin origen: sin cloneFrom.
		filledForm(wrapper);
		await wrapper.vm.handleSubmit();
		expect(createRetreat).toHaveBeenCalledTimes(1);
		// El modal SIEMPRE pasa segundo arg { cloneFrom } (undefined si no hay
		// origen): lo que importa es que cloneFrom venga vacío.
		expect(createRetreat.mock.calls[0][1]?.cloneFrom).toBeUndefined();

		// Con origen y una sección apagada: viaja el mapa tal cual.
		createRetreat.mockClear();
		wrapper.vm.onCopySourceSelect('ret-origin');
		wrapper.vm.copySections.serviceTeams = false;
		filledForm(wrapper);
		await wrapper.vm.handleSubmit();

		expect(createRetreat).toHaveBeenCalledTimes(1);
		const [payload, opts] = createRetreat.mock.calls[0];
		expect(payload.parish).toBe('Tlalpan');
		expect(opts.cloneFrom).toEqual({
			sourceRetreatId: 'ret-origin',
			sections: expect.objectContaining({ serviceTeams: false, schedule: true }),
		});

		// Origen elegido pero TODAS las secciones apagadas: sin cloneFrom.
		createRetreat.mockClear();
		for (const key of Object.keys(wrapper.vm.copySections)) {
			wrapper.vm.copySections[key] = false;
		}
		filledForm(wrapper);
		await wrapper.vm.handleSubmit();
		expect(createRetreat).toHaveBeenCalledTimes(1);
		expect(createRetreat.mock.calls[0][1]?.cloneFrom).toBeUndefined();
	});
});
