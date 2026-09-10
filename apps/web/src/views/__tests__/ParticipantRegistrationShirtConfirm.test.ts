import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { nextTick } from 'vue';
import ParticipantRegistrationView from '../ParticipantRegistrationView.vue';
import { confirmExistingRegistration } from '@/services/api';

// El select de playeras trae "No necesita" preseleccionado, así que un servidor
// que no lo toca envía el registro sin talla sin haberlo decidido. Antes de
// registrar hay que preguntarle una vez si de verdad no necesita playera —
// en el formulario por pasos y en la pantalla de "¿Eres tú?".

const toastMock = vi.fn();

vi.mock('@repo/ui', () => ({
	Card: { template: '<div><slot /></div>' },
	CardContent: { template: '<div><slot /></div>' },
	CardDescription: { template: '<p><slot /></p>' },
	CardHeader: { template: '<div><slot /></div>' },
	CardTitle: { template: '<h3><slot /></h3>' },
	Button: { props: ['disabled'], template: '<button :disabled="disabled"><slot /></button>' },
	Input: {
		props: ['modelValue', 'type'],
		template: '<input :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
		emits: ['update:modelValue'],
	},
	Label: { template: '<label><slot /></label>' },
	Checkbox: { template: '<input type="checkbox" />' },
	Dialog: { template: '<div><slot /></div>' },
	DialogContent: { template: '<div><slot /></div>' },
	DialogDescription: { template: '<p><slot /></p>' },
	DialogFooter: { template: '<div><slot /></div>' },
	DialogHeader: { template: '<div><slot /></div>' },
	DialogTitle: { template: '<h2><slot /></h2>' },
	DialogTrigger: { template: '<div><slot /></div>' },
	DropdownMenu: { template: '<div><slot /></div>' },
	DropdownMenuContent: { template: '<div><slot /></div>' },
	DropdownMenuItem: { template: '<div><slot /></div>' },
	DropdownMenuTrigger: { template: '<div><slot /></div>' },
	Select: { template: '<div><slot /></div>' },
	SelectContent: { template: '<div><slot /></div>' },
	SelectItem: { template: '<div><slot /></div>' },
	SelectTrigger: { template: '<div><slot /></div>' },
	SelectValue: { template: '<div><slot /></div>' },
	useToast: () => ({ toast: toastMock }),
}));

vi.mock('@/services/api', () => ({
	checkParticipantExists: vi.fn(),
	confirmExistingRegistration: vi.fn(),
}));
vi.mock('@/i18n', () => ({ storeLocale: vi.fn(), default: {} }));
vi.mock('@/config/runtimeConfig', () => ({ getApiUrl: () => 'http://localhost:3001' }));
vi.mock('@/services/recaptcha', () => ({
	getRecaptchaToken: vi.fn().mockResolvedValue('mock-token'),
	RECAPTCHA_ACTIONS: { PARTICIPANT_REGISTER: 'register', PARTICIPANT_EMAIL_CHECK: 'check' },
}));
// Los selectores cargan cada lista por separado: importar el paquete entero
// arrastra city.json (7.7 MB) y era lo que tumbaba el paso en el iPhone.
vi.mock('country-state-city/lib/country', () => ({
	default: { getAllCountries: vi.fn().mockReturnValue([{ name: 'Mexico', isoCode: 'MX' }]) },
}));
vi.mock('country-state-city/lib/state', () => ({
	default: { getStatesOfCountry: vi.fn().mockReturnValue([]) },
}));
vi.mock('@/stores/participantStore', () => ({
	useParticipantStore: () => ({ createParticipant: vi.fn() }),
}));

vi.mock('@/components/registration/Step1PersonalInfo.vue', () => ({ default: { template: '<div />', props: ['modelValue', 'errors'] } }));
vi.mock('@/components/registration/Step2AddressInfo.vue', () => ({ default: { template: '<div />', props: ['modelValue', 'errors'] } }));
vi.mock('@/components/registration/Step3ServiceInfo.vue', () => ({ default: { template: '<div />', props: ['modelValue', 'errors'] } }));
vi.mock('@/components/registration/Step4EmergencyContact.vue', () => ({ default: { template: '<div />', props: ['modelValue', 'errors', 'type'] } }));
vi.mock('@/components/registration/Step5OtherInfo.vue', () => ({ default: { template: '<div />', props: ['modelValue', 'errors'] } }));
vi.mock('@/components/registration/Step5ServerInfo.vue', () => ({ default: { template: '<div />', props: ['modelValue', 'errors'] } }));
vi.mock('@/components/AngelitoAvailabilityEditor.vue', () => ({ default: { template: '<div />' } }));

const SHIRT_TYPES = [
	{ id: 'type-white', name: 'Playera blanca', optionalForServers: true, requiredForWalkers: false, sortOrder: 1, availableSizes: ['S', 'M', 'G'] },
	{ id: 'type-jacket', name: 'Chamarra', optionalForServers: true, requiredForWalkers: false, sortOrder: 2, availableSizes: ['S', 'M', 'G'] },
];

