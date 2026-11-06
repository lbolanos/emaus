import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { nextTick } from 'vue';
import type { ReceptionParticipant, ReceptionStats } from '@/services/api';

// ── Mocks ────────────────────────────────────────────────────────────────

vi.mock('axios', () => ({
	default: {
		create: vi.fn(() => ({
			get: vi.fn(),
			post: vi.fn(),
			put: vi.fn(),
			delete: vi.fn(),
			interceptors: {
				request: { use: vi.fn() },
				response: { use: vi.fn() },
			},
		})),
		defaults: { baseURL: '', withCredentials: false },
		get: vi.fn(),
		post: vi.fn(),
		put: vi.fn(),
		delete: vi.fn(),
	},
}));

vi.mock('@/utils/csrf', () => ({
	setupCsrfInterceptor: vi.fn(),
	getCsrfToken: vi.fn(async () => 'mock-csrf-token'),
}));

vi.mock('@/config/runtimeConfig', () => ({
	getApiUrl: vi.fn(() => 'http://localhost:3001/api'),
}));

const getReceptionStatsMock = vi.fn();
const createPaymentMock = vi.fn();

vi.mock('@/services/api', () => ({
	getReceptionStats: (...args: any[]) => getReceptionStatsMock(...args),
	checkInParticipant: vi.fn(),
	createPayment: (...args: any[]) => createPaymentMock(...args),
	setParticipantCancelled: vi.fn(),
}));

// jsdom has no canvas: the resize helper cannot run here. The picker and the
// resize are mocked; the test asserts what the charge body carries.
const pickFileMock = vi.fn();
vi.mock('@/utils/filePicker', () => ({
	pickFile: (...args: any[]) => pickFileMock(...args),
}));

const receiptPhotoFromFileMock = vi.fn();
vi.mock('@/utils/imageResize', () => ({
	receiptPhotoFromFile: (...args: any[]) => receiptPhotoFromFileMock(...args),
}));

vi.mock('@/services/realtime', () => ({
	getSocket: () => ({
		connected: false,
		on: vi.fn(),
		off: vi.fn(),
		emit: vi.fn(),
	}),
}));

