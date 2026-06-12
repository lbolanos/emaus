import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';

// --- Mocks ---
const getDebtsByParticipant = vi.fn();
const createParticipantDebt = vi.fn();
const updateParticipantDebt = vi.fn();
const deleteParticipantDebt = vi.fn();

vi.mock('@/services/api', () => ({
	getDebtsByParticipant: (...a: any[]) => getDebtsByParticipant(...a),
	createParticipantDebt: (...a: any[]) => createParticipantDebt(...a),
	updateParticipantDebt: (...a: any[]) => updateParticipantDebt(...a),
	deleteParticipantDebt: (...a: any[]) => deleteParticipantDebt(...a),
}));

const toast = vi.fn();
vi.mock('@repo/ui', () => ({
	useToast: () => ({ toast }),
	Button: { name: 'Button', template: '<button @click="$emit(\'click\')"><slot /></button>' },
	Input: {
		name: 'Input',
		template:
			'<input :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
		props: ['modelValue', 'type', 'min', 'step', 'placeholder'],
		emits: ['update:modelValue'],
	},
}));

vi.mock('lucide-vue-next', () => ({
	Trash2: { template: '<i />' },
	Plus: { template: '<i />' },
	Pencil: { template: '<i />' },
}));

import ParticipantDebtManager from '../ParticipantDebtManager.vue';

const baseParticipant = (overrides: any = {}) => ({
	id: 'p1',
	type: 'server',
	chargeBreakdown: {
		retreatFee: 1500,
		meals: 150,
		debts: 0,
		expected: 1650,
		totalPaid: 0,
		balance: 1650,
	},
	...overrides,
});

const mountManager = (participant: any) =>
	mount(ParticipantDebtManager, {
		props: { participant, retreatId: 'r1' },
		global: { mocks: { $t: (k: string) => k } },
	});

describe('ParticipantDebtManager', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		getDebtsByParticipant.mockResolvedValue([]);
	});

	it('muestra el desglose de cargos y el estado pendiente cuando balance > 0', async () => {
		const wrapper = mountManager(baseParticipant());
		await flushPromises();
		const text = wrapper.text();
		expect(text).toContain('debts.expected');
		expect(text).toContain('debts.pending');
		expect(text).not.toContain('debts.pazYSalvo');
	});

	it('marca paz y salvo cuando balance <= 0', async () => {
		const wrapper = mountManager(
			baseParticipant({
				chargeBreakdown: { retreatFee: 1500, meals: 0, debts: 0, expected: 1500, totalPaid: 1500, balance: 0 },
			}),
		);
		await flushPromises();
		expect(wrapper.text()).toContain('debts.pazYSalvo');
	});

	it('carga las deudas del participante al montar', async () => {
		getDebtsByParticipant.mockResolvedValue([{ id: 'd1', amount: 200, description: 'Camiseta' }]);
		const wrapper = mountManager(baseParticipant());
		await flushPromises();
		expect(getDebtsByParticipant).toHaveBeenCalledWith('p1');
		expect(wrapper.text()).toContain('Camiseta');
	});

	it('oculta la gestión de deudas para caminantes', async () => {
		const wrapper = mountManager(baseParticipant({ type: 'walker' }));
		await flushPromises();
		expect(wrapper.text()).not.toContain('debts.title');
	});

	it('crea una deuda con monto y concepto, y emite "changed"', async () => {
		createParticipantDebt.mockResolvedValue({});
		const wrapper = mountManager(baseParticipant());
		await flushPromises();

		const inputs = wrapper.findAll('input');
		// Bloque de alta: penúltimo input = monto, último = concepto
		await inputs[inputs.length - 2].setValue('250');
		await inputs[inputs.length - 1].setValue('Camiseta extra');

		const addBtn = wrapper.findAll('button').find((b) => b.text().includes('debts.add'));
		await addBtn!.trigger('click');
		await flushPromises();

		expect(createParticipantDebt).toHaveBeenCalledWith(
			expect.objectContaining({
				participantId: 'p1',
				retreatId: 'r1',
				amount: 250,
				description: 'Camiseta extra',
			}),
		);
		expect(wrapper.emitted('changed')).toBeTruthy();
	});

	it('valida monto > 0 al crear deuda', async () => {
		const wrapper = mountManager(baseParticipant());
		await flushPromises();
		const addBtn = wrapper.findAll('button').find((b) => b.text().includes('debts.add'));
		await addBtn!.trigger('click');
		await flushPromises();
		expect(createParticipantDebt).not.toHaveBeenCalled();
		expect(toast).toHaveBeenCalled();
	});

	it('rechaza el alta si falta el concepto', async () => {
		const wrapper = mountManager(baseParticipant());
		await flushPromises();
		const inputs = wrapper.findAll('input');
		// Solo monto, sin concepto
		await inputs[inputs.length - 2].setValue('250');
		const addBtn = wrapper.findAll('button').find((b) => b.text().includes('debts.add'));
		await addBtn!.trigger('click');
		await flushPromises();
		expect(createParticipantDebt).not.toHaveBeenCalled();
		expect(toast).toHaveBeenCalled();
	});
});