/**
 * Monte la vista con un retiro que ofrece playeras a servidores. `onIdentityScreen`
 * deja el estado en el que pone la búsqueda por correo: pantalla "¿Eres tú?".
 */
const mountView = async (onIdentityScreen = false, shirtTypes: unknown[] = SHIRT_TYPES) => {
	global.fetch = vi.fn().mockResolvedValue({
		ok: true,
		json: () => Promise.resolve({ id: 'retreat-123', isPublic: true, country: 'México', shirtTypes }),
	});
	const pinia = createPinia();
	setActivePinia(pinia);
	const wrapper = mount(ParticipantRegistrationView, {
		props: { retreatId: 'retreat-123', type: 'server' },
		global: { plugins: [pinia], mocks: { $t: (k: string) => k } },
	});
	await flushPromises();
	const vm = wrapper.vm as any;
	if (onIdentityScreen) {
		vm.emailLookup = 'ana@example.com';
		vm.existingParticipantName = 'Ana López';
		await nextTick();
	}
	return { wrapper, vm };
};

describe('Server registration — pregunta de playeras al enviar sin talla', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(confirmExistingRegistration).mockResolvedValue({ success: true, firstName: 'Ana', lastName: 'López' } as any);
	});
	afterEach(() => vi.restoreAllMocks());

	it('formulario: pregunta en vez de enviar cuando no hay ninguna talla', async () => {
		const { wrapper, vm } = await mountView();
		vm.currentStep = 6;
		await nextTick();

		vm.attemptSubmit();
		await nextTick();

		expect(vm.shirtConfirmSource).toBe('form');
		expect(wrapper.text()).toContain('serverRegistration.shirtConfirm.title');
		// No llegó al alta: el formulario vacío habría tostado un error de validación.
		expect(toastMock).not.toHaveBeenCalled();
	});

	it('formulario: con una talla elegida no pregunta', async () => {
		const { wrapper, vm } = await mountView();
		vm.formData.shirtSizesByType = { 'type-white': 'M' };
		vm.currentStep = 6;
		await nextTick();

		vm.attemptSubmit();

		expect(vm.shirtConfirmSource).toBeNull();
		expect(wrapper.text()).not.toContain('serverRegistration.shirtConfirm.title');
	});

	it('formulario: "quiero elegir talla" regresa al paso 5 y cierra la pregunta', async () => {
		const { vm } = await mountView();
		vm.currentStep = 6;
		await nextTick();
		vm.attemptSubmit();
		expect(vm.shirtConfirmSource).toBe('form');

		vm.backToShirtSelection();

		expect(vm.shirtConfirmSource).toBeNull();
		expect(vm.currentStep).toBe(5);
	});

	it('formulario: confirmar la pregunta prosigue con el alta', async () => {
		const { vm } = await mountView();
		vm.currentStep = 6;
		await nextTick();
		vm.attemptSubmit();
		expect(vm.shirtConfirmSource).toBe('form');

		vm.confirmNoShirtNeeded();
		await flushPromises();

		expect(vm.shirtConfirmSource).toBeNull();
		// Evidencia de que el envío arrancó: onSubmit valida todo y con el
		// formulario vacío tosta el error del paso que falta.
		expect(toastMock).toHaveBeenCalledWith(
			expect.objectContaining({ title: 'serverRegistration.toasts.validationTitle' }),
		);
	});

	it('pantalla de identidad: pregunta en vez de confirmar el registro', async () => {
		const { wrapper, vm } = await mountView(true);

		vm.attemptConfirmIdentity();
		await nextTick();

		expect(vm.shirtConfirmSource).toBe('lookup');
		expect(wrapper.text()).toContain('serverRegistration.shirtConfirm.title');
		expect(confirmExistingRegistration).not.toHaveBeenCalled();
	});

	it('pantalla de identidad: con una talla elegida confirma directo', async () => {
		const { vm } = await mountView(true);
		vm.lookupShirtSizes = { 'type-white': 'M' };

		vm.attemptConfirmIdentity();
		await flushPromises();

		expect(vm.shirtConfirmSource).toBeNull();
		expect(confirmExistingRegistration).toHaveBeenCalledTimes(1);
	});

	it('pantalla de identidad: confirmar la pregunta sí registra', async () => {
		const { vm } = await mountView(true);
		vm.attemptConfirmIdentity();
		expect(vm.shirtConfirmSource).toBe('lookup');

		vm.confirmNoShirtNeeded();
		await flushPromises();

		expect(vm.shirtConfirmSource).toBeNull();
		expect(confirmExistingRegistration).toHaveBeenCalledTimes(1);
	});

	it('retiro sin playeras para servidores: no pregunta', async () => {
		const { wrapper, vm } = await mountView(true, []);
		vm.currentStep = 6;
		await nextTick();

		vm.attemptSubmit();

		expect(vm.shirtConfirmSource).toBeNull();
		expect(wrapper.text()).not.toContain('serverRegistration.shirtConfirm.title');
	});
});
