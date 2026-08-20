/**
 * Selection state of the "import members from a retreat" dialog.
 *
 * It shipped with `<Checkbox :checked>` / `@update:checked`, the radix-vue pair that
 * reka-ui dropped: "select all" never ran and row checks never painted, so the user
 * saw nothing selected while the counter said otherwise (2026-08-20).
 *
 * The `@repo/ui` mock below deliberately mirrors reka-ui's real contract — it honours
 * `modelValue` only — so going back to the legacy prop fails these tests instead of
 * passing against a forgiving stub. See `src/test/repoUiToggleApi.test.ts` for the
 * contract itself.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import ImportMembersModal from '../ImportMembersModal.vue';

const fetchPotentialMembers = vi.fn();
const fetchRetreats = vi.fn();

vi.mock('@repo/ui', () => {
	const passthrough = (tag = 'div') => ({ template: `<${tag}><slot /></${tag}>` });
	return {
		Dialog: { props: ['open'], template: '<div><slot /></div>' },
		DialogContent: passthrough(),
		DialogHeader: passthrough(),
		DialogTitle: passthrough('h2'),
		DialogDescription: passthrough('p'),
		DialogFooter: passthrough(),
		Button: { props: ['disabled'], template: '<button :disabled="disabled"><slot /></button>' },
		Input: {
			props: ['modelValue'],
			emits: ['update:modelValue'],
			template: '<input :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
		},
		Label: passthrough('label'),
		Badge: passthrough('span'),
		// reka-ui's CheckboxRoot: `modelValue` in, `update:modelValue` out. Nothing else.
		Checkbox: {
			name: 'Checkbox',
			props: ['modelValue'],
			emits: ['update:modelValue'],
			template:
				'<button role="checkbox" :data-state="modelValue === \'indeterminate\' ? \'indeterminate\' : (modelValue ? \'checked\' : \'unchecked\')" @click="$emit(\'update:modelValue\', modelValue !== true)"></button>',
		},
		Select: {
			name: 'Select',
			props: ['modelValue'],
			emits: ['update:modelValue'],
			template: '<div><slot /></div>',
		},
		SelectTrigger: passthrough(),
		SelectValue: { props: ['placeholder'], template: '<span>{{ placeholder }}</span>' },
		SelectContent: passthrough(),
		SelectItem: { props: ['value'], template: '<div><slot /></div>' },
		Table: passthrough('table'),
		TableHeader: passthrough('thead'),
		TableRow: passthrough('tr'),
		TableHead: passthrough('th'),
		TableBody: passthrough('tbody'),
		TableCell: passthrough('td'),
		useToast: () => ({ toast: vi.fn() }),
	};
});

vi.mock('@/stores/retreatStore', () => ({
	useRetreatStore: () => ({ fetchRetreats, retreats: RETREATS }),
}));
vi.mock('@/stores/communityStore', () => ({
	useCommunityStore: () => ({ fetchPotentialMembers }),
}));
vi.mock('pinia', () => ({
	storeToRefs: (store: any) => ({ retreats: { value: store.retreats } }),
}));

const RETREATS = [{ id: 'retreat-1', parish: 'Celaya', startDate: '2026-08-28', endDate: '2026-08-30' }];

const PARTICIPANTS = [
	{ id: 'p1', firstName: 'Ana', lastName: 'López', email: 'ana@example.com', type: 'server' },
	{ id: 'p2', firstName: 'Beto', lastName: 'Ruiz', email: 'beto@example.com', type: 'server' },
	{ id: 'p3', firstName: 'Caro', lastName: 'Díaz', email: 'caro@example.com', type: 'walker' },
];

/** Mounts the dialog and picks a retreat, which loads the participant list. */
const mountWithParticipants = async () => {
	const wrapper = mount(ImportMembersModal, {
		props: { open: true, communityId: 'community-1' },
		global: { mocks: { $t: (key: string) => key } },
	});
	await flushPromises();

	await wrapper.findComponent({ name: 'Select' }).vm.$emit('update:modelValue', 'retreat-1');
	await flushPromises();
	return wrapper;
};

/** [header, ...rows] — the header checkbox is the first one in the table. */
const checkboxes = (wrapper: ReturnType<typeof mount>) =>
	wrapper.findAllComponents({ name: 'Checkbox' });

const states = (wrapper: ReturnType<typeof mount>) =>
	checkboxes(wrapper).map((c) => c.attributes('data-state'));

describe('ImportMembersModal — participant selection', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		fetchRetreats.mockResolvedValue(RETREATS);
		fetchPotentialMembers.mockResolvedValue(PARTICIPANTS);
	});

	it('lists one checkbox per participant plus the header one', async () => {
		const wrapper = await mountWithParticipants();

		expect(fetchPotentialMembers).toHaveBeenCalledWith('community-1', 'retreat-1');
		expect(checkboxes(wrapper)).toHaveLength(PARTICIPANTS.length + 1);
		expect(states(wrapper)).toEqual(['unchecked', 'unchecked', 'unchecked', 'unchecked']);
	});

	it('paints the row that was clicked', async () => {
		const wrapper = await mountWithParticipants();

		await checkboxes(wrapper)[1].trigger('click');

		// Row checked, and the header reflects the partial selection.
		expect(states(wrapper)).toEqual(['indeterminate', 'checked', 'unchecked', 'unchecked']);
		expect(wrapper.text()).toContain('1 seleccionado');
	});

	it('unpaints the row on a second click', async () => {
		const wrapper = await mountWithParticipants();

		await checkboxes(wrapper)[1].trigger('click');
		await checkboxes(wrapper)[1].trigger('click');

		expect(states(wrapper)).toEqual(['unchecked', 'unchecked', 'unchecked', 'unchecked']);
	});

	it('select-all from the header selects every participant', async () => {
		const wrapper = await mountWithParticipants();

		await checkboxes(wrapper)[0].trigger('click');

		expect(states(wrapper)).toEqual(['checked', 'checked', 'checked', 'checked']);
		expect(wrapper.text()).toContain('3 seleccionados');
	});

	it('select-all clears the selection when everything is already selected', async () => {
		const wrapper = await mountWithParticipants();

		await checkboxes(wrapper)[0].trigger('click');
		await checkboxes(wrapper)[0].trigger('click');

		expect(states(wrapper)).toEqual(['unchecked', 'unchecked', 'unchecked', 'unchecked']);
	});
});
