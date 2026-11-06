/**
 * Tests for PaymentManagement.vue – receipt photo (specs/payment-receipt-photo/spec.md).
 *
 * Covers:
 *  - create: picking a photo sends receiptPhoto; without one the field is omitted
 *  - edit: replace sends the new data-URL; "Quitar" sends '' (server clears)
 *  - list: payments with receiptUrl show a thumbnail; clicking opens the viewer
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils';
import { nextTick } from 'vue';

// ----- Mocks de iconos -----
vi.mock('lucide-vue-next', () => ({
	Plus: { name: 'Plus', template: '<svg></svg>' },
	Search: { name: 'Search', template: '<svg></svg>' },
	X: { name: 'X', template: '<svg></svg>' },
	DollarSign: { name: 'DollarSign', template: '<svg></svg>' },
	Receipt: { name: 'Receipt', template: '<svg></svg>' },
	Wallet: { name: 'Wallet', template: '<svg></svg>' },
	UserCheck: { name: 'UserCheck', template: '<svg></svg>' },
	Pencil: { name: 'Pencil', template: '<svg></svg>' },
	Trash2: { name: 'Trash2', template: '<svg></svg>' },
	Printer: { name: 'Printer', template: '<svg></svg>' },
	ChevronsUpDown: { name: 'ChevronsUpDown', template: '<svg></svg>' },
	Check: { name: 'Check', template: '<svg></svg>' },
	Camera: { name: 'Camera', template: '<svg></svg>' },
	Loader2: { name: 'Loader2', template: '<svg></svg>' },
}));

// ----- Mock @repo/ui (Dialog renderiza siempre el slot → el form está montado) -----
vi.mock('@repo/ui', () => ({
	Button: { name: 'Button', template: '<button :disabled="disabled"><slot /></button>', props: ['variant', 'size', 'disabled', 'type'] },
	Input: {
		name: 'Input',
		template: '<input :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
		props: ['modelValue', 'type', 'placeholder', 'step', 'min'],
		emits: ['update:modelValue'],
	},
	Textarea: { name: 'Textarea', template: '<textarea></textarea>', props: ['modelValue', 'rows'] },
	Select: { name: 'Select', template: '<div><slot /></div>', props: ['modelValue'] },
	SelectTrigger: { name: 'SelectTrigger', template: '<div><slot /></div>' },
	SelectValue: { name: 'SelectValue', template: '<span></span>', props: ['placeholder'] },
	SelectContent: { name: 'SelectContent', template: '<div><slot /></div>' },
	SelectItem: { name: 'SelectItem', template: '<div><slot /></div>', props: ['value'] },
	Dialog: { name: 'Dialog', template: '<div><slot /></div>', props: ['open'] },
	DialogContent: { name: 'DialogContent', template: '<div><slot /></div>', props: ['class'] },
	DialogHeader: { name: 'DialogHeader', template: '<div><slot /></div>' },
	DialogTitle: { name: 'DialogTitle', template: '<h2><slot /></h2>' },
	DialogDescription: { name: 'DialogDescription', template: '<p><slot /></p>' },
	useToast: () => ({ toast: vi.fn() }),
}));

vi.mock('@repo/utils', async (importOriginal) => ({
	...(await importOriginal<typeof import('@repo/utils')>()),
	formatDate: (d: unknown) => String(d),
	formatCurrency: (n: unknown) => `$${Number(n) || 0}`,
}));

// jsdom has no canvas: picker and resize are mocked.
const pickFileMock = vi.fn();
vi.mock('@/utils/filePicker', () => ({
	pickFile: (...args: any[]) => pickFileMock(...args),
}));
const receiptPhotoFromFileMock = vi.fn();
vi.mock('@/utils/imageResize', () => ({
	receiptPhotoFromFile: (...args: any[]) => receiptPhotoFromFileMock(...args),
}));

// ----- Stores -----
const participants = [
	{ id: '1', firstName: 'Ana', lastName: 'Debe', nickname: '', paymentStatus: 'unpaid', paysAtHouse: false, isScholarship: false },
];

const paymentFixture = {
	id: 'pay-1',
	participantId: '1',
	amount: 300,
	paymentDate: '2026-06-01',
	paymentMethod: 'transfer',
	referenceNumber: 'REF-9',
	notes: '',
	receiptUrl: 'https://s3.example/payment-receipts/pay-1.webp?X-Amz-Signature=1',
	retreatId: 'r1',
	participant: participants[0],
	recordedByUser: null,
};

const participantStoreMock = {
	participants,
	filters: { retreatId: '', type: '' as string | undefined },
	fetchParticipants: vi.fn().mockResolvedValue(undefined),
	updateParticipant: vi.fn().mockResolvedValue(undefined),
};

const paymentStoreMock = {
	payments: [] as any[],
	loading: false,
	fetchPayments: vi.fn().mockResolvedValue(undefined),
	addPayment: vi.fn().mockResolvedValue(undefined),
	updatePaymentById: vi.fn().mockResolvedValue(undefined),
	removePayment: vi.fn().mockResolvedValue(undefined),
	getPaymentSummary: vi.fn().mockResolvedValue({
		totalPaid: 0,
		totalPayments: 0,
		participantsWithPayments: 0,
		totalParticipants: 1,
	}),
};

const retreatStoreMock = {
	retreats: [{ id: 'r1', parish: 'San Agustín', startDate: '2026-06-05' }],
	selectedRetreatId: 'r1',
	fetchRetreats: vi.fn().mockResolvedValue(undefined),
};

vi.mock('@/stores/participantStore', () => ({ useParticipantStore: () => participantStoreMock }));
vi.mock('@/stores/paymentStore', () => ({ usePaymentStore: () => paymentStoreMock }));
vi.mock('@/stores/retreatStore', () => ({ useRetreatStore: () => retreatStoreMock }));
vi.mock('@/stores/authStore', () => ({ useAuthStore: () => ({ user: null }) }));

import PaymentManagement from '../PaymentManagement.vue';

const DATA_URL = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';

async function mountComponent(payments: any[] = []): Promise<VueWrapper> {
	paymentStoreMock.payments = payments;
	const wrapper = mount(PaymentManagement, {
		global: { mocks: { $t: (k: string) => k } },
	});
	await flushPromises();
	return wrapper;
}

/** Opens the create-payment modal. */
async function openCreateModal(wrapper: VueWrapper) {
	const addBtn = wrapper
		.findAll('button')
		.find((b: any) => b.text().includes('paymentManagement.addPayment'));
	expect(addBtn, 'Add payment button should exist').toBeTruthy();
	await addBtn!.trigger('click');
	await nextTick();
}

