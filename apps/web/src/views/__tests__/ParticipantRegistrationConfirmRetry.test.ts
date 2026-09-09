import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import ParticipantRegistrationView from '../ParticipantRegistrationView.vue';
import { confirmExistingRegistration } from '@/services/api';
import { reportClientError } from '@/services/clientErrorReport';
import { getRecaptchaToken } from '@/services/recaptcha';

// El 2026-09-08 una persona confirmó su registro desde un iPhone, la petición
// nunca llegó al servidor (ni una línea en el access log de nginx) y vio
// "An unexpected error occurred": se fue a registrarse desde una computadora.
// Un fallo sin respuesta se reintenta solo, se explica en español y se reporta
// al API, porque si no no queda rastro de que ocurrió.

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
	useParticipantStore: () => ({ createParticipant: vi.fn() }),
}));

vi.mock('@/components/registration/Step1PersonalInfo.vue', () => ({ default: { template: '<div />', props: ['modelValue', 'errors'] } }));
vi.mock('@/components/registration/Step2AddressInfo.vue', () => ({ default: { template: '<div />', props: ['modelValue', 'errors'] } }));
vi.mock('@/components/registration/Step3ServiceInfo.vue', () => ({ default: { template: '<div />', props: ['modelValue', 'errors'] } }));
vi.mock('@/components/registration/Step4EmergencyContact.vue', () => ({ default: { template: '<div />', props: ['modelValue', 'errors', 'type'] } }));
vi.mock('@/components/registration/Step5OtherInfo.vue', () => ({ default: { template: '<div />', props: ['modelValue', 'errors'] } }));
vi.mock('@/components/registration/Step5ServerInfo.vue', () => ({ default: { template: '<div />', props: ['modelValue', 'errors'] } }));
vi.mock('@/components/AngelitoAvailabilityEditor.vue', () => ({ default: { template: '<div />' } }));

/** Un error de axios cuando la petición no obtuvo respuesta. */
const networkError = () =>
	Object.assign(new Error('Network Error'), { isAxiosError: true, code: 'ERR_NETWORK' });

/** Un error de axios con respuesta del servidor. */
const responseError = (status: number, data: unknown) =>
	Object.assign(new Error(`Request failed with status code ${status}`), {
		isAxiosError: true,
		response: { status, data },
	});

const mountAtConfirmScreen = async () => {
	global.fetch = vi.fn().mockResolvedValue({
		ok: true,
		json: () => Promise.resolve({ id: 'retreat-123', isPublic: true, country: 'México', shirtTypes: [] }),
	});
	const pinia = createPinia();
	setActivePinia(pinia);
	const wrapper = mount(ParticipantRegistrationView, {
		props: { retreatId: 'retreat-123', type: 'server' },
		global: { plugins: [pinia], mocks: { $t: (k: string) => k } },
	});
	await flushPromises();
	const vm = wrapper.vm as any;
	// Estado en el que deja la pantalla una búsqueda por correo con éxito.
	vm.emailLookup = 'ana@example.com';
	vm.existingParticipantName = 'Ana López';
	return vm;
};

/** Corre el handler dejando pasar la espera del reintento. */
const runConfirm = async (vm: any) => {
	const pending = vm.handleConfirmIdentity();
	await vi.advanceTimersByTimeAsync(1000);
	await pending;
	await flushPromises();
};

