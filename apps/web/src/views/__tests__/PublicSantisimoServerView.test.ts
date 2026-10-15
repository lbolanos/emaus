import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, flushPromises, VueWrapper } from '@vue/test-utils';
import PublicSantisimoServerView from '../PublicSantisimoServerView.vue';
import type { PublicSantisimoInvite } from '@/services/api';

/**
 * Vista del enlace personal cifrado `/santisimo/servidor/:token`
 * (specs/santisimo-guardia-links CA9): radios de un solo horario, badge de
 * comida, guardar/cambiar/quitar y estados de error. `t()` viene del mock
 * global de vue-i18n (devuelve la key), así que se aserta por key/testid.
 */
vi.mock('vue-router', () => ({
	useRoute: () => ({ params: { token: 'tok-123' }, query: {} }),
	useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

const { santisimoApiMock } = vi.hoisted(() => ({
	santisimoApiMock: {
		getPublicInvite: vi.fn(),
		publicInviteSignup: vi.fn(),
		publicInviteCancel: vi.fn(),
	},
}));
vi.mock('@/services/api', () => ({ santisimoApi: santisimoApiMock }));

const TOKEN = 'tok-123';

// 2026-01-10 es sábado y 2026-01-11 domingo (constructor local → labels
// deterministas sin importar la TZ del runner).
const jan10 = (h: number) => new Date(2026, 0, 10, h, 0, 0);
const jan11 = (h: number) => new Date(2026, 0, 11, h, 0, 0);

function makeInvite(overrides: Partial<PublicSantisimoInvite> = {}): PublicSantisimoInvite {
	return {
		participant: { firstName: 'Ana', fullName: 'Ana López' },
		retreat: {
			parish: 'El Señor del Buen Despacho',
			startDate: jan10(0).toISOString(),
			endDate: jan11(23).toISOString(),
		},
		current: null,
		slots: [
			{
				id: 'slot-1',
				startTime: jan10(9).toISOString(),
				endTime: jan10(10).toISOString(),
				capacity: 1,
				signedUpCount: 0,
				mealWindow: false,
				isDisabled: false,
				intention: null,
				selectable: true,
			},
			{
				id: 'slot-2',
				startTime: jan10(13).toISOString(),
				endTime: jan10(14).toISOString(),
				capacity: 1,
				signedUpCount: 0,
				mealWindow: true,
				isDisabled: false,
				intention: null,
				selectable: true,
			},
			{
				id: 'slot-3',
				startTime: jan11(9).toISOString(),
				endTime: jan11(10).toISOString(),
				capacity: 1,
				signedUpCount: 1,
				mealWindow: false,
				isDisabled: false,
				intention: null,
				selectable: false,
			},
		],
		...overrides,
	};
}

async function mountView(): Promise<VueWrapper<any>> {
	const wrapper = mount(PublicSantisimoServerView, {
		props: { token: TOKEN },
	});
	// onMounted es async: sin flushPromises el DOM queda en "Cargando".
	await flushPromises();
	return wrapper;
}

function selectRadio(wrapper: VueWrapper<any>, slotId: string) {
	const radio = wrapper.find(`[data-testid="santisimo-slot-${slotId}"]`);
	(radio.element as HTMLInputElement).checked = true;
	return radio.trigger('change');
}

describe('PublicSantisimoServerView', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		santisimoApiMock.getPublicInvite.mockResolvedValue(makeInvite());
	});

	it('muestra el saludo, columnas por día y radios de un solo horario', async () => {
		const wrapper = await mountView();

		expect(wrapper.text()).toContain('santisimo.serverInvite.heading');
		expect(wrapper.text()).toContain('El Señor del Buen Despacho');
		expect(wrapper.text()).toContain('santisimo.serverInvite.greeting');
		expect(wrapper.text()).toContain('Sábado 10/1');
		expect(wrapper.text()).toContain('Domingo 11/1');
		expect(wrapper.text()).toContain('9 AM – 10 AM');

		const radios = wrapper.findAll('input[type="radio"]');
		expect(radios).toHaveLength(3);
		// Todos comparten name → un solo horario seleccionable.
		const names = new Set(radios.map((r) => (r.element as HTMLInputElement).name));
		expect(names.size).toBe(1);
	});

	it('el badge de comida aparece sólo en slots mealWindow', async () => {
		const wrapper = await mountView();

		expect(wrapper.find('[data-testid="santisimo-meal-slot-2"]').exists()).toBe(true);
		expect(wrapper.find('[data-testid="santisimo-meal-slot-1"]').exists()).toBe(false);
	});

	it('un slot lleno sale con el radio deshabilitado', async () => {
		const wrapper = await mountView();

		const full = wrapper.find('[data-testid="santisimo-slot-slot-3"]');
		expect((full.element as HTMLInputElement).disabled).toBe(true);
		expect(wrapper.text()).toContain('santisimo.full');
	});

	it('token inválido (404) → mensaje de enlace no válido', async () => {
		santisimoApiMock.getPublicInvite.mockRejectedValue(
			Object.assign(new Error('Not Found'), { response: { status: 404 } }),
		);
		const wrapper = await mountView();

		const error = wrapper.find('[data-testid="santisimo-invite-error"]');
		expect(error.exists()).toBe(true);
		expect(error.text()).toContain('santisimo.serverInvite.invalidLink');
	});

	it('elige un horario y lo guarda (POST + recarga)', async () => {
		const wrapper = await mountView();

		await selectRadio(wrapper, 'slot-2');
		await wrapper.find('form').trigger('submit');
		await flushPromises();

		expect(santisimoApiMock.publicInviteSignup).toHaveBeenCalledWith(TOKEN, 'slot-2');
		expect(wrapper.find('[data-testid="santisimo-invite-success"]').exists()).toBe(true);
		// La recarga mantiene counts/current frescos.
		expect(santisimoApiMock.getPublicInvite).toHaveBeenCalledTimes(2);
	});

	it('guardar con cupo perdido (409 CAPACITY) → mensaje amigable y recarga', async () => {
		santisimoApiMock.publicInviteSignup.mockRejectedValue(
			Object.assign(new Error('Slot full'), {
				response: { status: 409, data: { message: 'Slot full', error: 'CAPACITY' } },
			}),
		);
		const wrapper = await mountView();

		await selectRadio(wrapper, 'slot-1');
		await wrapper.find('form').trigger('submit');
		await flushPromises();

		const error = wrapper.find('[data-testid="santisimo-invite-submit-error"]');
		expect(error.exists()).toBe(true);
		expect(error.text()).toContain('santisimo.serverInvite.errorCapacity');
		expect(santisimoApiMock.getPublicInvite).toHaveBeenCalledTimes(2);
	});

	it('con guardia actual: tag "Tu guardia", radio preseleccionado y botón quitar', async () => {
		const invite = makeInvite({
			current: {
				slotId: 'slot-1',
				startTime: jan10(9).toISOString(),
				endTime: jan10(10).toISOString(),
				mealWindow: false,
			},
		});
		santisimoApiMock.getPublicInvite.mockResolvedValue(invite);
		const wrapper = await mountView();

		expect(wrapper.find('[data-testid="santisimo-invite-current"]').exists()).toBe(true);
		expect(wrapper.text()).toContain('santisimo.serverInvite.currentTag');
		const current = wrapper.find('[data-testid="santisimo-slot-slot-1"]');
		expect((current.element as HTMLInputElement).checked).toBe(true);

		await wrapper.find('[data-testid="santisimo-invite-cancel"]').trigger('click');
		await flushPromises();

		expect(santisimoApiMock.publicInviteCancel).toHaveBeenCalledWith(TOKEN);
		expect(santisimoApiMock.getPublicInvite).toHaveBeenCalledTimes(2);
	});

	it('sin slots → mensaje de horarios pendientes y sin formulario', async () => {
		santisimoApiMock.getPublicInvite.mockResolvedValue(makeInvite({ slots: [] }));
		const wrapper = await mountView();

		expect(wrapper.text()).toContain('santisimo.serverInvite.noSlots');
		expect(wrapper.find('form').exists()).toBe(false);
	});
});
