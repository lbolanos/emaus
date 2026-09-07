import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { nextTick } from 'vue';
import CoupleRegistrationView from '../CoupleRegistrationView.vue';

const toastMock = vi.fn();
const createCoupleParticipantMock = vi.fn();

vi.mock('@repo/ui', () => ({
	Card: { name: 'Card', template: '<div class="card"><slot /></div>' },
	CardContent: { name: 'CardContent', template: '<div><slot /></div>' },
	CardDescription: { name: 'CardDescription', template: '<p><slot /></p>' },
	CardHeader: { name: 'CardHeader', template: '<div><slot /></div>' },
	CardTitle: { name: 'CardTitle', template: '<h3><slot /></h3>' },
	Button: {
		name: 'Button',
		props: ['disabled', 'variant'],
		// Sin `emits`: el @click del padre cae como listener nativo en el <button>.
		template: '<button :disabled="disabled"><slot /></button>',
	},
	Input: {
		name: 'Input',
		props: ['modelValue', 'type', 'id'],
		template:
			'<input :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
		emits: ['update:modelValue'],
	},
	Label: { name: 'Label', props: ['for'], template: '<label><slot /></label>' },
	Select: {
		name: 'Select',
		props: ['modelValue'],
		template: '<div class="select"><slot /></div>',
		emits: ['update:modelValue'],
	},
	SelectContent: { name: 'SelectContent', template: '<div><slot /></div>' },
	SelectItem: { name: 'SelectItem', props: ['value'], template: '<div><slot /></div>' },
	SelectTrigger: { name: 'SelectTrigger', template: '<div><slot /></div>' },
	SelectValue: { name: 'SelectValue', props: ['placeholder'], template: '<span />' },
	useToast: () => ({ toast: toastMock }),
}));

vi.mock('@/config/runtimeConfig', () => ({
	getApiUrl: () => 'http://localhost:3001',
}));

vi.mock('@/services/recaptcha', () => ({
	getRecaptchaToken: vi.fn().mockResolvedValue('mock-token'),
	RECAPTCHA_ACTIONS: { PARTICIPANT_REGISTER: 'register' },
}));

vi.mock('@/stores/participantStore', () => ({
	useParticipantStore: () => ({
		createCoupleParticipant: createCoupleParticipantMock,
	}),
}));

// Steps mockeados: emiten el modelo completo para poder llenar cada paso desde el
// test. Factories inline — vi.mock se hoistea y no puede referenciar helpers.
vi.mock('@/components/registration/Step1PersonalInfo.vue', () => ({
	default: {
		name: 'Step1PersonalInfo',
		props: ['modelValue', 'errors'],
		emits: ['update:modelValue'],
		template: '<div class="step1" />',
	},
}));
vi.mock('@/components/registration/Step2AddressInfo.vue', () => ({
	default: {
		name: 'Step2AddressInfo',
		props: ['modelValue', 'errors'],
		emits: ['update:modelValue'],
		template: '<div class="step2" />',
	},
}));
vi.mock('@/components/registration/Step3ServiceInfo.vue', () => ({
	default: {
		name: 'Step3ServiceInfo',
		props: ['modelValue', 'errors', 'type'],
		emits: ['update:modelValue'],
		template: '<div class="step3" />',
	},
}));
vi.mock('@/components/registration/Step4EmergencyContact.vue', () => ({
	default: {
		name: 'Step4EmergencyContact',
		props: ['modelValue', 'errors', 'type'],
		emits: ['update:modelValue'],
		template: '<div class="step4" />',
	},
}));
vi.mock('@/components/registration/Step5ServerInfo.vue', () => ({
	default: {
		name: 'Step5ServerInfo',
		props: [
			'modelValue',
			'errors',
			'shirtTypes',
			'retreatStartDate',
			'retreatEndDate',
			'mealChargesEnabled',
			'allowAngelito',
		],
		emits: ['update:modelValue'],
		template: '<div class="step5server" />',
	},
}));

const validSpouse = (overrides: Record<string, unknown> = {}) => ({
	firstName: 'Juan',
	lastName: 'Pérez',
	nickname: 'Juan',
	birthDate: '1980-05-10',
	maritalStatus: 'C',
	parish: '',
	homePhone: '',
	workPhone: '',
	cellPhone: '5512345678',
	email: 'pareja@example.com',
	occupation: 'Ingeniero',
	acceptedPrivacyNotice: true,
	snores: false,
	hasMedication: false,
	medicationDetails: '',
	medicationSchedule: '',
	hasDietaryRestrictions: false,
	dietaryRestrictionsDetails: '',
	hasDisability: false,
	disabilitySupport: '',
	sacraments: ['marriage'],
	tshirtSize: 'M',
	...overrides,
});

const validEmergency = {
	emergencyContact1Name: 'Contacto Uno',
	emergencyContact1Relation: 'Hermano',
	emergencyContact1HomePhone: '',
	emergencyContact1WorkPhone: '',
	emergencyContact1CellPhone: '5587654321',
	emergencyContact1Email: 'c1@example.com',
	emergencyContact2Name: 'Contacto Dos',
	emergencyContact2Relation: 'Amiga',
	emergencyContact2HomePhone: '',
	emergencyContact2WorkPhone: '',
	emergencyContact2CellPhone: '5511223344',
	emergencyContact2Email: 'c2@example.com',
};

const validAddress = {
	street: 'Calle 1',
	houseNumber: '10',
	postalCode: '01000',
	neighborhood: 'Centro',
	city: 'CDMX',
	state: 'CDMX',
	country: 'MX',
};

