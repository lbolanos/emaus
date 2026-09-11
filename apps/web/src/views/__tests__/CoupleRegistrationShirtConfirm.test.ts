import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { nextTick } from 'vue';
import CoupleRegistrationView from '../CoupleRegistrationView.vue';
import { getRecaptchaToken } from '@/services/recaptcha';

// Server couples pick shirt sizes through the same Step5ServerInfo the
// individual registration uses, so the select ships with "No necesita"
// preselected and a couple can reach the submit without any size they actually
// chose. Before registering, the app must ask once — covering both spouses:
// the question appears only when neither picked a size.

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

vi.mock('@/components/registration/Step1PersonalInfo.vue', () => ({
	default: { name: 'Step1PersonalInfo', props: ['modelValue', 'errors'], template: '<div class="step1" />' },
}));
vi.mock('@/components/registration/Step2AddressInfo.vue', () => ({
	default: { name: 'Step2AddressInfo', props: ['modelValue', 'errors'], template: '<div class="step2" />' },
}));
vi.mock('@/components/registration/Step3ServiceInfo.vue', () => ({
	default: { name: 'Step3ServiceInfo', props: ['modelValue', 'errors', 'type'], template: '<div class="step3" />' },
}));
vi.mock('@/components/registration/Step4EmergencyContact.vue', () => ({
	default: { name: 'Step4EmergencyContact', props: ['modelValue', 'errors', 'type'], template: '<div class="step4" />' },
}));
vi.mock('@/components/registration/Step5ServerInfo.vue', () => ({
	default: {
		name: 'Step5ServerInfo',
		props: ['modelValue', 'errors', 'shirtTypes', 'allowAngelito'],
		emits: ['update:modelValue'],
		template: '<div class="step5server" />',
	},
}));

const SHIRT_TYPES = [
	{ id: 'type-white', name: 'Playera blanca', optionalForServers: true, requiredForWalkers: false, sortOrder: 1, availableSizes: ['S', 'M', 'G'] },
];

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
	shirtSizesByType: {} as Record<string, string>,
	...overrides,
});

const validAddress = {
	street: 'Calle 1',
	houseNumber: '10',
	postalCode: '01000',
	neighborhood: 'Centro',
	city: 'CDMX',
	state: 'CDMX',
	country: 'MX',
};

/** Mounts the server-couple wizard with a retreat that offers server shirts. */
const mountServerView = async (shirtTypes: unknown[] = SHIRT_TYPES) => {
	global.fetch = vi.fn().mockResolvedValue({
		ok: true,
		json: () =>
			Promise.resolve({
				id: 'retreat-1',
				parish: 'San José',
				isPublic: true,
				retreat_type: 'couples',
				isRegistrationClosed: false,
				shirtTypes,
			}),
	}) as any;
	const wrapper = mount(CoupleRegistrationView, {
		props: { slug: 'sanjose', type: 'server' },
		global: { mocks: { $t: (key: string) => key } },
	});
	await flushPromises();
	return wrapper;
};

/** Walks the wizard up to the summary, optionally setting spouse shirt sizes. */
const reachSummary = async (
	wrapper: any,
	sizes: { husband?: Record<string, string>; wife?: Record<string, string> } = {},
) => {
	const emit = async (name: string, data: Record<string, unknown>) => {
		wrapper.findComponent({ name }).vm.$emit('update:modelValue', data);
		await nextTick();
	};
	const next = async () => {
		await wrapper.find('[data-testid="couple-next"]').trigger('click');
		await nextTick();
	};

	await emit('Step1PersonalInfo', validSpouse({ shirtSizesByType: sizes.husband ?? {} }));
	await next();
	await emit('Step1PersonalInfo', validSpouse({ firstName: 'María', shirtSizesByType: sizes.wife ?? {} }));
	await next();
	await emit('Step2AddressInfo', validAddress);
	await next();
	await next();
	await next();
	// Emergency contacts are optional for servers.
	await next();
	// 'other' step: shirt sizes arrive through Step5ServerInfo's model.
	const serverSteps = wrapper.findAllComponents({ name: 'Step5ServerInfo' });
	if (sizes.husband) {
		serverSteps[0].vm.$emit('update:modelValue', validSpouse({ shirtSizesByType: sizes.husband }));
		await nextTick();
	}
	if (sizes.wife) {
		serverSteps[1].vm.$emit('update:modelValue', validSpouse({ firstName: 'María', shirtSizesByType: sizes.wife }));
		await nextTick();
	}
	await next();
	// Summary reached: the submit button is the only way forward.
	expect(wrapper.find('[data-testid="couple-submit"]').exists()).toBe(true);
	return wrapper;
};

