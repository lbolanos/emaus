import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';

// ----- Mocks de UI / utils -----
vi.mock('@repo/ui', () => ({
	Table: { name: 'Table', template: '<table><slot /></table>' },
	TableHeader: { name: 'TableHeader', template: '<thead><slot /></thead>' },
	TableBody: { name: 'TableBody', template: '<tbody><slot /></tbody>' },
	TableRow: { name: 'TableRow', template: '<tr><slot /></tr>' },
	TableHead: { name: 'TableHead', template: '<th><slot /></th>' },
	TableCell: { name: 'TableCell', template: '<td><slot /></td>', props: ['colspan'] },
	Input: {
		name: 'Input',
		template:
			'<input :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
		props: ['modelValue', 'placeholder'],
		emits: ['update:modelValue'],
	},
	Select: { name: 'Select', template: '<div><slot /></div>', props: ['modelValue'] },
	SelectTrigger: { name: 'SelectTrigger', template: '<div><slot /></div>' },
	SelectValue: { name: 'SelectValue', template: '<span></span>', props: ['placeholder'] },
	SelectContent: { name: 'SelectContent', template: '<div><slot /></div>' },
	SelectItem: { name: 'SelectItem', template: '<div><slot /></div>', props: ['value'] },
	Button: {
		name: 'Button',
		template: '<button :title="title" :disabled="disabled" @click="$emit(\'click\')"><slot /></button>',
		props: ['variant', 'size', 'disabled', 'title'],
		emits: ['click'],
	},
	DropdownMenu: { name: 'DropdownMenu', template: '<div><slot /></div>' },
	DropdownMenuTrigger: { name: 'DropdownMenuTrigger', template: '<div><slot /></div>', props: ['asChild'] },
	DropdownMenuContent: { name: 'DropdownMenuContent', template: '<div><slot /></div>', props: ['align'] },
	DropdownMenuCheckboxItem: {
		name: 'DropdownMenuCheckboxItem',
		template: '<div><slot /></div>',
		props: ['modelValue'],
	},
}));

vi.mock('@repo/utils', () => ({
	formatCurrency: (n: unknown) => `$${Number(n) || 0}`,
	formatDate: (d: unknown) => String(d),
}));

vi.mock('@/components/ParticipantDebtManager.vue', () => ({
	default: { name: 'ParticipantDebtManager', template: '<div class="debt-manager-stub" />' },
}));

const getPaymentsByParticipant = vi.fn().mockResolvedValue([]);
vi.mock('@/services/api', () => ({
	getPaymentsByParticipant: (...a: any[]) => getPaymentsByParticipant(...a),
}));

// ----- Permisos (mutable por test) -----
let grantedPermissions: string[] = ['participant:update', 'payment:create'];
vi.mock('@/composables/useAuthPermissions', () => ({
	useAuthPermissions: () => ({
		hasPermission: (p: string) => grantedPermissions.includes(p),
	}),
}));

// ----- Stores -----
const makeParticipant = (over: any = {}) => ({
	id: over.id ?? 'p1',
	firstName: 'Juan',
	lastName: 'Perez',
	nickname: '',
	type: 'walker',
	isCancelled: false,
	isScholarship: false,
	cellPhone: '5551234567',
	totalPaid: 0,
	chargeBreakdown: { retreatFee: 1000, meals: 0, debts: 0, expected: 1000, totalPaid: 0, balance: 1000 },
	...over,
});

const participantStoreMock = {
	participants: [] as any[],
	filters: { retreatId: '' } as Record<string, any>,
	fetchParticipants: vi.fn().mockResolvedValue(undefined),
	updateParticipant: vi.fn().mockResolvedValue(undefined),
};
vi.mock('@/stores/participantStore', () => ({
	useParticipantStore: () => participantStoreMock,
}));

const retreatStoreMock = {
	retreats: [{ id: 'r1', parish: 'San Agustín', startDate: '2026-06-05' }],
	selectedRetreatId: 'r1',
};
vi.mock('@/stores/retreatStore', () => ({ useRetreatStore: () => retreatStoreMock }));

import ParticipantBalances from '../ParticipantBalances.vue';

const mountBalances = async () => {
	const wrapper = mount(ParticipantBalances, {
		global: { mocks: { $t: (k: string, _p?: any) => k } },
	});
	await flushPromises();
	return wrapper;
};

