/**
 * Tests for PaymentManagement.vue – participant search (autocomplete) feature.
 *
 * El campo "Participante" del modal Agregar/Editar Pago es un buscador inline
 * (dentro del Dialog) que filtra por nombre, apellido o apodo. Estos tests
 * cubren:
 *  - El trigger muestra un placeholder cuando no hay selección.
 *  - Al abrir el dropdown se listan todos los participantes.
 *  - Filtrado por nombre, apellido y apodo.
 *  - Estado vacío ("No se encontraron participantes").
 *  - Selección: asigna el participante, cierra el dropdown y muestra su label.
 *
 * Nota: el buscador usa elementos HTML nativos (button/input/div), por lo que
 * no depende de los mocks de Popover/Command — se eliminó ese patrón a propósito
 * porque rompía dentro de un Dialog de reka-ui (ver
 * feedback_searchable_combobox_inside_dialog en la memoria del proyecto).
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
	Button: { name: 'Button', template: '<button><slot /></button>', props: ['variant', 'size', 'disabled', 'type'] },
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

vi.mock('@repo/utils', () => ({
	formatDate: (d: unknown) => String(d),
	formatCurrency: (n: unknown) => `$${Number(n) || 0}`,
}));

// ----- Mocks de stores -----
const participants = [
	{ id: '1', firstName: 'Juan', lastName: 'Perez', nickname: 'Juanito' },
	{ id: '2', firstName: 'Maria', lastName: 'Garcia', nickname: 'Mary' },
	{ id: '3', firstName: 'Pedro', lastName: 'Ramirez', nickname: '' },
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
		totalParticipants: 3,
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

const SEARCH_SELECTOR = 'input[placeholder="Nombre, apellido o apodo..."]';

async function mountComponent(): Promise<VueWrapper> {
	const wrapper = mount(PaymentManagement, {
		global: { mocks: { $t: (k: string) => k } },
	});
	await flushPromises();
	await nextTick();
	return wrapper;
}

/** Abre el dropdown del buscador (click en el trigger). */
async function openDropdown(wrapper: VueWrapper) {
	await wrapper.find('button[aria-expanded]').trigger('click');
	await nextTick();
}

/** Devuelve los botones-item del dropdown abierto. */
function dropdownItems(wrapper: VueWrapper) {
	return wrapper.find('.absolute').findAll('button');
}

describe('PaymentManagement – buscador de participante', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		participantStoreMock.participants = participants;
	});

	it('el trigger muestra el placeholder cuando no hay participante seleccionado', async () => {
		const wrapper = await mountComponent();
		const trigger = wrapper.find('button[aria-expanded]');
		expect(trigger.text()).toContain('Buscar participante...');
	});

	it('al abrir el dropdown lista a todos los participantes', async () => {
		const wrapper = await mountComponent();
		await openDropdown(wrapper);
		const items = dropdownItems(wrapper);
		expect(items).toHaveLength(3);
		expect(wrapper.find('.absolute').text()).toContain('Juan Perez');
		expect(wrapper.find('.absolute').text()).toContain('Maria Garcia');
		expect(wrapper.find('.absolute').text()).toContain('Pedro Ramirez');
	});

	it('filtra por nombre', async () => {
		const wrapper = await mountComponent();
		await openDropdown(wrapper);
		await wrapper.find(SEARCH_SELECTOR).setValue('juan');
		await nextTick();
		const items = dropdownItems(wrapper);
		expect(items).toHaveLength(1);
		expect(items[0].text()).toContain('Juan Perez');
	});

	it('filtra por apellido', async () => {
		const wrapper = await mountComponent();
		await openDropdown(wrapper);
		await wrapper.find(SEARCH_SELECTOR).setValue('ramirez');
		await nextTick();
		const items = dropdownItems(wrapper);
		expect(items).toHaveLength(1);
		expect(items[0].text()).toContain('Pedro Ramirez');
	});

	it('filtra por apodo', async () => {
		const wrapper = await mountComponent();
		await openDropdown(wrapper);
		await wrapper.find(SEARCH_SELECTOR).setValue('mary');
		await nextTick();
		const items = dropdownItems(wrapper);
		expect(items).toHaveLength(1);
		expect(items[0].text()).toContain('Maria Garcia');
	});

	it('muestra "No se encontraron participantes" cuando nada coincide', async () => {
		const wrapper = await mountComponent();
		await openDropdown(wrapper);
		await wrapper.find(SEARCH_SELECTOR).setValue('zzzzz');
		await nextTick();
		expect(dropdownItems(wrapper)).toHaveLength(0);
		expect(wrapper.find('.absolute').text()).toContain('No se encontraron participantes');
	});

	it('al seleccionar un participante cierra el dropdown y muestra su label', async () => {
		const wrapper = await mountComponent();
		await openDropdown(wrapper);
		await wrapper.find(SEARCH_SELECTOR).setValue('juan');
		await nextTick();

		await dropdownItems(wrapper)[0].trigger('mousedown');
		await nextTick();

		// El dropdown se cerró (v-if lo remueve del DOM).
		expect(wrapper.find('.absolute').exists()).toBe(false);
		// El trigger ahora muestra el participante seleccionado con su apodo.
		expect(wrapper.find('button[aria-expanded]').text()).toContain('Juan Perez (Juanito)');
	});
});