const clickSubmit = async (wrapper: any) => {
	await wrapper.find('[data-testid="couple-submit"]').trigger('click');
	await flushPromises();
};

describe('Couple server registration — shirt question before submitting without a size', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		localStorage.clear();
		setActivePinia(createPinia());
		// clearAllMocks does not disarm factory mocks, but a global restoreMocks
		// config would: re-arming keeps the view from getting an undefined token.
		vi.mocked(getRecaptchaToken).mockResolvedValue('mock-token');
		createCoupleParticipantMock.mockResolvedValue({
			husband: { id: 'h1', type: 'server' },
			wife: { id: 'w1', type: 'server' },
		});
	});

	it('asks instead of submitting when neither spouse chose a size', async () => {
		const wrapper = await mountServerView();
		await reachSummary(wrapper);

		await clickSubmit(wrapper);

		expect(wrapper.text()).toContain('coupleRegistration.shirtConfirm.title');
		expect(createCoupleParticipantMock).not.toHaveBeenCalled();
	});

	it('does not ask when either spouse chose a size', async () => {
		const wrapper = await mountServerView();
		await reachSummary(wrapper, { husband: { 'type-white': 'M' } });

		await clickSubmit(wrapper);

		expect(wrapper.text()).not.toContain('coupleRegistration.shirtConfirm.title');
		expect(createCoupleParticipantMock).toHaveBeenCalledTimes(1);
	});

	it('"We want to pick sizes" goes back to the shirt step and closes the question', async () => {
		const wrapper = await mountServerView();
		await reachSummary(wrapper);
		await clickSubmit(wrapper);
		expect(wrapper.text()).toContain('coupleRegistration.shirtConfirm.title');

		await wrapper.findAll('button').find((b) => b.text() === 'coupleRegistration.shirtConfirm.back')!.trigger('click');
		await nextTick();

		expect(wrapper.text()).not.toContain('coupleRegistration.shirtConfirm.title');
		// Both spouses' shirt selects live on that step again.
		expect(wrapper.findAllComponents({ name: 'Step5ServerInfo' }).length).toBe(2);
	});

	it('step navigation closes a pending question', async () => {
		const wrapper = await mountServerView();
		await reachSummary(wrapper);
		await clickSubmit(wrapper);
		expect(wrapper.text()).toContain('coupleRegistration.shirtConfirm.title');

		(wrapper.vm as any).prevStep();
		await nextTick();

		expect(wrapper.text()).not.toContain('coupleRegistration.shirtConfirm.title');
	});

	it('confirming the question continues the submission', async () => {
		const wrapper = await mountServerView();
		await reachSummary(wrapper);
		await clickSubmit(wrapper);
		expect(wrapper.text()).toContain('coupleRegistration.shirtConfirm.title');

		await wrapper.findAll('button').find((b) => b.text() === 'coupleRegistration.shirtConfirm.confirm')!.trigger('click');
		await flushPromises();

		expect(wrapper.text()).not.toContain('coupleRegistration.shirtConfirm.title');
		expect(createCoupleParticipantMock).toHaveBeenCalledTimes(1);
	});

	it('retreat with no shirts for servers: does not ask', async () => {
		const wrapper = await mountServerView([]);
		await reachSummary(wrapper);

		await clickSubmit(wrapper);

		expect(wrapper.text()).not.toContain('coupleRegistration.shirtConfirm.title');
		expect(createCoupleParticipantMock).toHaveBeenCalledTimes(1);
	});
});