describe('ParticipantBalances', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		localStorage.clear();
		grantedPermissions = ['participant:update', 'payment:create'];
		participantStoreMock.participants = [
			makeParticipant({ id: 'p1', firstName: 'Ana', lastName: 'Debe' }),
			makeParticipant({
				id: 'p2',
				firstName: 'Beto',
				lastName: 'Pagado',
				totalPaid: 1000,
				chargeBreakdown: { retreatFee: 1000, meals: 0, debts: 0, expected: 1000, totalPaid: 1000, balance: 0 },
			}),
			makeParticipant({ id: 'p3', firstName: 'Cancelado', isCancelled: true }),
		];
	});

	it('lista participantes no cancelados con su balance', async () => {
		const wrapper = await mountBalances();
		const text = wrapper.text();
		expect(text).toContain('Ana Debe');
		expect(text).toContain('Beto Pagado');
		expect(text).not.toContain('Cancelado');
	});

	it('muestra paz y salvo para balance 0 y pendiente para balance > 0', async () => {
		const wrapper = await mountBalances();
		expect(wrapper.text()).toContain('paymentManagement.balances.statusPaz');
		expect(wrapper.text()).toContain('paymentManagement.balances.statusPending');
	});

	it('emite register-payment con el participantId al pulsar la acción', async () => {
		const wrapper = await mountBalances();
		const btn = wrapper
			.findAll('button[title="paymentManagement.balances.registerPayment"]')
			.at(0);
		expect(btn).toBeTruthy();
		await btn!.trigger('click');
		expect(wrapper.emitted('register-payment')).toBeTruthy();
		expect(wrapper.emitted('register-payment')![0][0]).toBe('p1');
	});

	it('la acción "Agregar cobro" solo aparece para servidores/angelitos', async () => {
		participantStoreMock.participants = [
			makeParticipant({ id: 'w1', type: 'walker' }),
			makeParticipant({ id: 's1', type: 'server', firstName: 'Servio' }),
		];
		const wrapper = await mountBalances();
		const chargeBtns = wrapper.findAll('button[title="paymentManagement.balances.addCharge"]');
		expect(chargeBtns.length).toBe(1);
	});

	it('oculta becado y acciones de pago sin permisos', async () => {
		grantedPermissions = [];
		const wrapper = await mountBalances();
		expect(
			wrapper.findAll('button[title="paymentManagement.balances.markScholarship"]').length,
		).toBe(0);
		expect(
			wrapper.findAll('button[title="paymentManagement.balances.registerPayment"]').length,
		).toBe(0);
	});

	it('el recordatorio WhatsApp solo aparece para pendientes con teléfono', async () => {
		participantStoreMock.participants = [
			makeParticipant({ id: 'p1' }), // pendiente con teléfono → sí
			makeParticipant({
				id: 'p2',
				totalPaid: 1000,
				chargeBreakdown: { retreatFee: 1000, meals: 0, debts: 0, expected: 1000, totalPaid: 1000, balance: 0 },
			}), // paz y salvo → no
			makeParticipant({ id: 'p3', cellPhone: '' }), // sin teléfono → no
		];
		const wrapper = await mountBalances();
		expect(
			wrapper.findAll('button[title="paymentManagement.balances.whatsappReminder"]').length,
		).toBe(1);
	});

	it('abre WhatsApp con el monto pendiente en el mensaje', async () => {
		const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
		const wrapper = await mountBalances();
		const btn = wrapper
			.findAll('button[title="paymentManagement.balances.whatsappReminder"]')
			.at(0);
		await btn!.trigger('click');
		expect(openSpy).toHaveBeenCalledTimes(1);
		const url = String(openSpy.mock.calls[0][0]);
		expect(url).toContain('api.whatsapp.com/send?phone=5551234567');
		openSpy.mockRestore();
	});

	it('marcar becado confirma y llama a updateParticipant con contextRetreatId', async () => {
		const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
		const wrapper = await mountBalances();
		const btn = wrapper
			.findAll('button[title="paymentManagement.balances.markScholarship"]')
			.at(0);
		await btn!.trigger('click');
		await flushPromises();
		expect(participantStoreMock.updateParticipant).toHaveBeenCalledWith(
			'p1',
			expect.objectContaining({ isScholarship: true, contextRetreatId: 'r1' }),
		);
		confirmSpy.mockRestore();
	});

	it('expandir una fila carga los pagos del participante', async () => {
		const wrapper = await mountBalances();
		const expandBtn = wrapper
			.findAll('button[aria-label="paymentManagement.balances.details"]')
			.at(0);
		expect(expandBtn).toBeTruthy();
		await expandBtn!.trigger('click');
		await flushPromises();
		expect(getPaymentsByParticipant).toHaveBeenCalledWith('p1');
		expect(wrapper.find('.debt-manager-stub').exists()).toBe(true);
	});

	it('persiste el orden elegido en localStorage', async () => {
		const wrapper = await mountBalances();
		// Cambia el orden por nombre (primer th ordenable)
		const nameHeader = wrapper.findAll('th').at(1);
		await nameHeader!.trigger('click');
		const saved = JSON.parse(localStorage.getItem('balances.sort')!);
		expect(saved.key).toBe('name');
		expect(saved.dir).toBe('desc'); // default es name/asc → un clic lo invierte
	});
});
