import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import ParticipantRegistrationView from '../ParticipantRegistrationView.vue';
import { reportClientError } from '@/services/clientErrorReport';
import { getRecaptchaToken } from '@/services/recaptcha';

// Misma clase de fallo que el del 2026-09-08 (petición perdida sin respuesta),
// pero en el envío del formulario completo, que es donde se crea la ficha.
// Repetir el alta es seguro porque `createParticipant` reusa la ficha por
// correo y rechaza con 409 si ya hay registro en el retiro; de ahí que un 409
// tras nuestro reintento se cierre como éxito.

const toastMock = vi.fn();
const createParticipantMock = vi.fn();

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
vi.mock('@/services/clientErrorReport', () => ({ reportClientError: vi.fn() }));
vi.mock('@/i18n', () => ({ storeLocale: vi.fn(), default: {} }));
vi.mock('@/config/runtimeConfig', () => ({ getApiUrl: () => 'http://localhost:3001' }));
vi.mock('@/services/recaptcha', () => ({
	getRecaptchaToken: vi.fn().mockResolvedValue('mock-token'),
	RECAPTCHA_ACTIONS: { PARTICIPANT_REGISTER: 'register', PARTICIPANT_EMAIL_CHECK: 'check' },
}));
vi.mock('country-state-city/lib/country', () => ({
	default: { getAllCountries: vi.fn().mockReturnValue([{ name: 'Mexico', isoCode: 'MX' }]) },
}));
vi.mock('country-state-city/lib/state', () => ({
	default: { getStatesOfCountry: vi.fn().mockReturnValue([]) },
}));
vi.mock('@/stores/participantStore', () => ({
	useParticipantStore: () => ({ createParticipant: createParticipantMock }),
}));

vi.mock('@/components/registration/Step1PersonalInfo.vue', () => ({ default: { template: '<div />', props: ['modelValue', 'errors'] } }));
vi.mock('@/components/registration/Step2AddressInfo.vue', () => ({ default: { template: '<div />', props: ['modelValue', 'errors'] } }));
vi.mock('@/components/registration/Step3ServiceInfo.vue', () => ({ default: { template: '<div />', props: ['modelValue', 'errors'] } }));
vi.mock('@/components/registration/Step4EmergencyContact.vue', () => ({ default: { template: '<div />', props: ['modelValue', 'errors', 'type'] } }));
vi.mock('@/components/registration/Step5OtherInfo.vue', () => ({ default: { template: '<div />', props: ['modelValue', 'errors'] } }));
vi.mock('@/components/registration/Step5ServerInfo.vue', () => ({ default: { template: '<div />', props: ['modelValue', 'errors'] } }));
vi.mock('@/components/AngelitoAvailabilityEditor.vue', () => ({ default: { template: '<div />' } }));

const RETREAT_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

const networkError = () =>
	Object.assign(new Error('Network Error'), { isAxiosError: true, code: 'ERR_NETWORK' });

const responseError = (status: number, data: unknown) =>
	Object.assign(new Error(`Request failed with status code ${status}`), {
		isAxiosError: true,
		response: { status, data },
	});

/** Un servidor con todos los pasos válidos, listo para enviar. */
const VALID_SERVER = {
	firstName: 'Ana',
	lastName: 'López',
	nickname: 'Ani',
	birthDate: '1990-01-01',
	maritalStatus: 'S',
	email: 'ana@example.com',
	occupation: 'Ingeniera',
	cellPhone: '5512345678',
	acceptedPrivacyNotice: true,
	street: 'Insurgentes',
	houseNumber: '123',
	postalCode: '03100',
	neighborhood: 'Del Valle',
	city: 'CDMX',
	state: 'CDMX',
	country: 'México',
	snores: false,
	hasMedication: false,
	hasDietaryRestrictions: false,
	sacraments: ['baptism'],
};

const mountAtSummary = async () => {
	global.fetch = vi.fn().mockResolvedValue({
		ok: true,
		json: () => Promise.resolve({ id: RETREAT_ID, isPublic: true, country: 'México', shirtTypes: [] }),
	});
	const pinia = createPinia();
	setActivePinia(pinia);
	const wrapper = mount(ParticipantRegistrationView, {
		props: { retreatId: RETREAT_ID, type: 'server' },
		global: { plugins: [pinia], mocks: { $t: (k: string) => k } },
	});
	await flushPromises();
	const vm = wrapper.vm as any;
	vm.isDialogOpen = true;
	Object.assign(vm.formData, VALID_SERVER);
	vm.currentStep = 6;
	await flushPromises();
	return vm;
};

/** Corre el envío dejando pasar la espera del reintento. */
const runSubmit = async (vm: any) => {
	const pending = vm.onSubmit();
	await vi.advanceTimersByTimeAsync(1000);
	await pending;
	await flushPromises();
};

const toastTitles = () => toastMock.mock.calls.map((call) => call[0].title);

