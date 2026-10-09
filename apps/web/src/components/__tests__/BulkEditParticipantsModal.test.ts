/**
 * Field-control contract of the bulk edit modal.
 *
 * It shipped with `palancasCoordinator` as a free-text input while the individual
 * form offers a select fed by GET /responsibilities/palanquero-options — free text
 * breaks the exact-match 'Palanquero N' lookups of the palanquero notifications.
 * The same audit surfaced three more mismatches locked here: `type` missing
 * waiting/partial_server, `pickupLocation` as text instead of the fixed pickup
 * list, and the legacy `palancasReceived` prose field offered instead of the
 * numeric `palancasReceivedCount` every hito/counter reads.
 *
 * The @repo/ui mock mirrors reka-ui's real contract (`modelValue` in,
 * `update:modelValue` out) — pattern from
 * src/components/community/__tests__/ImportMembersModal.test.ts. The global
 * vue-i18n mock makes $t return the key itself, so labels render as raw keys.
 */
import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import BulkEditParticipantsModal from '../BulkEditParticipantsModal.vue';

vi.mock('@repo/ui', () => {
	const passthrough = (tag = 'div') => ({ template: `<${tag}><slot /></${tag}>` });
	return {
		Button: { props: ['disabled'], template: '<button :disabled="disabled"><slot /></button>' },
		Label: passthrough('label'),
		Input: {
			props: ['modelValue', 'type'],
			emits: ['update:modelValue'],
			template:
				'<input :type="type || \'text\'" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
		},
		Textarea: {
			props: ['modelValue'],
			emits: ['update:modelValue'],
			template:
				'<textarea :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)"></textarea>',
		},
		Switch: { props: ['modelValue'], emits: ['update:modelValue'], template: '<button role="switch"></button>' },
		Select: {
			name: 'Select',
			props: ['modelValue'],
			emits: ['update:modelValue'],
			template: '<div class="select-root"><slot /></div>',
		},
		SelectTrigger: passthrough(),
		SelectValue: { props: ['placeholder'], template: '<span>{{ placeholder }}</span>' },
		SelectContent: passthrough(),
		SelectItem: {
			props: ['value'],
			template: '<div class="select-item" :data-value="value"><slot /></div>',
		},
		useToast: () => ({ toast: vi.fn() }),
	};
});

const ALL_COLUMNS = [
	{ key: 'type', label: 'participants.fields.type' },
	{ key: 'pickupLocation', label: 'participants.fields.pickupLocation' },
	{ key: 'palancasCoordinator', label: 'participants.fields.palancasCoordinator' },
	{ key: 'palancasReceivedCount', label: 'participants.fields.palancasReceivedCount' },
];

const PARTICIPANTS = [
	{ id: 'p1', firstName: 'Ana', lastName: 'López', cellPhone: '555-0001' },
	{ id: 'p2', firstName: 'Beto', lastName: 'Ruiz', cellPhone: '555-0002' },
];

const PALANQUERO_OPTIONS = [
	{ value: 'Palanquero 1', label: 'Palanquero 1 (Ana García)' },
	{ value: 'Palanquero 2', label: 'Palanquero 2 (Luis Pérez)' },
	{ value: 'Palanquero 3', label: 'Palanquero 3' },
];

type Props = InstanceType<typeof BulkEditParticipantsModal>['$props'];

const mountModal = (props: Partial<Props> = {}) =>
	mount(BulkEditParticipantsModal, {
		props: {
			isOpen: true,
			participants: PARTICIPANTS,
			allColumns: ALL_COLUMNS,
			...props,
		},
		global: { stubs: { teleport: true } },
	});

/** The field block wrapping the label with that `for` attribute. */
const fieldBlock = (wrapper: ReturnType<typeof mountModal>, field: string) => {
	const block = wrapper
		.findAll('div.space-y-2')
		.find((b) => b.find(`label[for="${field}"]`).exists());
	if (!block) throw new Error(`Field block not found: ${field}`);
	return block;
};

