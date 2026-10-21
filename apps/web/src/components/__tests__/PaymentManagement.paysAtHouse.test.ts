/**
 * Tests for PaymentManagement.vue – pays-at-house toggle inside the payment
 * modal (specs/pays-at-house follow-up).
 *
 * Before this fix the modal button only gated on !isScholarship, so a
 * paz-y-salvo participant could be marked: a silent no-op that persists the
 * flag and resurfaces weeks later if a new debt shows up. The toggle now
 * delegates to usePaysAtHouseToggle, which enforces D1 (owes something),
 * D4 (no scholarship), participant:update and a selected retreat.
 *
 * Covers:
 *  - D1: a paid participant gets no button in the modal; an owing one does
 *  - write-target guard: no button without a selected retreat
 *  - clicking marks with confirm, sends contextRetreatId and reloads
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils';
import { nextTick } from 'vue';

// ----- Mocks de iconos (extiende el global con los que faltan) -----
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

// Mock parcial: formatDate/formatCurrency deterministas para los asserts; el
// resto (p. ej. usableName, que ParticipantSelect usa vía isMeaninglessNickname)
// sale del paquete real — un factory cerrado lanza al tocar un export no listado.
vi.mock('@repo/utils', async (importOriginal) => ({
	...(await importOriginal<typeof import('@repo/utils')>()),
	formatDate: (d: unknown) => String(d),
	formatCurrency: (n: unknown) => `$${Number(n) || 0}`,
}));

// ----- Permisos (mutable por test; alimenta a usePaysAtHouseToggle) -----
let grantedPermissions: string[] = ['participant:update'];
vi.mock('@/composables/useAuthPermissions', () => ({
	useAuthPermissions: () => ({
		hasPermission: (p: string) => grantedPermissions.includes(p),
	}),
}));

// ----- Stores -----
const participants = [
	{ id: '1', firstName: 'Ana', lastName: 'Debe', nickname: '', paymentStatus: 'unpaid', paysAtHouse: false, isScholarship: false },
	{ id: '2', firstName: 'Beto', lastName: 'Pagado', nickname: '', paymentStatus: 'paid', paysAtHouse: false, isScholarship: false },
];

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
		totalParticipants: 2,
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

const MARK_BTN_TEXT = 'paymentManagement.modal.markPaysAtHouse';

async function mountComponent(): Promise<VueWrapper> {
	const wrapper = mount(PaymentManagement, {
		global: { mocks: { $t: (k: string) => k } },
	});
	await flushPromises();
	await nextTick();
	return wrapper;
}

/** Selecciona un participante en el buscador del modal (trigger → item). */
async function selectParticipant(wrapper: VueWrapper, text: string) {
	await wrapper.find('button[aria-expanded]').trigger('click');
	await nextTick();
	const item = wrapper.find('.absolute').findAll('button').find((b) => b.text().includes(text));
	expect(item, `dropdown item "${text}" not found`).toBeTruthy();
	await item!.trigger('mousedown');
	await nextTick();
	await flushPromises();
}

const paysAtHouseBtn = (wrapper: VueWrapper) =>
	wrapper.findAll('button').find((b) => b.text().includes(MARK_BTN_TEXT));

describe('PaymentManagement – pays-at-house toggle del modal', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		grantedPermissions = ['participant:update'];
		retreatStoreMock.selectedRetreatId = 'r1';
		participantStoreMock.participants = participants;
	});

	it('D1: a paid participant gets no toggle button in the modal', async () => {
		const wrapper = await mountComponent();
		await selectParticipant(wrapper, 'Beto Pagado');
		expect(paysAtHouseBtn(wrapper)).toBeUndefined();
	});

	it('D1: an owing participant sees the mark button', async () => {
		const wrapper = await mountComponent();
		await selectParticipant(wrapper, 'Ana Debe');
		const btn = paysAtHouseBtn(wrapper);
		expect(btn).toBeTruthy();
	});

	it('write-target guard: no button without a selected retreat', async () => {
		retreatStoreMock.selectedRetreatId = '';
		const wrapper = await mountComponent();
		await selectParticipant(wrapper, 'Ana Debe');
		expect(paysAtHouseBtn(wrapper)).toBeUndefined();
	});

	it('clicking marks with confirm, sends contextRetreatId and reloads the summary', async () => {
		const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
		const wrapper = await mountComponent();
		await selectParticipant(wrapper, 'Ana Debe');
		const summariesBefore = paymentStoreMock.getPaymentSummary.mock.calls.length;

		await paysAtHouseBtn(wrapper)!.trigger('click');
		await flushPromises();

		expect(participantStoreMock.updateParticipant).toHaveBeenCalledWith(
			'1',
			{ paysAtHouse: true, contextRetreatId: 'r1' },
		);
		expect(participantStoreMock.fetchParticipants).toHaveBeenCalled();
		expect(paymentStoreMock.getPaymentSummary.mock.calls.length).toBeGreaterThan(summariesBefore);
		confirmSpy.mockRestore();
	});
});
