import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { nextTick } from 'vue';
import ParticipantRegistrationView from '../ParticipantRegistrationView.vue';

// Valida que el formulario de registro rechace teléfonos inválidos según el
// PAÍS DEL RETIRO (que llega en la respuesta del endpoint público como `country`)
// y que acepte separadores de formato (se normalizan en el helper compartido).

const toastMock = vi.fn();

vi.mock('@repo/ui', () => ({
	Card: { template: '<div><slot /></div>' },
	CardContent: { template: '<div><slot /></div>' },
	CardDescription: { template: '<p><slot /></p>' },
	CardHeader: { template: '<div><slot /></div>' },
	CardTitle: { template: '<h3><slot /></h3>' },
	Button: { props: ['disabled'], template: '<button :disabled="disabled"><slot /></button>' },
	Input: { props: ['modelValue', 'type'], template: '<input :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />', emits: ['update:modelValue'] },
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
	RECAPTCHA_ACTIONS: { PARTICIPANT_REGISTER: 'register' },
}));
vi.mock('country-state-city', () => ({
	Country: { getAllCountries: vi.fn().mockReturnValue([{ name: 'Mexico', isoCode: 'MX' }]) },
	State: { getStatesOfCountry: vi.fn().mockReturnValue([]) },
}));
vi.mock('@/stores/participantStore', () => ({
	useParticipantStore: () => ({ createParticipant: vi.fn() }),
}));

// Los pasos hijos no importan aquí: validamos los schemas del contenedor.
vi.mock('@/components/registration/Step1PersonalInfo.vue', () => ({ default: { template: '<div />', props: ['modelValue', 'errors'] } }));
vi.mock('@/components/registration/Step2AddressInfo.vue', () => ({ default: { template: '<div />', props: ['modelValue', 'errors'] } }));
vi.mock('@/components/registration/Step3ServiceInfo.vue', () => ({ default: { template: '<div />', props: ['modelValue', 'errors'] } }));
vi.mock('@/components/registration/Step4EmergencyContact.vue', () => ({ default: { template: '<div />', props: ['modelValue', 'errors', 'type'] } }));
vi.mock('@/components/registration/Step5OtherInfo.vue', () => ({ default: { template: '<div />', props: ['modelValue', 'errors'] } }));
vi.mock('@/components/registration/Step5ServerInfo.vue', () => ({ default: { template: '<div />', props: ['modelValue', 'errors'] } }));
vi.mock('@/components/AngelitoAvailabilityEditor.vue', () => ({ default: { template: '<div />' } }));

const mountForm = async (country: string | null, type = 'walker') => {
	global.fetch = vi.fn().mockResolvedValue({
		ok: true,
		json: () => Promise.resolve({ id: 'retreat-123', isPublic: true, country }),
	});
	const pinia = createPinia();
	setActivePinia(pinia);
	const wrapper = mount(ParticipantRegistrationView, {
		props: { retreatId: 'retreat-123', type },
		global: { plugins: [pinia], mocks: { $t: (k: string) => k } },
	});
	await flushPromises();
	await nextTick();
	return wrapper;
};

describe('Registro — validación de teléfono por país del retiro', () => {
	beforeEach(() => vi.clearAllMocks());
	afterEach(() => vi.restoreAllMocks());

	it('expone el país del retiro recibido del endpoint público', async () => {
		const wrapper = await mountForm('México');
		expect((wrapper.vm as any).retreatCountry).toBe('México');
	});

	it('rechaza el paso 1 si cellPhone tiene letras (retiro México)', async () => {
		const wrapper = await mountForm('México');
		const vm = wrapper.vm as any;
		Object.assign(vm.formData, {
			firstName: 'Ana', lastName: 'Lopez', nickname: 'Ani',
			birthDate: '1990-01-01', maritalStatus: 'S',
			email: 'ana@example.com', occupation: 'Dev',
			acceptedPrivacyNotice: true,
			cellPhone: '55ABC45678',
		});
		const ok = vm.validateStep(1);
		expect(ok).toBe(false);
		expect(vm.formErrors.cellPhone).toMatch(/solo puede contener números/);
	});

	it('rechaza el paso 1 si cellPhone no tiene 10 dígitos (retiro México)', async () => {
		const wrapper = await mountForm('Mexico');
		const vm = wrapper.vm as any;
		Object.assign(vm.formData, {
			firstName: 'Ana', lastName: 'Lopez', nickname: 'Ani',
			birthDate: '1990-01-01', maritalStatus: 'S',
			email: 'ana@example.com', occupation: 'Dev',
			acceptedPrivacyNotice: true,
			cellPhone: '12345',
		});
		expect(vm.validateStep(1)).toBe(false);
		expect(vm.formErrors.cellPhone).toMatch(/10 dígitos/);
	});

	it('acepta el paso 1 con separadores de formato (se normalizan)', async () => {
		const wrapper = await mountForm('México');
		const vm = wrapper.vm as any;
		Object.assign(vm.formData, {
			firstName: 'Ana', lastName: 'Lopez', nickname: 'Ani',
			birthDate: '1990-01-01', maritalStatus: 'S',
			email: 'ana@example.com', occupation: 'Dev',
			acceptedPrivacyNotice: true,
			cellPhone: '(55) 1234-5678',
		});
		expect(vm.validateStep(1)).toBe(true);
		expect(vm.formErrors.cellPhone).toBeUndefined();
	});

	it('sin país en el retiro: solo exige dígitos, no longitud', async () => {
		const wrapper = await mountForm(null);
		const vm = wrapper.vm as any;
		Object.assign(vm.formData, {
			firstName: 'Ana', lastName: 'Lopez', nickname: 'Ani',
			birthDate: '1990-01-01', maritalStatus: 'S',
			email: 'ana@example.com', occupation: 'Dev',
			acceptedPrivacyNotice: true,
			cellPhone: '123456789012',
		});
		// 12 dígitos: válido porque no hay país con regla de longitud.
		expect(vm.validateStep(1)).toBe(true);
	});
});