describe('BulkEditParticipantsModal', () => {
	it('renders palancasCoordinator as a select when palanquero options are provided', () => {
		const wrapper = mountModal({ palanqueroOptions: PALANQUERO_OPTIONS });
		const block = fieldBlock(wrapper, 'palancasCoordinator');

		expect(block.find('.select-root').exists()).toBe(true);
		expect(block.find('input[type="text"]').exists()).toBe(false);
		// Options come from the prop (the API labels), plus the "No cambiar" item.
		const values = block.findAll('.select-item').map((i) => i.attributes('data-value'));
		expect(values).toEqual([undefined, 'Palanquero 1', 'Palanquero 2', 'Palanquero 3']);
		expect(block.text()).toContain('Palanquero 1 (Ana García)');
	});

	it('falls back to free text when the palanquero options fetch failed', () => {
		const wrapper = mountModal({ palanqueroOptions: [] });
		const block = fieldBlock(wrapper, 'palancasCoordinator');

		expect(block.find('input[type="text"]').exists()).toBe(true);
		expect(block.find('.select-root').exists()).toBe(false);
	});

	it('applies the chosen palanquero to every participant on save', async () => {
		const wrapper = mountModal({ palanqueroOptions: PALANQUERO_OPTIONS });
		const block = fieldBlock(wrapper, 'palancasCoordinator');

		block.getComponent({ name: 'Select' }).vm.$emit('update:modelValue', 'Palanquero 2');
		await wrapper.vm.$nextTick();

		const saveButton = wrapper
			.findAll('button')
			.find((b) => b.text() === 'participants.bulkEdit.saveChanges');
		expect(saveButton).toBeTruthy();
		expect(saveButton!.attributes('disabled')).toBeUndefined();

		await saveButton!.trigger('click');

		expect(wrapper.emitted('save')).toHaveLength(1);
		const [saved] = wrapper.emitted('save')![0] as typeof PARTICIPANTS;
		expect(saved).toHaveLength(2);
		for (const p of saved) {
			expect(p.palancasCoordinator).toBe('Palanquero 2');
		}
	});

	it('offers the four participant types the schema and individual form allow', () => {
		const wrapper = mountModal();
		const block = fieldBlock(wrapper, 'type');

		const values = block.findAll('.select-item').map((i) => i.attributes('data-value'));
		expect(values).toEqual([undefined, 'walker', 'server', 'waiting', 'partial_server']);
	});

	it('renders pickupLocation as the fixed pickup list and palancasReceivedCount as a number', () => {
		const wrapper = mountModal({ palanqueroOptions: PALANQUERO_OPTIONS });

		const pickup = fieldBlock(wrapper, 'pickupLocation');
		const pickupValues = pickup.findAll('.select-item').map((i) => i.attributes('data-value'));
		expect(pickupValues).toContain('Parroquia');
		expect(pickupValues).toContain('Llego por mi cuenta');
		expect(pickup.find('input[type="text"]').exists()).toBe(false);

		const count = fieldBlock(wrapper, 'palancasReceivedCount');
		expect(count.find('input[type="number"]').exists()).toBe(true);
	});

	it('hides the health fields when the list does not offer their columns (no participant:health)', () => {
		// ParticipantList drops health columns from allColumns without the
		// permission; the API answers 403 to any health field from that caller,
		// so offering them here would fail every row of the bulk save.
		const wrapper = mountModal();
		const labels = wrapper.findAll('label').map((l) => l.attributes('for'));

		expect(labels).toContain('isCancelled');
		expect(labels).toContain('hasMedication');
		for (const healthField of ['notes', 'medicationDetails', 'dietaryRestrictionsDetails']) {
			expect(labels).not.toContain(healthField);
		}
	});

	it('offers the health fields when the list offers their columns', () => {
		const wrapper = mountModal({
			allColumns: [
				...ALL_COLUMNS,
				{ key: 'notes', label: 'participants.fields.notes' },
				{ key: 'medicationDetails', label: 'participants.fields.medicationDetails' },
			],
		});
		const labels = wrapper.findAll('label').map((l) => l.attributes('for'));

		expect(labels).toContain('notes');
		expect(labels).toContain('medicationDetails');
		expect(labels).not.toContain('dietaryRestrictionsDetails');
	});
});