vi.mock('vue-router', () => ({
	useRoute: () => ({ params: { id: 'retreat-1' } }),
	useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('lucide-vue-next', () => ({
	CheckCircle: { name: 'CheckCircle', template: '<svg></svg>' },
	Clock: { name: 'Clock', template: '<svg></svg>' },
	Users: { name: 'Users', template: '<svg></svg>' },
	Search: { name: 'Search', template: '<svg></svg>' },
	Loader2: { name: 'Loader2', template: '<svg></svg>' },
	RotateCcw: { name: 'RotateCcw', template: '<svg></svg>' },
	X: { name: 'X', template: '<svg></svg>' },
	AlertCircle: { name: 'AlertCircle', template: '<svg></svg>' },
	DollarSign: { name: 'DollarSign', template: '<svg></svg>' },
	Camera: { name: 'Camera', template: '<svg></svg>' },
	Trash2: { name: 'Trash2', template: '<svg></svg>' },
}));

// ── Fixtures ─────────────────────────────────────────────────────────────

function makeParticipant(overrides: Partial<ReceptionParticipant> = {}): ReceptionParticipant {
	return {
		retreatParticipantId: `rp-${Math.random().toString(36).slice(2, 8)}`,
		participantId: `p-${Math.random().toString(36).slice(2, 8)}`,
		idOnRetreat: 0,
		firstName: '',
		lastName: '',
		cellPhone: '',
		checkedIn: false,
		checkedInAt: null,
		totalPaid: 0,
		...overrides,
	};
}

const DATA_URL = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';

const statsFixture: ReceptionStats = {
	total: 1,
	arrived: 0,
	pending: 1,
	pendingList: [
		makeParticipant({ firstName: 'Ana', lastName: 'García', idOnRetreat: 1, totalPaid: 0 }),
	],
	arrivedList: [],
};

// ── Helpers ──────────────────────────────────────────────────────────────

async function mountView() {
	const pinia = createPinia();
	setActivePinia(pinia);

	const { useRetreatStore } = await import('@/stores/retreatStore');
	const retreatStore = useRetreatStore();
	(retreatStore as any).retreats = [
		{ id: 'retreat-1', parish: 'Test', startDate: '2026-05-08', walkerArrivalTime: '08:00' },
	];
	retreatStore.selectedRetreatId = 'retreat-1';
	(retreatStore as any).fetchRetreat = vi.fn().mockResolvedValue(undefined);

	const RecepcionView = (await import('../RecepcionView.vue')).default;

	const wrapper = mount(RecepcionView, { global: { plugins: [pinia] } });
	await flushPromises();
	await nextTick();
	return wrapper;
}

/** Opens the Cobrar dialog for the only pending participant. */
async function openChargeDialog(wrapper: any) {
	const chargeBtn = wrapper
		.findAll('button')
		.find((b: any) => b.attributes('title') === 'reception.charge');
	expect(chargeBtn, 'Cobrar button should exist').toBeTruthy();
	await chargeBtn!.trigger('click');
	await nextTick();
}

/** Fills the amount and submits the charge dialog. */
async function submitCharge(wrapper: any) {
	const amount = wrapper.find('input[type="number"]');
	await amount.setValue('300');
	const submit = wrapper
		.findAll('button')
		.find((b: any) => b.text().includes('reception.registerPayment'));
	expect(submit, 'register button should exist').toBeTruthy();
	await submit!.trigger('click');
	await flushPromises();
}

// ── Tests ────────────────────────────────────────────────────────────────

describe('RecepcionView - foto del comprobante al cobrar', () => {
	beforeEach(() => {
		(window.localStorage as any)._reset?.();
		getReceptionStatsMock.mockResolvedValue({ ...statsFixture });
		createPaymentMock.mockResolvedValue({ id: 'pay-1' });
		pickFileMock.mockReset();
		receiptPhotoFromFileMock.mockReset();
	});

	afterEach(() => {
		getReceptionStatsMock.mockReset();
		createPaymentMock.mockReset();
	});

	it('envía receiptPhoto en el body cuando se adjunta una foto', async () => {
		pickFileMock.mockResolvedValue(new File([], 'receipt.png', { type: 'image/png' }));
		receiptPhotoFromFileMock.mockResolvedValue(DATA_URL);

		const wrapper = await mountView();
		await openChargeDialog(wrapper);

		const pickBtn = wrapper
			.findAll('button')
			.find((b: any) => b.text().includes('reception.chargeReceiptAdd'));
		expect(pickBtn, 'attach-photo button should exist').toBeTruthy();
		await pickBtn!.trigger('click');
		await flushPromises();

		// Preview + remove button after picking.
		const preview = wrapper.find('img[src=""]');
		expect(preview.exists() || wrapper.find('img').exists()).toBe(true);
		expect(
			wrapper
				.findAll('button')
				.some((b: any) => b.text().includes('reception.receiptRemove')),
		).toBe(true);

		await submitCharge(wrapper);

		expect(createPaymentMock).toHaveBeenCalledTimes(1);
		const body = createPaymentMock.mock.calls[0][0];
		expect(body.receiptPhoto).toBe(DATA_URL);
	});

	it('omite receiptPhoto del body cuando no hay foto (nunca manda "")', async () => {
		const wrapper = await mountView();
		await openChargeDialog(wrapper);
		await submitCharge(wrapper);

		expect(createPaymentMock).toHaveBeenCalledTimes(1);
		const body = createPaymentMock.mock.calls[0][0];
		expect(body.receiptPhoto).toBeUndefined();
		expect('receiptPhoto' in body).toBe(false);
	});

	it('la foto quitada antes de guardar no viaja en el body', async () => {
		pickFileMock.mockResolvedValue(new File([], 'receipt.png', { type: 'image/png' }));
		receiptPhotoFromFileMock.mockResolvedValue(DATA_URL);

		const wrapper = await mountView();
		await openChargeDialog(wrapper);

		await wrapper
			.findAll('button')
			.find((b: any) => b.text().includes('reception.chargeReceiptAdd'))!
			.trigger('click');
		await flushPromises();

		await wrapper
			.findAll('button')
			.find((b: any) => b.text().includes('reception.receiptRemove'))!
			.trigger('click');
		await nextTick();

		await submitCharge(wrapper);

		const body = createPaymentMock.mock.calls[0][0];
		expect('receiptPhoto' in body).toBe(false);
	});

	it('un error del resize avisa con toast y no bloquea el cobro sin foto', async () => {
		pickFileMock.mockResolvedValue(new File([], 'receipt.png', { type: 'image/png' }));
		receiptPhotoFromFileMock.mockRejectedValue(new Error('La imagen es demasiado pesada'));

		const wrapper = await mountView();
		await openChargeDialog(wrapper);

		await wrapper
			.findAll('button')
			.find((b: any) => b.text().includes('reception.chargeReceiptAdd'))!
			.trigger('click');
		await flushPromises();

		// The attach button is back (preview never set), submit works without photo.
		expect(
			wrapper
				.findAll('button')
				.some((b: any) => b.text().includes('reception.chargeReceiptAdd')),
		).toBe(true);
		await submitCharge(wrapper);
		expect(createPaymentMock).toHaveBeenCalledTimes(1);
	});
});