/** Opens the edit modal of the first payment in the list (mobile card button). */
async function openEditModal(wrapper: VueWrapper) {
	const editBtn = wrapper
		.findAll('button')
		.find((b: any) => b.text().includes('paymentManagement.edit'));
	expect(editBtn, 'Edit button should exist').toBeTruthy();
	await editBtn!.trigger('click');
	await nextTick();
}

/** Clicks the receipt pick button and flushes the mocked resize. */
async function pickReceipt(wrapper: VueWrapper, label: string) {
	const pickBtn = wrapper
		.findAll('button')
		.find((b: any) => b.text().includes(label));
	expect(pickBtn, `pick button (${label}) should exist`).toBeTruthy();
	await pickBtn!.trigger('click');
	await flushPromises();
}

/** Submits whatever payment modal is open (the form handles submit.prevent). */
async function submitModal(wrapper: VueWrapper) {
	const form = wrapper.find('form');
	expect(form.exists(), 'payment form should exist').toBe(true);
	await form.trigger('submit');
	await flushPromises();
}

describe('PaymentManagement - foto del comprobante', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		pickFileMock.mockReset();
		receiptPhotoFromFileMock.mockReset();
		pickFileMock.mockResolvedValue(new File([], 'receipt.png', { type: 'image/png' }));
		receiptPhotoFromFileMock.mockResolvedValue(DATA_URL);
	});

	it('create: la foto elegida viaja como receiptPhoto', async () => {
		const wrapper = await mountComponent();
		await openCreateModal(wrapper);
		await pickReceipt(wrapper, 'paymentManagement.modal.receiptAttach');
		await submitModal(wrapper);

		expect(paymentStoreMock.addPayment).toHaveBeenCalledTimes(1);
		expect(paymentStoreMock.addPayment.mock.calls[0][0].receiptPhoto).toBe(DATA_URL);
	});

	it('create: sin foto el body no lleva receiptPhoto', async () => {
		const wrapper = await mountComponent();
		await openCreateModal(wrapper);
		await submitModal(wrapper);

		expect(paymentStoreMock.addPayment).toHaveBeenCalledTimes(1);
		// The key may exist with undefined in memory; the JSON payload (what
		// axios sends and the outbox replays) must not carry it.
		const wire = JSON.parse(JSON.stringify(paymentStoreMock.addPayment.mock.calls[0][0]));
		expect('receiptPhoto' in wire).toBe(false);
	});

	it('edit: Reemplazar manda la foto nueva', async () => {
		const wrapper = await mountComponent([paymentFixture]);
		await openEditModal(wrapper);
		await pickReceipt(wrapper, 'paymentManagement.modal.receiptReplace');
		await submitModal(wrapper);

		expect(paymentStoreMock.updatePaymentById).toHaveBeenCalledTimes(1);
		expect(paymentStoreMock.updatePaymentById.mock.calls[0][1].receiptPhoto).toBe(DATA_URL);
	});

	it('edit: Quitar manda "" para que el server limpie el comprobante', async () => {
		const wrapper = await mountComponent([paymentFixture]);
		await openEditModal(wrapper);

		const removeBtn = wrapper
			.findAll('button')
			.find((b: any) => b.text().includes('paymentManagement.modal.receiptRemove'));
		expect(removeBtn, 'remove button should exist').toBeTruthy();
		await removeBtn!.trigger('click');
		await nextTick();

		// The pending-removal hint shows and can be undone.
		expect(wrapper.text()).toContain('paymentManagement.modal.receiptWillRemove');

		await submitModal(wrapper);
		expect(paymentStoreMock.updatePaymentById).toHaveBeenCalledTimes(1);
		expect(paymentStoreMock.updatePaymentById.mock.calls[0][1].receiptPhoto).toBe('');
	});

	it('lista: los pagos con comprobante muestran miniatura y el click abre el visor', async () => {
		const wrapper = await mountComponent([paymentFixture]);

		const thumbs = wrapper.findAll('img').filter((img: any) =>
			(img.attributes('src') || '').includes('payment-receipts/pay-1'),
		);
		expect(thumbs.length, 'list thumbnails should exist').toBeGreaterThanOrEqual(2); // card + table

		await thumbs[0].trigger('click');
		await nextTick();

		const viewerImgs = wrapper
			.findAll('img')
			.filter((img: any) => img.classes().some((c: string) => c.includes('w-full')));
		expect(viewerImgs.length).toBeGreaterThanOrEqual(1);
	});

	it('lista: pagos sin comprobante no muestran miniatura', async () => {
		const wrapper = await mountComponent([{ ...paymentFixture, receiptUrl: null }]);

		const thumbs = wrapper.findAll('img').filter((img: any) =>
			(img.attributes('src') || '').includes('payment-receipts'),
		);
		expect(thumbs.length).toBe(0);
	});
});
