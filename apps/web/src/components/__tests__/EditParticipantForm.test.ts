/**
 * Tests for EditParticipantForm.vue – shirt-size tab feature.
 *
 * Covers:
 *  - Tab bar rendering (hidden vs shown based on shirtTypes prop)
 *  - Camisetas tab badge count
 *  - Initialization of shirtSizesByType from participant.shirtSizes
 *  - activeTab reset to 'datos' when participant changes
 *  - shirtSizes included in save emit
 *  - null sizes excluded from shirtSizes in save emit
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { mount, VueWrapper } from '@vue/test-utils';
import { nextTick, ref } from 'vue';
import { createPinia, setActivePinia } from 'pinia';

// Component under test
import EditParticipantForm from '../EditParticipantForm.vue';

// Mock all lucide-vue-next icons (includes ones not in global setup)
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
	// Others used across the app
	Search: { name: 'Search', template: '<svg></svg>' },
	X: { name: 'X', template: '<svg></svg>' },
	Plus: { name: 'Plus', template: '<svg></svg>' },
	Trash2: { name: 'Trash2', template: '<svg></svg>' },
	Edit: { name: 'Edit', template: '<svg></svg>' },
	Loader2: { name: 'Loader2', template: '<svg></svg>' },
	CheckCircle: { name: 'CheckCircle', template: '<svg></svg>' },
	AlertTriangle: { name: 'AlertTriangle', template: '<svg></svg>' },
}));

// Mock @repo/ui (extends global mock with missing components)
vi.mock('@repo/ui', () => ({
	Button: {
		name: 'Button',
		template: '<button @click="$emit(\'click\')"><slot /></button>',
		props: ['variant', 'size', 'disabled'],
		emits: ['click'],
	},
	Input: {
		name: 'Input',
		template: '<input :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
		props: ['modelValue', 'type', 'id', 'placeholder', 'disabled', 'min', 'max', 'step', 'class'],
		emits: ['update:modelValue'],
	},
	Label: { name: 'Label', template: '<label><slot /></label>', props: ['for', 'class'] },
	Select: {
		name: 'Select',
		template: '<div class="select-wrapper"><slot /></div>',
		props: ['modelValue'],
		emits: ['update:modelValue'],
	},
	SelectContent: { name: 'SelectContent', template: '<div class="select-content"><slot /></div>' },
	SelectItem: {
		name: 'SelectItem',
		template: '<div class="select-item" @click="$emit(\'click\')"><slot /></div>',
		props: ['value'],
	},
	SelectTrigger: { name: 'SelectTrigger', template: '<div class="select-trigger"><slot /></div>', props: ['class'] },
	SelectValue: { name: 'SelectValue', template: '<span></span>', props: ['placeholder'] },
	Switch: {
		name: 'Switch',
		template: '<input type="checkbox" :checked="modelValue" @change="$emit(\'update:modelValue\', $event.target.checked)" />',
		props: ['modelValue'],
		emits: ['update:modelValue'],
	},
	Textarea: {
		name: 'Textarea',
		template: '<textarea :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)"></textarea>',
		props: ['modelValue', 'id', 'rows', 'class'],
		emits: ['update:modelValue'],
	},
	Dialog: { name: 'Dialog', template: '<div><slot /></div>', props: ['open'] },
	DialogContent: { name: 'DialogContent', template: '<div><slot /></div>' },
	DialogTitle: { name: 'DialogTitle', template: '<h2><slot /></h2>' },
	DialogDescription: { name: 'DialogDescription', template: '<p><slot /></p>' },
	DialogFooter: { name: 'DialogFooter', template: '<div><slot /></div>' },
	DialogHeader: { name: 'DialogHeader', template: '<div><slot /></div>' },
	Badge: { name: 'Badge', template: '<span><slot /></span>', props: ['variant'] },
	Tooltip: { name: 'Tooltip', template: '<div><slot /></div>' },
	TooltipContent: { name: 'TooltipContent', template: '<div><slot /></div>' },
	TooltipProvider: { name: 'TooltipProvider', template: '<div><slot /></div>' },
	TooltipTrigger: { name: 'TooltipTrigger', template: '<div><slot /></div>' },
	useToast: () => ({ toast: vi.fn() }),
}));

// Mock API services
vi.mock('@/services/api', () => ({
	getParticipantTags: vi.fn(() => Promise.resolve([])),
	assignTagToParticipant: vi.fn(() => Promise.resolve({})),
	removeTagFromParticipant: vi.fn(() => Promise.resolve({})),
	getPalanqueroOptions: vi.fn(() => Promise.resolve([])),
	santisimoApi: {
		getParticipantAvailability: vi.fn(() => Promise.resolve([])),
		setParticipantAvailability: vi.fn(() => Promise.resolve({})),
	},
}));

// Mock vue-i18n
vi.mock('vue-i18n', () => ({
	useI18n: () => ({
		t: (key: string) => key,
		locale: { value: 'es' },
	}),
}));

// Mock vue-router (for useRoute inside stores)
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

// Mock child components
vi.mock('../TagSelector.vue', () => ({
	default: { name: 'TagSelector', template: '<div />', props: ['selectedTags', 'retreatId'] },
}));

vi.mock('../AngelitoAvailabilityEditor.vue', () => ({
	default: { name: 'AngelitoAvailabilityEditor', template: '<div />', props: ['participant', 'retreatId'] },
}));

// --------------------------------------------------------------------------
// Helper data
// --------------------------------------------------------------------------

const MOCK_SHIRT_TYPES = [
	{
		id: 'type-blanca',
		name: 'Blanca',
		color: null,
		requiredForWalkers: false,
		optionalForServers: true,
		sortOrder: 1,
		availableSizes: ['S', 'M', 'L', 'XL'],
	},
	{
		id: 'type-azul',
		name: 'Azul',
		color: null,
		requiredForWalkers: false,
		optionalForServers: true,
		sortOrder: 2,
		availableSizes: ['S', 'M', 'L'],
	},
];

function makeParticipant(overrides: any = {}) {
	return {
		id: 'p-1',
		firstName: 'Ana',
		lastName: 'García',
		type: 'server',
		retreatId: 'retreat-1',
		shirtSizes: [],
		...overrides,
	};
}

function mountForm(props: {
	participant: any;
	shirtTypes?: any[];
	columnsToShow?: string[];
	columnsToEdit?: string[];
	allColumns?: any[];
}) {
	const pinia = createPinia();
	setActivePinia(pinia);

	return mount(EditParticipantForm, {
		props: {
			participant: props.participant,
			shirtTypes: props.shirtTypes ?? [],
			columnsToShow: props.columnsToShow ?? ['firstName', 'lastName'],
			columnsToEdit: props.columnsToEdit ?? ['firstName', 'lastName'],
			allColumns: props.allColumns ?? [
				{ key: 'firstName', label: 'Nombre' },
				{ key: 'lastName', label: 'Apellido' },
			],
		},
		global: {
			plugins: [pinia],
			stubs: {
				teleport: true,
				transition: true,
			},
		},
	});
}

// --------------------------------------------------------------------------
// Tests
// --------------------------------------------------------------------------

describe('EditParticipantForm – shirt size tabs', () => {
	afterEach(() => {
		vi.clearAllMocks();
	});

	it('does not render tabs when shirtTypes prop is empty', async () => {
		const wrapper = mountForm({
			participant: makeParticipant(),
			shirtTypes: [],
		});
		await nextTick();

		// Tab bar should not be present when shirtTypes is empty
		const tabButtons = wrapper.findAll('button').filter(
			(btn) => btn.text().trim() === 'Datos' || btn.text().trim().startsWith('Camisetas'),
		);
		expect(tabButtons.length).toBe(0);

		wrapper.unmount();
	});

	it('renders Datos and Camisetas tabs when shirtTypes provided', async () => {
		const wrapper = mountForm({
			participant: makeParticipant(),
			shirtTypes: MOCK_SHIRT_TYPES,
		});
		await nextTick();

		const allButtons = wrapper.findAll('button');
		const datosTab = allButtons.find((btn) => btn.text().trim() === 'Datos');
		const camisetasTab = allButtons.find((btn) => btn.text().trim().startsWith('Camisetas'));

		expect(datosTab).toBeDefined();
		expect(camisetasTab).toBeDefined();

		wrapper.unmount();
	});

	it('shows badge with count of selected shirts on Camisetas tab', async () => {
		const participant = makeParticipant({
			shirtSizes: [
				{ shirtTypeId: 'type-blanca', size: 'M' },
				{ shirtTypeId: 'type-azul', size: 'L' },
			],
		});
		const wrapper = mountForm({
			participant,
			shirtTypes: MOCK_SHIRT_TYPES,
		});
		await nextTick();

		// The component has shirtSizesByType initialized with 2 entries
		expect(wrapper.vm.shirtSizesByType['type-blanca']).toBe('M');
		expect(wrapper.vm.shirtSizesByType['type-azul']).toBe('L');
		expect(wrapper.vm.selectedShirtCount).toBe(2);

		wrapper.unmount();
	});

	it('initializes shirtSizesByType from participant.shirtSizes', async () => {
		const participant = makeParticipant({
			shirtSizes: [
				{ shirtTypeId: 'type-blanca', size: 'M' },
			],
		});
		const wrapper = mountForm({
			participant,
			shirtTypes: MOCK_SHIRT_TYPES,
		});
		await nextTick();

		expect(wrapper.vm.shirtSizesByType['type-blanca']).toBe('M');
		expect(wrapper.vm.shirtSizesByType['type-azul']).toBeUndefined();

		wrapper.unmount();
	});

	it('resets activeTab to datos when participant changes', async () => {
		const participant1 = makeParticipant({ id: 'p-1' });
		const wrapper = mountForm({
			participant: participant1,
			shirtTypes: MOCK_SHIRT_TYPES,
		});
		await nextTick();

		// Switch to camisetas tab
		wrapper.vm.activeTab = 'camisetas';
		await nextTick();
		expect(wrapper.vm.activeTab).toBe('camisetas');

		// Change participant
		const participant2 = makeParticipant({ id: 'p-2', firstName: 'Luis' });
		await wrapper.setProps({ participant: participant2 });
		await nextTick();

		// activeTab should reset to 'datos'
		expect(wrapper.vm.activeTab).toBe('datos');

		wrapper.unmount();
	});

	it('includes shirtSizes in save emit when shirtTypes configured', async () => {
		const participant = makeParticipant({
			shirtSizes: [
				{ shirtTypeId: 'type-blanca', size: 'M' },
			],
		});
		const wrapper = mountForm({
			participant,
			shirtTypes: MOCK_SHIRT_TYPES,
		});
		await nextTick();

		// Click Guardar (the last Button in the form)
		const saveButton = wrapper.findAll('button').find(
			(btn) => btn.text().includes('Guardar'),
		);
		expect(saveButton).toBeDefined();
		await saveButton!.trigger('click');
		await nextTick();

		const emitted = wrapper.emitted('save');
		expect(emitted).toBeDefined();
		expect(emitted!.length).toBeGreaterThan(0);

		const savedData = emitted![0][0] as any;
		expect(savedData).toHaveProperty('shirtSizes');
		expect(Array.isArray(savedData.shirtSizes)).toBe(true);
		expect(savedData.shirtSizes).toContainEqual({ shirtTypeId: 'type-blanca', size: 'M' });

		wrapper.unmount();
	});

	it('excludes null sizes from shirtSizes in save emit', async () => {
		// Start with one valid size and one 'null' string size
		const participant = makeParticipant({
			shirtSizes: [
				{ shirtTypeId: 'type-blanca', size: 'M' },
			],
		});
		const wrapper = mountForm({
			participant,
			shirtTypes: MOCK_SHIRT_TYPES,
		});
		await nextTick();

		// Manually set type-azul to 'null' (the "Sin talla" option value)
		wrapper.vm.shirtSizesByType['type-azul'] = 'null';
		await nextTick();

		const saveButton = wrapper.findAll('button').find(
			(btn) => btn.text().includes('Guardar'),
		);
		await saveButton!.trigger('click');
		await nextTick();

		const emitted = wrapper.emitted('save');
		expect(emitted).toBeDefined();
		const savedData = emitted![0][0] as any;

		// Should contain 'type-blanca' but NOT 'type-azul' (which has value 'null')
		expect(savedData.shirtSizes).toContainEqual({ shirtTypeId: 'type-blanca', size: 'M' });
		const azulEntry = savedData.shirtSizes.find((s: any) => s.shirtTypeId === 'type-azul');
		expect(azulEntry).toBeUndefined();

		wrapper.unmount();
	});
});
