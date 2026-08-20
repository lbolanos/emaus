import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { nextTick } from 'vue';
import ParticipantRegistrationView from '../ParticipantRegistrationView.vue';

// The server's step 5 stores sizes in `shirtSizesByType`, keyed by the shirt types
// configured for the retreat. The summary (step 6) read the legacy
// needsWhiteShirt/needsBlueShirt/needsJacket fields instead, which that form no longer
// fills, so it always said "No necesita" and servers thought their picks were lost
// (reported 2026-08-20).

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
vi.mock('country-state-city', () => ({
	Country: { getAllCountries: vi.fn().mockReturnValue([{ name: 'Mexico', isoCode: 'MX' }]) },
	State: { getStatesOfCountry: vi.fn().mockReturnValue([]) },
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
	{ id: 'type-jacket', name: 'Chamarra', optionalForServers: true, requiredForWalkers: false, sortOrder: 2, availableSizes: ['S', 'M', 'G'] },
	{ id: 'type-white', name: 'Playera blanca', optionalForServers: true, requiredForWalkers: false, sortOrder: 1, availableSizes: ['S', 'M', 'G'] },
	{ id: 'type-walker', name: 'Playera de caminante', optionalForServers: false, requiredForWalkers: true, sortOrder: 0, availableSizes: ['S', 'M', 'G'] },
];

const mountAtSummary = async (
	shirtSizesByType: Record<string, string>,
	shirtTypes: unknown[] = SHIRT_TYPES,
	extraFormData: Record<string, unknown> = {},
) => {
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
	vm.formData.shirtSizesByType = shirtSizesByType;
	Object.assign(vm.formData, extraFormData);
	vm.currentStep = 6;
	await nextTick();
	return wrapper;
};

describe('Server registration — shirt size summary (step 6)', () => {
	beforeEach(() => vi.clearAllMocks());
	afterEach(() => vi.restoreAllMocks());

	it('shows the chosen size for each of the retreat shirt types', async () => {
		const wrapper = await mountAtSummary({ 'type-white': 'M', 'type-jacket': 'G' });
		const rows = (wrapper.vm as any).summaryData;

		expect(rows).toEqual(
			expect.arrayContaining([
				{ label: 'Playera blanca', rawLabel: true, value: 'M' },
				{ label: 'Chamarra', rawLabel: true, value: 'G' },
			]),
		);
		const text = wrapper.text();
		expect(text).toContain('Playera blanca');
		expect(text).toContain('Chamarra');
	});

	it('drops the legacy shirt fields this form no longer fills', async () => {
		const wrapper = await mountAtSummary({ 'type-white': 'M', 'type-jacket': 'G' });
		const text = wrapper.text();

		expect(text).not.toContain('serverRegistration.fields.needsWhiteShirt');
		expect(text).not.toContain('serverRegistration.fields.needsBlueShirt');
		expect(text).not.toContain('serverRegistration.fields.needsJacket');
		// With two sizes picked, no shirt row should read "No necesita".
		expect(text).not.toContain('serverRegistration.fields.noSizeNeeded');
	});

	it('keeps sortOrder and skips types that are not offered to servers', async () => {
		const wrapper = await mountAtSummary({ 'type-white': 'M', 'type-jacket': 'G' });
		const labels = ((wrapper.vm as any).summaryData as Array<{ label: string; rawLabel?: boolean }>)
			.filter((r) => r.rawLabel)
			.map((r) => r.label);

		expect(labels).toEqual(['Playera blanca', 'Chamarra']);
	});

	it('says "No necesita" only for types the server left without a size', async () => {
		const wrapper = await mountAtSummary({ 'type-white': 'M', 'type-jacket': 'null' });
		const rows = (wrapper.vm as any).summaryData;

		expect(rows).toEqual(
			expect.arrayContaining([
				{ label: 'Playera blanca', rawLabel: true, value: 'M' },
				{ label: 'Chamarra', rawLabel: true, value: 'serverRegistration.fields.noSizeNeeded' },
			]),
		);
	});

	it('adds no shirt rows when the retreat has no types configured', async () => {
		const wrapper = await mountAtSummary({}, []);
		const rows = (wrapper.vm as any).summaryData as Array<{ rawLabel?: boolean }>;

		expect(rows.some((r) => r.rawLabel)).toBe(false);
		// The legacy fields must not come back as filler either.
		expect(wrapper.text()).not.toContain('serverRegistration.fields.needsWhiteShirt');
		expect(wrapper.text()).not.toContain('serverRegistration.fields.needsJacket');
	});
});

// The emergency contact is optional for servers, and the summary used to print the
// empty template as "() -".
describe('Server registration — emergency contact row (step 6)', () => {
	beforeEach(() => vi.clearAllMocks());
	afterEach(() => vi.restoreAllMocks());

	it('omits the row when the server left the contact empty', async () => {
		const wrapper = await mountAtSummary({ 'type-white': 'M' });
		const labels = ((wrapper.vm as any).summaryData as Array<{ label: string }>).map((r) => r.label);

		expect(labels).not.toContain('serverRegistration.emergencyContact1');
		expect(wrapper.text()).not.toContain('() -');
	});

	it('shows name, relation and the first phone available', async () => {
		const wrapper = await mountAtSummary({}, SHIRT_TYPES, {
			emergencyContact1Name: 'Ana López',
			emergencyContact1Relation: 'Esposa',
			emergencyContact1CellPhone: '4771234567',
		});
		const row = ((wrapper.vm as any).summaryData as Array<{ label: string; value?: string }>).find(
			(r) => r.label === 'serverRegistration.emergencyContact1',
		);

		expect(row?.value).toBe('Ana López (Esposa) - 4771234567');
	});

	it('falls back to the work phone and skips a missing relation', async () => {
		const wrapper = await mountAtSummary({}, SHIRT_TYPES, {
			emergencyContact1Name: 'Ana López',
			emergencyContact1Relation: '',
			emergencyContact1CellPhone: '',
			emergencyContact1WorkPhone: '4779998877',
		});
		const row = ((wrapper.vm as any).summaryData as Array<{ label: string; value?: string }>).find(
			(r) => r.label === 'serverRegistration.emergencyContact1',
		);

		expect(row?.value).toBe('Ana López - 4779998877');
	});
});
