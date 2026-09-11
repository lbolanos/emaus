import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { nextTick } from 'vue';
import ParticipantRegistrationView from '../ParticipantRegistrationView.vue';
import { confirmExistingRegistration } from '@/services/api';
import { getRecaptchaToken } from '@/services/recaptcha';

// The shirt select ships with "No necesita" preselected, so a server who never
// touches it submits the registration without a size they never chose. Before
// registering, the app must ask once whether they really need no shirt — both
// in the multi-step form and on the "¿Eres tú?" identity screen.

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
// The address selects load each list separately: importing the whole package
// drags city.json (7.7 MB), which is what used to kill the step on the iPhone.
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
 * Mounts the view with a retreat that offers shirts to servers. `onIdentityScreen`
 * leaves the state the email lookup produces: the "¿Eres tú?" identity screen.
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

describe('Server registration — shirt question before submitting without a size', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		// restoreAllMocks (below) disarms every factory mock, not just the ones
		// this test re-arms: without this line the view gets an undefined
		// recaptcha token from the second test onward.
		vi.mocked(getRecaptchaToken).mockResolvedValue('mock-token');
		vi.mocked(confirmExistingRegistration).mockResolvedValue({ success: true, firstName: 'Ana', lastName: 'López' } as any);
	});
	afterEach(() => vi.restoreAllMocks());

	it('form: asks instead of submitting when no size is chosen', async () => {
		const { wrapper, vm } = await mountView();
		vm.currentStep = 6;
		await nextTick();

		vm.attemptSubmit();
		await nextTick();

		expect(vm.shirtConfirmSource).toBe('form');
		expect(wrapper.text()).toContain('serverRegistration.shirtConfirm.title');
		// Never reached the submit: the empty form would have toasted a
		// validation error.
		expect(toastMock).not.toHaveBeenCalled();
	});

	it('form: does not ask when a size is chosen', async () => {
		const { wrapper, vm } = await mountView();
		vm.formData.shirtSizesByType = { 'type-white': 'M' };
		vm.currentStep = 6;
		await nextTick();

		vm.attemptSubmit();

		expect(vm.shirtConfirmSource).toBeNull();
		expect(wrapper.text()).not.toContain('serverRegistration.shirtConfirm.title');
	});

	it('form: "I want to pick a size" goes back to step 5 and closes the question', async () => {
		const { vm } = await mountView();
		vm.currentStep = 6;
		await nextTick();
		vm.attemptSubmit();
		expect(vm.shirtConfirmSource).toBe('form');

		vm.backToShirtSelection();

		expect(vm.shirtConfirmSource).toBeNull();
		expect(vm.currentStep).toBe(5);
	});

	it('form: step navigation closes a pending question', async () => {
		const { wrapper, vm } = await mountView();
		vm.currentStep = 6;
		await nextTick();
		vm.attemptSubmit();
		expect(vm.shirtConfirmSource).toBe('form');

		vm.prevStep();

		expect(vm.shirtConfirmSource).toBeNull();
		expect(wrapper.text()).not.toContain('serverRegistration.shirtConfirm.title');
	});

	it('form: the submit button is disabled while a submission is in flight', async () => {
		const { wrapper, vm } = await mountView();
		vm.currentStep = 6;
		await nextTick();

		const submitButton = wrapper
			.findAll('button')
			.find((b) => b.classes().includes('bg-green-600') && b.classes().includes('hover:bg-green-700'));
		expect(submitButton).toBeDefined();

		vm.isSubmitting = true;
		await nextTick();

		expect(submitButton!.attributes('disabled')).toBeDefined();
	});

	it('form: confirming the question continues the submission', async () => {
		const { vm } = await mountView();
		vm.currentStep = 6;
		await nextTick();
		vm.attemptSubmit();
		expect(vm.shirtConfirmSource).toBe('form');

		vm.confirmNoShirtNeeded();
		await flushPromises();

		expect(vm.shirtConfirmSource).toBeNull();
		// Evidence the submit started: onSubmit validates everything, and with
		// an empty form it toasts the error of the missing step.
		expect(toastMock).toHaveBeenCalledWith(
			expect.objectContaining({ title: 'serverRegistration.toasts.validationTitle' }),
		);
	});

	it('identity screen: asks instead of confirming the registration', async () => {
		const { wrapper, vm } = await mountView(true);

		vm.attemptConfirmIdentity();
		await nextTick();

		expect(vm.shirtConfirmSource).toBe('lookup');
		expect(wrapper.text()).toContain('serverRegistration.shirtConfirm.title');
		expect(confirmExistingRegistration).not.toHaveBeenCalled();
	});

	it('identity screen: confirms right away when a size is chosen', async () => {
		const { vm } = await mountView(true);
		vm.lookupShirtSizes = { 'type-white': 'M' };

		vm.attemptConfirmIdentity();
		await flushPromises();

		expect(vm.shirtConfirmSource).toBeNull();
		expect(confirmExistingRegistration).toHaveBeenCalledTimes(1);
	});

	it('identity screen: confirming the question does register', async () => {
		const { vm } = await mountView(true);
		vm.attemptConfirmIdentity();
		expect(vm.shirtConfirmSource).toBe('lookup');

		vm.confirmNoShirtNeeded();
		await flushPromises();

		expect(vm.shirtConfirmSource).toBeNull();
		expect(confirmExistingRegistration).toHaveBeenCalledTimes(1);
	});

	it('identity screen: denying the identity closes a pending question', async () => {
		const { vm } = await mountView(true);
		vm.attemptConfirmIdentity();
		expect(vm.shirtConfirmSource).toBe('lookup');

		vm.handleDenyIdentity();

		expect(vm.shirtConfirmSource).toBeNull();
	});

	it('picking a size while the question is open closes it', async () => {
		const { vm } = await mountView(true);
		vm.attemptConfirmIdentity();
		expect(vm.shirtConfirmSource).toBe('lookup');

		vm.lookupShirtSizes = { 'type-white': 'M' };
		await nextTick();

		expect(vm.shirtConfirmSource).toBeNull();
	});

	it('retreat with no shirts for servers: does not ask', async () => {
		const { wrapper, vm } = await mountView(true, []);
		vm.currentStep = 6;
		await nextTick();

		vm.attemptSubmit();

		expect(vm.shirtConfirmSource).toBeNull();
		expect(wrapper.text()).not.toContain('serverRegistration.shirtConfirm.title');
	});
});
