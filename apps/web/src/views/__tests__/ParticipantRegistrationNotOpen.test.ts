/**
 * Retiro "Anunciado" (isPublic + registrationOpen=false) en la vista pública
 * de registro: se anuncia con fechas en la landing, pero el formulario no se
 * abre hasta que se publica.
 *
 *   - El formulario no se renderiza: panel "las inscripciones abren pronto".
 *   - Un externalRegistrationUrl del retiro NO redirige mientras no esté
 *     publicado (la parroquia no recibe caminantes de un retiro sin abrir).
 *   - Back-compat: un payload legado sin `registrationOpen` (pre-migración)
 *     sigue redirigiendo y registrando como siempre — el gate es `=== false`.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import ParticipantRegistrationView from '../ParticipantRegistrationView.vue';

vi.mock('@repo/ui', () => ({
	Card: { name: 'Card', template: '<div class="card"><slot /></div>' },
	CardContent: { name: 'CardContent', template: '<div class="card-content"><slot /></div>' },
	CardDescription: { name: 'CardDescription', template: '<p class="card-desc"><slot /></p>' },
	CardHeader: { name: 'CardHeader', template: '<div class="card-header"><slot /></div>' },
	CardTitle: { name: 'CardTitle', template: '<h3 class="card-title"><slot /></h3>' },
	Button: {
		name: 'Button',
		props: ['disabled', 'variant', 'size'],
		template: '<button :disabled="disabled"><slot /></button>',
		emits: ['click'],
	},
	Input: { name: 'Input', template: '<input />' },
	Label: { name: 'Label', template: '<label><slot /></label>' },
	// El selector de idioma de la esquina: sin estos cuatro el mock de @repo/ui
	// LANZA al resolver el componente (export faltante), igual que en la vista.
	DropdownMenu: { name: 'DropdownMenu', template: '<div class="dropdown-menu"><slot /></div>' },
	DropdownMenuContent: { name: 'DropdownMenuContent', template: '<div class="dropdown-menu-content"><slot /></div>' },
	DropdownMenuItem: {
		name: 'DropdownMenuItem',
		template: '<div class="dropdown-menu-item" @click="$emit(\'click\')"><slot /></div>',
		emits: ['click'],
	},
	DropdownMenuTrigger: { name: 'DropdownMenuTrigger', template: '<div class="dropdown-menu-trigger"><slot /></div>' },
	Dialog: { name: 'Dialog', template: '<div class="dialog"><slot /></div>' },
	DialogContent: { name: 'DialogContent', template: '<div class="dialog-content"><slot /></div>' },
	DialogDescription: { name: 'DialogDescription', template: '<p><slot /></p>' },
	DialogFooter: { name: 'DialogFooter', template: '<div class="dialog-footer"><slot /></div>' },
	DialogHeader: { name: 'DialogHeader', template: '<div class="dialog-header"><slot /></div>' },
	DialogTitle: { name: 'DialogTitle', template: '<h2><slot /></h2>' },
	DialogTrigger: { name: 'DialogTrigger', template: '<div class="dialog-trigger"><slot /></div>' },
	useToast: () => ({ toast: vi.fn() }),
}));

vi.mock('@/services/api', () => ({
	checkParticipantExists: vi.fn(),
}));

vi.mock('@/i18n', () => ({
	storeLocale: vi.fn(),
}));

vi.mock('@/config/runtimeConfig', () => ({
	getApiUrl: () => 'http://localhost:3001',
}));

vi.mock('@/services/recaptcha', () => ({
	getRecaptchaToken: vi.fn().mockResolvedValue('mock-token'),
	RECAPTCHA_ACTIONS: { PARTICIPANT_EMAIL_CHECK: 'check' },
}));

vi.mock('country-state-city/lib/country', () => ({
	default: {
		getCountryByCode: vi.fn().mockReturnValue({ name: 'Mexico', isoCode: 'MX' }),
		getAllCountries: vi.fn().mockReturnValue([{ name: 'Mexico', isoCode: 'MX' }]),
	},
}));
vi.mock('country-state-city/lib/state', () => ({
	default: {
		getStatesOfCountry: vi.fn().mockReturnValue([{ name: 'CDMX', isoCode: 'CDMX' }]),
	},
}));

vi.mock('@/stores/participantStore', () => ({
	useParticipantStore: () => ({
		addParticipant: vi.fn(),
	}),
}));

vi.mock('@/components/registration/Step1PersonalInfo.vue', () => ({
	default: { name: 'Step1PersonalInfo', template: '<div class="step1" />' },
}));
vi.mock('@/components/registration/Step2AddressInfo.vue', () => ({
	default: { name: 'Step2AddressInfo', template: '<div class="step2" />' },
}));
vi.mock('@/components/registration/Step3ServiceInfo.vue', () => ({
	default: { name: 'Step3ServiceInfo', template: '<div class="step3" />' },
}));
vi.mock('@/components/registration/Step4Review.vue', () => ({
	default: { name: 'Step4Review', template: '<div class="step4" />' },
}));
vi.mock('@/components/registration/Step5OtherInfo.vue', () => ({
	default: { name: 'Step5OtherInfo', template: '<div class="step5" />' },
}));
vi.mock('@/components/registration/Step5ServerInfo.vue', () => ({
	default: { name: 'Step5ServerInfo', template: '<div class="step5server" />' },
}));

const replaceMock = vi.fn();
const originalLocation = window.location;

const FUTURE = new Date(Date.now() + 30 * 86_400_000).toISOString();

const mockRetreatFetch = (retreat: Record<string, unknown>) => {
	global.fetch = vi.fn().mockResolvedValue({
		ok: true,
		json: () => Promise.resolve(retreat),
	});
};

const mountView = () =>
	mount(ParticipantRegistrationView, {
		props: { retreatId: 'retreat-123', type: 'walker' as const },
		global: {
			plugins: [createPinia()],
			mocks: { $t: (key: string) => key },
		},
	});

describe('ParticipantRegistrationView — retiro anunciado sin inscripción abierta', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		setActivePinia(createPinia());
		// La vista redirige con window.location.replace: reemplazable en happy-dom.
		delete (window as any).location;
		(window as any).location = { replace: replaceMock, href: 'http://localhost/' };
	});

	afterEach(() => {
		(window as any).location = originalLocation;
	});

	it('muestra el panel "abren pronto" y no renderiza el formulario', async () => {
		mockRetreatFetch({ id: 'retreat-123', isPublic: true, registrationOpen: false, startDate: FUTURE });
		const wrapper = mountView();
		await flushPromises();

		expect(wrapper.text()).toContain('walkerRegistration.registrationNotOpen.title');
		expect(wrapper.text()).toContain('walkerRegistration.registrationNotOpen.description');
		expect(wrapper.find('.step1').exists()).toBe(false);
	});

	it('NO redirige al registro externo de la parroquia mientras no esté publicado', async () => {
		mockRetreatFetch({
			id: 'retreat-123',
			isPublic: true,
			registrationOpen: false,
			startDate: FUTURE,
			externalRegistrationUrl: 'https://parroquia.example/registro',
		});
		mountView();
		await flushPromises();

		expect(replaceMock).not.toHaveBeenCalled();
	});

	it('un payload legado sin registrationOpen sigue redirigiendo (back-compat)', async () => {
		mockRetreatFetch({
			id: 'retreat-123',
			isPublic: true,
			// registrationOpen ausente a propósito: fila pre-migración.
			startDate: FUTURE,
			externalRegistrationUrl: 'https://parroquia.example/registro',
		});
		mountView();
		await flushPromises();

		expect(replaceMock).toHaveBeenCalledWith('https://parroquia.example/registro');
	});

	it('un retiro publicado renderiza el formulario normalmente', async () => {
		mockRetreatFetch({ id: 'retreat-123', isPublic: true, registrationOpen: true, startDate: FUTURE });
		const wrapper = mountView();
		await flushPromises();

		expect(wrapper.text()).not.toContain('walkerRegistration.registrationNotOpen.title');
		expect(wrapper.find('.step1').exists()).toBe(true);
	});
});
