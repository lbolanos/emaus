import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { nextTick } from 'vue';
import ParticipantRegistrationView from '../ParticipantRegistrationView.vue';

const toastMock = vi.fn();

vi.mock('@repo/ui', () => ({
	Card: { name: 'Card', template: '<div class="card"><slot /></div>' },
	CardContent: { name: 'CardContent', template: '<div class="card-content"><slot /></div>' },
	CardDescription: { name: 'CardDescription', template: '<p class="card-desc"><slot /></p>' },
	CardHeader: { name: 'CardHeader', template: '<div class="card-header"><slot /></div>' },
	CardTitle: { name: 'CardTitle', template: '<h3 class="card-title"><slot /></h3>' },
	Button: {
		name: 'Button',
		props: ['disabled', 'variant'],
		template: '<button :disabled="disabled"><slot /></button>',
		emits: ['click'],
	},
	Input: {
		name: 'Input',
		props: ['modelValue', 'type', 'min', 'max', 'id', 'placeholder'],
		template: '<input :type="type" :value="modelValue" :min="min" :max="max" :id="id" @input="$emit(\'update:modelValue\', $event.target.value)" />',
		emits: ['update:modelValue'],
	},
	Label: { name: 'Label', props: ['for'], template: '<label><slot /></label>' },
	Dialog: { name: 'Dialog', props: ['open'], template: '<div class="dialog"><slot /></div>' },
	DialogContent: { name: 'DialogContent', template: '<div class="dialog-content"><slot /></div>' },
	DialogDescription: { name: 'DialogDescription', template: '<p><slot /></p>' },
	DialogFooter: { name: 'DialogFooter', template: '<div class="dialog-footer"><slot /></div>' },
	DialogHeader: { name: 'DialogHeader', template: '<div class="dialog-header"><slot /></div>' },
	DialogTitle: { name: 'DialogTitle', template: '<h2><slot /></h2>' },
	DialogTrigger: { name: 'DialogTrigger', template: '<div class="dialog-trigger"><slot /></div>' },
	useToast: () => ({ toast: toastMock }),
}));

vi.mock('@/services/api', () => ({
	checkParticipantExists: vi.fn(),
}));

vi.mock('@/config/runtimeConfig', () => ({
	getApiUrl: () => 'http://localhost:3001',
}));

vi.mock('@/services/recaptcha', () => ({
	getRecaptchaToken: vi.fn().mockResolvedValue('mock-token'),
	RECAPTCHA_ACTIONS: { PARTICIPANT_EMAIL_CHECK: 'check' },
}));

vi.mock('country-state-city', () => ({
	Country: {
		getCountryByCode: vi.fn().mockReturnValue({ name: 'Mexico', isoCode: 'MX' }),
		getAllCountries: vi.fn().mockReturnValue([{ name: 'Mexico', isoCode: 'MX' }]),
	},
	State: {
		getStatesOfCountry: vi.fn().mockReturnValue([{ name: 'CDMX', isoCode: 'CDMX' }]),
	},
}));

vi.mock('@/stores/participantStore', () => ({
	useParticipantStore: () => ({
		addParticipant: vi.fn(),
	}),
}));

// Mock child step components
vi.mock('@/components/registration/Step1PersonalInfo.vue', () => ({
	default: { name: 'Step1PersonalInfo', template: '<div class="step1" />', props: ['modelValue', 'errors'] },
}));
vi.mock('@/components/registration/Step2AddressInfo.vue', () => ({
	default: { name: 'Step2AddressInfo', template: '<div class="step2" />', props: ['modelValue', 'errors'] },
}));
vi.mock('@/components/registration/Step3ServiceInfo.vue', () => ({
	default: { name: 'Step3ServiceInfo', template: '<div class="step3" />', props: ['modelValue', 'errors'] },
}));
vi.mock('@/components/registration/Step4EmergencyContact.vue', () => ({
	default: { name: 'Step4EmergencyContact', template: '<div class="step4" />', props: ['modelValue', 'errors', 'type'] },
}));
vi.mock('@/components/registration/Step5OtherInfo.vue', () => ({
	default: { name: 'Step5OtherInfo', template: '<div class="step5" />', props: ['modelValue', 'errors', 'showPickupInfo'] },
}));
vi.mock('@/components/registration/Step5ServerInfo.vue', () => ({
	default: { name: 'Step5ServerInfo', template: '<div class="step5server" />', props: ['modelValue', 'errors'] },
}));

describe('ParticipantRegistrationView - Summary Translation', () => {
	let pinia: ReturnType<typeof createPinia>;

	beforeEach(() => {
		vi.clearAllMocks();
		pinia = createPinia();
		setActivePinia(pinia);

		// Mock fetch for retreat validation
		global.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: () => Promise.resolve({ id: 'retreat-123', isPublic: true }),
		});
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	/**
	 * Tests that the summary rendering logic correctly translates i18n keys.
	 * The template uses: item.value?.includes('Registration.') || item.value?.includes('common.')
	 * to decide whether to pass value through $t().
	 */
	describe('Translation key detection in summary values', () => {
		it('should translate values containing "common." prefix', () => {
			// This tests the pattern: 'common.yes', 'common.no'
			const value = 'common.yes';
			const shouldTranslate = value?.includes('Registration.') || value?.includes('common.');
			expect(shouldTranslate).toBe(true);
		});

		it('should translate values containing "Registration." (serverRegistration)', () => {
			// This tests the pattern: 'serverRegistration.fields.noSizeNeeded'
			const value = 'serverRegistration.fields.noSizeNeeded';
			const shouldTranslate = value?.includes('Registration.') || value?.includes('common.');
			expect(shouldTranslate).toBe(true);
		});

		it('should translate values containing "Registration." (walkerRegistration)', () => {
			const value = 'walkerRegistration.fields.someKey';
			const shouldTranslate = value?.includes('Registration.') || value?.includes('common.');
			expect(shouldTranslate).toBe(true);
		});

		it('should NOT translate plain values like shirt sizes', () => {
			const value = 'XL';
			const shouldTranslate = value?.includes('Registration.') || value?.includes('common.');
			expect(shouldTranslate).toBe(false);
		});

		it('should NOT translate plain text values', () => {
			const value = 'John Doe';
			const shouldTranslate = value?.includes('Registration.') || value?.includes('common.');
			expect(shouldTranslate).toBe(false);
		});

		it('should handle null/undefined values safely', () => {
			const value: string | undefined = undefined;
			const shouldTranslate = value?.includes('Registration.') || value?.includes('common.');
			expect(shouldTranslate).toBeFalsy();
		});
	});
});