describe('Server registration — confirmar identidad cuando la petición se pierde', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.useFakeTimers();
	});
	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	it('reintenta una vez y da por registrada a la persona si el segundo intento entra', async () => {
		const confirm = vi.mocked(confirmExistingRegistration);
		confirm.mockRejectedValueOnce(networkError()).mockResolvedValueOnce({
			success: true,
			firstName: 'Ana',
			lastName: 'López',
		});
		const vm = await mountAtConfirmScreen();

		await runConfirm(vm);

		expect(confirm).toHaveBeenCalledTimes(2);
		expect(vm.showSuccessScreen).toBe(true);
		expect(toastMock).not.toHaveBeenCalled();
	});

	it('explica en español que se perdió la conexión cuando el reintento también falla', async () => {
		vi.mocked(confirmExistingRegistration).mockRejectedValue(networkError());
		const vm = await mountAtConfirmScreen();

		await runConfirm(vm);

		expect(vi.mocked(confirmExistingRegistration)).toHaveBeenCalledTimes(2);
		expect(vm.showSuccessScreen).toBe(false);
		expect(toastMock).toHaveBeenCalledWith(
			expect.objectContaining({
				description: 'serverRegistration.errors.connectionLost',
				variant: 'destructive',
			}),
		);
		// Y queda reportado al API, con la marca de que ya se reintentó.
		expect(vi.mocked(reportClientError)).toHaveBeenCalledWith(
			expect.objectContaining({
				context: 'confirm-registration',
				message: 'Network Error',
				retried: true,
				status: undefined,
			}),
		);
	});

	it('no reintenta ni traduce cuando el API sí respondió con un motivo', async () => {
		vi.mocked(confirmExistingRegistration).mockRejectedValue(
			responseError(400, { message: 'El retiro ya está cerrado' }),
		);
		const vm = await mountAtConfirmScreen();

		await runConfirm(vm);

		expect(vi.mocked(confirmExistingRegistration)).toHaveBeenCalledTimes(1);
		expect(toastMock).toHaveBeenCalledWith(
			expect.objectContaining({ description: 'El retiro ya está cerrado', variant: 'destructive' }),
		);
		// Un 400 con su motivo ya quedó en el log del servidor: reportarlo otra
		// vez solo ensucia el canal [CLIENT ERROR], que vale por lo que NO se ve.
		expect(vi.mocked(reportClientError)).not.toHaveBeenCalled();
	});

	it('no vuelca la página HTML de un 502 en el mensaje', async () => {
		vi.mocked(confirmExistingRegistration).mockRejectedValue(
			responseError(502, '<html><head><title>502 Bad Gateway</title></head></html>'),
		);
		const vm = await mountAtConfirmScreen();

		await runConfirm(vm);

		const description = toastMock.mock.calls[0][0].description;
		expect(description).toBe('serverRegistration.errors.serverError');
		expect(description).not.toContain('<html>');
	});

	// Si el primer intento sí entró y solo se perdió la respuesta, el segundo
	// choca con el guard de doble registro. Eso no es un fallo que reportarle a
	// la persona como error rojo: ya quedó registrada.
	it('trata el 409 del reintento como "ya estabas registrado"', async () => {
		vi.mocked(confirmExistingRegistration)
			.mockRejectedValueOnce(networkError())
			.mockRejectedValueOnce(
				responseError(409, { message: 'Este correo ya está registrado en este retiro como servidor.' }),
			);
		const vm = await mountAtConfirmScreen();

		await runConfirm(vm);

		expect(toastMock).toHaveBeenCalledWith({
			title: 'serverRegistration.errors.alreadyRegisteredTitle',
			description: 'Este correo ya está registrado en este retiro como servidor.',
			variant: undefined,
		});
	});

	// El token de reCAPTCHA v3 es de un solo uso: si el primer intento llegó al
	// servidor y solo se perdió la respuesta, reusarlo hace morir el reintento
	// con "timeout-or-duplicate" en vez de dar el 409 que se lee como hecho.
	it('pide un token de reCAPTCHA nuevo en cada intento', async () => {
		vi.mocked(confirmExistingRegistration)
			.mockRejectedValueOnce(networkError())
			.mockResolvedValueOnce({ id: 'p1' } as any);
		const vm = await mountAtConfirmScreen();

		await runConfirm(vm);

		expect(vi.mocked(getRecaptchaToken)).toHaveBeenCalledTimes(2);
	});

	// Los seis rechazos de reCAPTCHA llegan en inglés desde Google
	// ("reCAPTCHA verification failed: browser-error") y no le dicen nada a un
	// caminante. Y hay que reportarlos: el API los devuelve sin escribir en su
	// log, así que en el servidor solo queda un 400 pelado.
	it.each([
		['reCAPTCHA token is required'],
		['reCAPTCHA verification failed: browser-error'],
		['reCAPTCHA score too low (0.10 < 0.5)'],
	])('traduce y reporta el rechazo de reCAPTCHA: %s', async (serverMessage) => {
		vi.mocked(confirmExistingRegistration).mockRejectedValue(
			responseError(400, { message: serverMessage }),
		);
		const vm = await mountAtConfirmScreen();

		await runConfirm(vm);

		expect(vi.mocked(confirmExistingRegistration)).toHaveBeenCalledTimes(1);
		expect(toastMock).toHaveBeenCalledWith(
			expect.objectContaining({
				description: 'serverRegistration.errors.recaptcha',
				variant: 'destructive',
			}),
		);
		expect(vi.mocked(reportClientError)).toHaveBeenCalledWith(
			expect.objectContaining({ context: 'confirm-registration', status: 400 }),
		);
	});
});