describe('Server registration — enviar el formulario cuando la petición se pierde', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		localStorage.clear();
		vi.useFakeTimers();
	});
	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	it('la fixture pasa la validación (si no, el resto de este archivo no prueba nada)', async () => {
		createParticipantMock.mockResolvedValue({ id: 'p1' });
		const vm = await mountAtSummary();

		await runSubmit(vm);

		expect(vm.formErrors).toEqual({});
		expect(createParticipantMock).toHaveBeenCalledTimes(1);
	});

	it('reintenta una vez y cierra como éxito si el segundo intento entra', async () => {
		createParticipantMock.mockRejectedValueOnce(networkError()).mockResolvedValueOnce({ id: 'p1' });
		const vm = await mountAtSummary();

		await runSubmit(vm);

		expect(createParticipantMock).toHaveBeenCalledTimes(2);
		expect(toastTitles()).toEqual(['serverRegistration.toasts.successTitle']);
		expect(vm.isDialogOpen).toBe(false);
	});

	it('explica en español y reporta cuando el reintento también se pierde', async () => {
		createParticipantMock.mockRejectedValue(networkError());
		const vm = await mountAtSummary();

		await runSubmit(vm);

		expect(createParticipantMock).toHaveBeenCalledTimes(2);
		expect(toastMock).toHaveBeenCalledWith({
			title: 'serverRegistration.toasts.submissionFailedTitle',
			description: 'serverRegistration.errors.connectionLost',
			variant: 'destructive',
		});
		expect(vi.mocked(reportClientError)).toHaveBeenCalledWith(
			expect.objectContaining({ context: 'participant-registration', retried: true }),
		);
		// El formulario sigue abierto: la persona puede volver a intentar.
		expect(vm.isDialogOpen).toBe(true);
	});

	// Si el primer intento sí entró y solo se perdió la respuesta, el segundo
	// choca con el guard de doble registro. Se dice el hecho cierto sin
	// anunciarlo como éxito: con un correo compartido la fila puede ser de otra
	// persona, y un falso "quedaste registrado" la manda a un retiro sin lugar.
	it('el 409 del reintento se cuenta como "ya estabas registrado", no como éxito', async () => {
		createParticipantMock
			.mockRejectedValueOnce(networkError())
			.mockRejectedValueOnce(responseError(409, { message: 'Ya está registrado en este retiro' }));
		const vm = await mountAtSummary();

		await runSubmit(vm);

		expect(toastMock).toHaveBeenCalledWith({
			title: 'serverRegistration.errors.alreadyRegisteredTitle',
			description: 'Ya está registrado en este retiro',
			variant: undefined,
		});
		expect(toastTitles()).not.toContain('serverRegistration.toasts.successTitle');
		// El formulario queda abierto: no se pierde lo que escribió.
		expect(vm.isDialogOpen).toBe(true);
	});

	// Sin reintento de por medio, un 409 es lo que siempre fue: ya estaba
	// registrado antes de empezar, y hay que decírselo.
	it('un 409 en el primer intento sigue siendo un rechazo con el motivo del API', async () => {
		createParticipantMock.mockRejectedValue(
			responseError(409, { message: 'Ya está registrado en este retiro' }),
		);
		const vm = await mountAtSummary();

		await runSubmit(vm);

		expect(createParticipantMock).toHaveBeenCalledTimes(1);
		expect(toastMock).toHaveBeenCalledWith({
			title: 'serverRegistration.toasts.registrationFailedTitle',
			description: 'Ya está registrado en este retiro',
			variant: 'destructive',
		});
		expect(vi.mocked(reportClientError)).not.toHaveBeenCalled();
		expect(vm.isDialogOpen).toBe(true);
	});

	// El token de reCAPTCHA v3 es de un solo uso: si el primer intento llegó al
	// servidor y solo se perdió la respuesta, reusarlo hace morir el reintento
	// con "timeout-or-duplicate" en vez de dar el 409 que se lee como hecho.
	it('pide un token de reCAPTCHA nuevo en cada intento', async () => {
		createParticipantMock
			.mockRejectedValueOnce(networkError())
			.mockResolvedValueOnce({ id: 'p1' } as any);
		const vm = await mountAtSummary();

		await runSubmit(vm);

		expect(vi.mocked(getRecaptchaToken)).toHaveBeenCalledTimes(2);
	});

	// El 409 por correo de otra persona lleva su propio `code` y significa lo
	// contrario que el del guard de doble registro: el alta NO entró y no hay
	// fila suya en ningún lado. Contarlo entre los "ya estabas registrado" le
	// diría, tras un reintento nuestro y en tono tranquilo, que quedó inscrito.
	const ownedByOther = () =>
		responseError(409, {
			message: 'Ese correo ya pertenece al registro de otra persona.',
			code: 'EMAIL_BELONGS_TO_ANOTHER_PARTICIPANT',
		});

	it('el 409 por correo ajeno no se cuenta como "ya estabas registrado"', async () => {
		createParticipantMock
			.mockRejectedValueOnce(networkError())
			.mockRejectedValueOnce(ownedByOther());
		const vm = await mountAtSummary();

		await runSubmit(vm);

		expect(toastTitles()).not.toContain('serverRegistration.errors.alreadyRegisteredTitle');
		expect(toastTitles()).not.toContain('serverRegistration.toasts.successTitle');
		expect(vm.isDialogOpen).toBe(true);
	});

	it('el 409 por correo ajeno se dice como fallo, con el motivo del servidor', async () => {
		createParticipantMock.mockRejectedValue(ownedByOther());
		const vm = await mountAtSummary();

		await runSubmit(vm);

		expect(toastMock).toHaveBeenCalledWith({
			title: 'serverRegistration.toasts.submissionFailedTitle',
			description: 'Ese correo ya pertenece al registro de otra persona.',
			variant: 'destructive',
		});
	});
});
