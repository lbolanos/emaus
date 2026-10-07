/**
 * Parity between the individual form and the bulk edit modal.
 *
 * Both surfaces classify every participant field into a control type. They used
 * to do it with two independent copies of the same heuristics, and they drifted:
 * the bulk modal shipped `palancasCoordinator` as free text while the individual
 * form offered a select — free text breaks the exact-match 'Palanquero N'
 * lookups of the palanquero notifications. Both now classify through
 * participantFieldControls.ts; this test mounts BOTH components and asserts the
 * rendered control of each field matches the catalog, so neither surface can
 * drift again (neither by stopping to consume the catalog nor by re-branching
 * in the template).
 *
 * Control detection is DOM-based: booleans render as radios in the modal and as
 * a Switch in the form, selects render `.select-root` (shared mock), and inputs
 * carry their type. The @repo/ui mock mirrors reka-ui's real contract
 * (`modelValue` in, `update:modelValue` out) — pattern from
 * src/components/community/__tests__/ImportMembersModal.test.ts.
 */
import { describe, it, expect, vi } from 'vitest';
import { mount, flushPromises, VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import EditParticipantForm from '../EditParticipantForm.vue';
import BulkEditParticipantsModal from '../BulkEditParticipantsModal.vue';
import { inferFieldControl, PARTICIPANT_TYPE_OPTIONS } from '@/constants/participantFieldControls';

vi.mock('lucide-vue-next', () => ({
	ChevronDown: { name: 'ChevronDown', template: '<svg></svg>' },
	ChevronUp: { name: 'ChevronUp', template: '<svg></svg>' },
	User: { name: 'User', template: '<svg></svg>' },
	Phone: { name: 'Phone', template: '<svg></svg>' },
	Users: { name: 'Users', template: '<svg></svg>' },
	Heart: { name: 'Heart', template: '<svg></svg>' },
	ClipboardList: { name: 'ClipboardList', template: '<svg></svg>' },
	MapPin: { name: 'MapPin', template: '<svg></svg>' },
	Briefcase: { name: 'Briefcase', template: '<svg></svg>' },
	FileText: { name: 'FileText', template: '<svg></svg>' },
	Shield: { name: 'Shield', template: '<svg></svg>' },
	Tag: { name: 'Tag', template: '<svg></svg>' },
}));

// One @repo/ui mock shared by both components so the rendered markers are the
// same on each side of the parity assertion.
vi.mock('@repo/ui', () => {
	const passthrough = (tag = 'div') => ({ template: `<${tag}><slot /></${tag}>` });
	return {
		Button: { props: ['disabled'], template: '<button :disabled="disabled"><slot /></button>' },
		// No declared props: `for` reaches the DOM via attribute fallthrough.
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
		Switch: {
			props: ['modelValue'],
			emits: ['update:modelValue'],
			template: '<input type="checkbox" role="switch" :checked="!!modelValue" />',
		},
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
		Badge: { props: ['variant'], template: '<span><slot /></span>' },
		Dialog: { props: ['open'], template: '<div><slot /></div>' },
		DialogContent: passthrough(),
		DialogTitle: { name: 'DialogTitle', template: '<h2><slot /></h2>' },
		DialogDescription: passthrough('p'),
		DialogFooter: passthrough(),
		DialogHeader: passthrough(),
		Tooltip: passthrough(),
		TooltipContent: passthrough(),
		TooltipProvider: passthrough(),
		TooltipTrigger: passthrough(),
		useToast: () => ({ toast: vi.fn() }),
	};
});

vi.mock('@/services/api', () => ({
	getParticipantTags: vi.fn(() => Promise.resolve([])),
	assignTagToParticipant: vi.fn(() => Promise.resolve({})),
	removeTagFromParticipant: vi.fn(() => Promise.resolve({})),
	getPalanqueroOptions: vi.fn(() =>
		Promise.resolve([
			{ value: 'Palanquero 1', label: 'Palanquero 1 (Ana García)' },
			{ value: 'Palanquero 2', label: 'Palanquero 2 (Luis Pérez)' },
			{ value: 'Palanquero 3', label: 'Palanquero 3' },
		]),
	),
	santisimoApi: {
		getParticipantAvailability: vi.fn(() => Promise.resolve([])),
		setParticipantAvailability: vi.fn(() => Promise.resolve({})),
	},
}));

vi.mock('vue-i18n', () => ({
	useI18n: () => ({
		t: (key: string) => key,
		locale: { value: 'es' },
	}),
}));

vi.mock('vue-router', () => ({
	useRoute: () => ({
		path: '/mocked-path',
		name: 'mocked-route',
		params: {},
		query: {},
		hash: '',
		fullPath: '/mocked-path',
		matched: [],
		meta: {},
	}),
	useRouter: () => ({
		push: vi.fn(),
		replace: vi.fn(),
		resolve: vi.fn(() => ({ href: '/mocked' })),
	}),
}));

vi.mock('../TagSelector.vue', () => ({
	default: { name: 'TagSelector', template: '<div />', props: ['selectedTags', 'retreatId'] },
}));

vi.mock('../AngelitoAvailabilityEditor.vue', () => ({
	default: { name: 'AngelitoAvailabilityEditor', template: '<div />', props: ['participant', 'retreatId'] },
}));

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

const PALANQUERO_OPTIONS = [
	{ value: 'Palanquero 1', label: 'Palanquero 1 (Ana García)' },
	{ value: 'Palanquero 2', label: 'Palanquero 2 (Luis Pérez)' },
	{ value: 'Palanquero 3', label: 'Palanquero 3' },
];

/** Every field the bulk modal offers (its fieldCategories), matched against the form. */
const GENERIC_FIELDS = [
	'isCancelled', 'type', 'tshirtSize', 'notes',
	'snores', 'hasMedication', 'hasDietaryRestrictions', 'medicationDetails', 'dietaryRestrictionsDetails',
	'pickupLocation', 'arrivesOnOwn', 'requestsSingleRoom', 'tableMesa.name',
	'isScholarship',
] as const;

/** Palancas fields: the modal category vs the form's palancas-specific card. */
const PALANCAS_FIELDS = ['palancasCoordinator', 'palancasRequested', 'palancasReceivedCount', 'palancasNotes'] as const;

const columnsFor = (fields: readonly string[]) => fields.map((f) => ({ key: f, label: `participants.fields.${f}` }));

const PARTICIPANTS = [
	{ id: 'p1', firstName: 'Ana', lastName: 'López', cellPhone: '555-0001' },
	{ id: 'p2', firstName: 'Beto', lastName: 'Ruiz', cellPhone: '555-0002' },
];

const mountModal = () =>
	mount(BulkEditParticipantsModal, {
		props: {
			isOpen: true,
			participants: PARTICIPANTS,
			allColumns: columnsFor([...GENERIC_FIELDS, ...PALANCAS_FIELDS]),
			palanqueroOptions: PALANQUERO_OPTIONS,
		},
		global: { stubs: { teleport: true, transition: true } },
	});

const mountForm = async (fields: readonly string[]) => {
	const pinia = createPinia();
	setActivePinia(pinia);
	const wrapper = mount(EditParticipantForm, {
		props: {
			participant: {
				id: 'p-1',
				firstName: 'Ana',
				lastName: 'García',
				type: 'server',
				retreatId: 'retreat-1',
				shirtSizes: [],
				palancasCoordinator: 'Palanquero 1',
				palancasRequested: true,
				palancasReceivedCount: 2,
			},
			columnsToShow: [...fields],
			columnsToEdit: [...fields],
			allColumns: columnsFor(fields),
			shirtTypes: [],
		},
		global: { plugins: [pinia], stubs: { teleport: true, transition: true } },
	});
	// The form hydrates tags, palanquero options and availability on mount.
	await flushPromises();
	return wrapper;
};

/** The field block wrapping the label with that `for` attribute. */
const fieldBlock = (wrapper: VueWrapper<any>, field: string): Element => {
	const label = wrapper.findAll('label').find((l) => l.attributes('for') === field);
	if (!label) throw new Error(`Field label not found: ${field}`);
	const block = label.element.parentElement;
	if (!block) throw new Error(`Field block not found: ${field}`);
	return block;
};

/** Classify the control a rendered field block exposes. */
const controlKind = (block: Element): string => {
	if (block.querySelector('input[type="radio"], [role="switch"]')) return 'boolean';
	if (block.querySelector('.select-root')) return 'select';
	if (block.querySelector('textarea')) return 'textarea';
	const input = block.querySelector('input');
	if (input) return input.getAttribute('type') || 'text';
	return 'none';
};

// --------------------------------------------------------------------------
// Catalog unit tests
// --------------------------------------------------------------------------

describe('inferFieldControl', () => {
	it('classifies the closed selects with their options source', () => {
		expect(inferFieldControl('type')).toEqual({ control: 'select', options: 'participantType' });
		expect(inferFieldControl('palancasCoordinator')).toEqual({ control: 'select', options: 'palanquero' });
		expect(inferFieldControl('pickupLocation')).toEqual({ control: 'select', options: 'pickupLocation' });
	});

	it('classifies numbers, including the amount suffix heuristic', () => {
		expect(inferFieldControl('palancasReceivedCount').control).toBe('number');
		expect(inferFieldControl('scholarshipAmount').control).toBe('number');
		expect(inferFieldControl('mealCount').control).toBe('number');
		expect(inferFieldControl('someOtherAmount').control).toBe('number');
	});

	it('classifies booleans by prefix and the extra list', () => {
		expect(inferFieldControl('isCancelled').control).toBe('boolean');
		expect(inferFieldControl('hasMedication').control).toBe('boolean');
		expect(inferFieldControl('requestsSingleRoom').control).toBe('boolean');
		// None of these start with is/has/requests.
		expect(inferFieldControl('arrivesOnOwn').control).toBe('boolean');
		expect(inferFieldControl('snores').control).toBe('boolean');
		expect(inferFieldControl('palancasRequested').control).toBe('boolean');
		expect(inferFieldControl('takesFridayMeal').control).toBe('boolean');
	});

	it('classifies free text, textareas, dates and tags', () => {
		expect(inferFieldControl('firstName').control).toBe('text');
		expect(inferFieldControl('tshirtSize').control).toBe('text');
		expect(inferFieldControl('tableMesa.name').control).toBe('text');
		expect(inferFieldControl('notes').control).toBe('textarea');
		expect(inferFieldControl('medicationDetails').control).toBe('textarea');
		expect(inferFieldControl('birthDate').control).toBe('date');
		expect(inferFieldControl('tags').control).toBe('tags');
	});

	it('offers the four schema participant types with i18n keys', () => {
		expect(PARTICIPANT_TYPE_OPTIONS.map((o) => o.value)).toEqual(['walker', 'server', 'waiting', 'partial_server']);
		for (const opt of PARTICIPANT_TYPE_OPTIONS) {
			expect(opt.labelKey).toMatch(/^participants\.types\./);
		}
	});
});

// --------------------------------------------------------------------------
// Parity: form vs modal vs catalog
// --------------------------------------------------------------------------

describe('field-control parity: EditParticipantForm vs BulkEditParticipantsModal', () => {
	it('generic fields render the catalog control in both surfaces', async () => {
		const form = await mountForm(GENERIC_FIELDS);
		const modal = mountModal();

		for (const field of GENERIC_FIELDS) {
			const expected = inferFieldControl(field).control;
			expect(controlKind(fieldBlock(form, field)), `form ${field}`).toBe(expected);
			expect(controlKind(fieldBlock(modal, field)), `modal ${field}`).toBe(expected);
		}

		form.unmount();
		modal.unmount();
	});

	it('palancas fields render the catalog control in both surfaces', async () => {
		// columnsToShow with palancasCoordinator switches the form to its
		// palancas-specific card layout.
		const form = await mountForm(PALANCAS_FIELDS);
		const modal = mountModal();

		for (const field of PALANCAS_FIELDS) {
			const expected = inferFieldControl(field).control;
			expect(controlKind(fieldBlock(form, field)), `form ${field}`).toBe(expected);
			expect(controlKind(fieldBlock(modal, field)), `modal ${field}`).toBe(expected);
		}

		form.unmount();
		modal.unmount();
	});
});