const mountView = async (type = 'walker') => {
	global.fetch = vi.fn().mockResolvedValue({
		ok: true,
		json: () =>
			Promise.resolve({
				id: 'retreat-1',
				parish: 'San José',
				isPublic: true,
				retreat_type: 'couples',
				isRegistrationClosed: false,
				shirtTypes: [],
			}),
	}) as any;
	const wrapper = mount(CoupleRegistrationView, {
		props: { slug: 'sanjose', type },
		global: {
			mocks: {
				$t: (key: string) => key,
			},
		},
	});
	await flushPromises();
	return wrapper;
};

const emitModel = async (wrapper: any, name: string, data: Record<string, unknown>) => {
	wrapper.findComponent({ name }).vm.$emit('update:modelValue', data);
	await nextTick();
};

const clickNext = async (wrapper: any) => {
	await wrapper.find('[data-testid="couple-next"]').trigger('click');
	await nextTick();
};

describe('CoupleRegistrationView', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		localStorage.clear();
		setActivePinia(createPinia());
	});

	it('arranca en el paso de datos de él', async () => {
		const wrapper = await mountView();
		expect(wrapper.find('.step1').exists()).toBe(true);
		expect(wrapper.text()).toContain('coupleRegistration.husbandSection');
	});

	it('no avanza con datos vacíos y marca errores', async () => {
		const wrapper = await mountView();
		await clickNext(wrapper);
		expect(toastMock).toHaveBeenCalled();
		expect(wrapper.text()).toContain('coupleRegistration.husbandSection');
	});

	it('al completar los datos de él, avanza y pre-llena email y apellido de ella', async () => {
		const wrapper = await mountView();
		await emitModel(wrapper, 'Step1PersonalInfo', validSpouse());
		await clickNext(wrapper);
		expect(wrapper.text()).toContain('coupleRegistration.wifeSection');
		const wifeStep = wrapper.findComponent({ name: 'Step1PersonalInfo' });
		expect(wifeStep.props('modelValue').email).toBe('pareja@example.com');
		expect(wifeStep.props('modelValue').lastName).toBe('Pérez');
	});

	it('guarda draft en localStorage al capturar datos', async () => {
		const wrapper = await mountView();
		await emitModel(wrapper, 'Step1PersonalInfo', validSpouse());
		await flushPromises();
		const raw = localStorage.getItem('registration-draft:couple:walker:retreat-1');
		expect(raw).toBeTruthy();
		const parsed = JSON.parse(raw!);
		expect(parsed.husband.firstName).toBe('Juan');
		// El consentimiento de privacidad nunca se persiste en el draft.
		expect(parsed.husband.acceptedPrivacyNotice).toBeUndefined();
	});

	it('flujo completo: envía un solo body con ambos cónyuges y datos compartidos', async () => {
		createCoupleParticipantMock.mockResolvedValue({
			husband: { id: 'h1', type: 'walker' },
			wife: { id: 'w1', type: 'walker' },
		});
		const wrapper = await mountView();

		// 1: él (incluye salud y talla para los pasos posteriores)
		await emitModel(wrapper, 'Step1PersonalInfo', validSpouse());
		await clickNext(wrapper);
		// 2: ella
		await emitModel(
			wrapper,
			'Step1PersonalInfo',
			validSpouse({ firstName: 'María', tshirtSize: 'S' }),
		);
		await clickNext(wrapper);
		// 3: dirección compartida
		await emitModel(wrapper, 'Step2AddressInfo', validAddress);
		await clickNext(wrapper);
		// 4 y 5: salud (ya válida en los objetos emitidos)
		await clickNext(wrapper);
		await clickNext(wrapper);
		// 6: emergencia compartida
		await emitModel(wrapper, 'Step4EmergencyContact', validEmergency);
		await clickNext(wrapper);
		// 7: tallas ya capturadas; invitador vacío es válido
		await clickNext(wrapper);
		// 8: resumen → submit
		expect(wrapper.find('[data-testid="couple-submit"]').exists()).toBe(true);
		await wrapper.find('[data-testid="couple-submit"]').trigger('click');
		await flushPromises();

		expect(createCoupleParticipantMock).toHaveBeenCalledTimes(1);
		const [body] = createCoupleParticipantMock.mock.calls[0];
		expect(body.retreatId).toBe('retreat-1');
		expect(body.type).toBe('walker');
		expect(body.acceptedPrivacyNotice).toBe(true);
		expect(body.husband.firstName).toBe('Juan');
		expect(body.wife.firstName).toBe('María');
		// Datos compartidos copiados a ambos cónyuges
		expect(body.husband.street).toBe('Calle 1');
		expect(body.wife.street).toBe('Calle 1');
		expect(body.husband.emergencyContact1Name).toBe('Contacto Uno');
		expect(body.wife.emergencyContact1Name).toBe('Contacto Uno');

		// Pantalla de éxito y draft limpio
		expect(wrapper.find('[data-testid="couple-success"]').exists()).toBe(true);
		expect(localStorage.getItem('registration-draft:couple:walker:retreat-1')).toBeNull();
	});

	it('en retiros de servidores muestra Step5ServerInfo sin angelito', async () => {
		const wrapper = await mountView('server');
		// Avanza hasta el paso "other" emitiendo datos válidos
		await emitModel(wrapper, 'Step1PersonalInfo', validSpouse());
		await clickNext(wrapper);
		await emitModel(wrapper, 'Step1PersonalInfo', validSpouse({ firstName: 'María' }));
		await clickNext(wrapper);
		await emitModel(wrapper, 'Step2AddressInfo', validAddress);
		await clickNext(wrapper);
		await clickNext(wrapper);
		await clickNext(wrapper);
		// Emergencia: opcional para servidores
		await clickNext(wrapper);
		const serverSteps = wrapper.findAllComponents({ name: 'Step5ServerInfo' });
		expect(serverSteps.length).toBe(2);
		expect(serverSteps[0].props('allowAngelito')).toBe(false);
	});
});
