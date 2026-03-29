import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { mount, VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { nextTick } from 'vue';
import { cleanupMocks } from '@/test/utils';

// Mock axios
vi.mock('axios', () => ({
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
}));

// Mock CSRF utility
vi.mock('@/utils/csrf', () => ({
	setupCsrfInterceptor: vi.fn(),
	getCsrfToken: vi.fn(async () => 'mock-csrf-token'),
}));

// Mock runtime config
vi.mock('@/config/runtimeConfig', () => ({
	getApiUrl: vi.fn(() => 'http://localhost:3001/api'),
}));

// Mock telemetry service
vi.mock('@/services/telemetryService', () => ({
	telemetryService: {
		isTelemetryActive: vi.fn(() => false),
		trackApiCallTime: vi.fn(),
		trackError: vi.fn(),
	},
}));

// Mock the API service
vi.mock('@/services/api', () => ({
	api: {
		get: vi.fn(),
		post: vi.fn(),
		put: vi.fn(),
		delete: vi.fn(),
	},
}));

// Mock vue-router
vi.mock('vue-router', () => ({
	useRouter: () => ({
		push: vi.fn(),
		replace: vi.fn(),
		resolve: vi.fn(() => ({ href: '/test-route' })),
	}),
	useRoute: () => ({
		name: 'bags-report',
		params: {},
		path: '/app/bags-report',
	}),
}));

// Mock vue-i18n
vi.mock('vue-i18n', () => ({
	useI18n: () => ({
		t: (key: string) => key,
		locale: { value: 'es' },
	}),
	createI18n: vi.fn(),
}));

// Mock lucide-vue-next icons
vi.mock('lucide-vue-next', () => ({
	Droplets: { name: 'Droplets', template: '<svg data-icon="droplets"></svg>' },
	Shirt: { name: 'Shirt', template: '<svg data-icon="shirt"></svg>' },
	Smartphone: { name: 'Smartphone', template: '<svg data-icon="smartphone"></svg>' },
	Gift: { name: 'Gift', template: '<svg data-icon="gift"></svg>' },
	Mail: { name: 'Mail', template: '<svg data-icon="mail"></svg>' },
	ChevronDown: { name: 'ChevronDown', template: '<svg data-icon="chevron-down"></svg>' },
	ChevronUp: { name: 'ChevronUp', template: '<svg data-icon="chevron-up"></svg>' },
	Printer: { name: 'Printer', template: '<svg data-icon="printer"></svg>' },
	ArrowUpDown: { name: 'ArrowUpDown', template: '<svg></svg>' },
	Trash2: { name: 'Trash2', template: '<svg></svg>' },
	Edit: { name: 'Edit', template: '<svg></svg>' },
	FileUp: { name: 'FileUp', template: '<svg></svg>' },
	FileDown: { name: 'FileDown', template: '<svg></svg>' },
	Columns: { name: 'Columns', template: '<svg></svg>' },
	ListFilter: { name: 'ListFilter', template: '<svg></svg>' },
	MoreVertical: { name: 'MoreVertical', template: '<svg></svg>' },
	Plus: { name: 'Plus', template: '<svg></svg>' },
	X: { name: 'X', template: '<svg></svg>' },
	RefreshCw: { name: 'RefreshCw', template: '<svg></svg>' },
	MessageCircle: { name: 'MessageCircle', template: '<svg></svg>' },
	ShoppingBag: { name: 'ShoppingBag', template: '<svg></svg>' },
}));

// Mock exceljs
vi.mock('exceljs', () => ({
	default: { Workbook: vi.fn() },
}));

// Mock @repo/ui components
vi.mock('@repo/ui', () => ({
	Button: { name: 'Button', template: '<button><slot /></button>' },
	Input: { name: 'Input', template: '<input />' },
	Checkbox: {
		name: 'Checkbox',
		template: '<button role="checkbox" :aria-checked="modelValue" @click="$emit(\'update:modelValue\', !modelValue)"><slot /></button>',
		props: ['modelValue'],
		emits: ['update:modelValue'],
	},
	Table: { name: 'Table', template: '<table><slot /></table>' },
	TableBody: { name: 'TableBody', template: '<tbody><slot /></tbody>' },
	TableCell: { name: 'TableCell', template: '<td><slot /></td>' },
	TableHead: { name: 'TableHead', template: '<thead><slot /></thead>' },
	TableHeader: { name: 'TableHeader', template: '<th><slot /></th>' },
	TableRow: { name: 'TableRow', template: '<tr><slot /></tr>' },
	TableCaption: { name: 'TableCaption', template: '<caption><slot /></caption>' },
	TableFooter: { name: 'TableFooter', template: '<tfoot><slot /></tfoot>' },
	Dialog: { name: 'Dialog', template: '<div><slot /></div>' },
	DialogContent: { name: 'DialogContent', template: '<div><slot /></div>' },
	DialogDescription: { name: 'DialogDescription', template: '<div><slot /></div>' },
	DialogFooter: { name: 'DialogFooter', template: '<div><slot /></div>' },
	DialogHeader: { name: 'DialogHeader', template: '<div><slot /></div>' },
	DialogTitle: { name: 'DialogTitle', template: '<div><slot /></div>' },
	Tooltip: { name: 'Tooltip', template: '<div><slot /></div>' },
	TooltipContent: { name: 'TooltipContent', template: '<div><slot /></div>' },
	TooltipProvider: { name: 'TooltipProvider', template: '<div><slot /></div>' },
	TooltipTrigger: { name: 'TooltipTrigger', template: '<div><slot /></div>' },
	DropdownMenu: { name: 'DropdownMenu', template: '<div><slot /></div>' },
	DropdownMenuContent: { name: 'DropdownMenuContent', template: '<div><slot /></div>' },
	DropdownMenuItem: { name: 'DropdownMenuItem', template: '<div><slot /></div>' },
	DropdownMenuTrigger: { name: 'DropdownMenuTrigger', template: '<div><slot /></div>' },
	DropdownMenuLabel: { name: 'DropdownMenuLabel', template: '<div><slot /></div>' },
	DropdownMenuSeparator: { name: 'DropdownMenuSeparator', template: '<div />' },
	useToast: () => ({ toast: vi.fn() }),
}));

// Mock child components
vi.mock('@/components/ColumnSelector.vue', () => ({
	default: { name: 'ColumnSelector', template: '<div />' },
}));
vi.mock('@/components/EditParticipantForm.vue', () => ({
	default: { name: 'EditParticipantForm', template: '<div />' },
}));
vi.mock('@/components/FilterDialog.vue', () => ({
	default: { name: 'FilterDialog', template: '<div />' },
}));
vi.mock('@/components/ImportParticipantsModal.vue', () => ({
	default: { name: 'ImportParticipantsModal', template: '<div />' },
}));
vi.mock('@/components/ExportParticipantsModal.vue', () => ({
	default: { name: 'ExportParticipantsModal', template: '<div />' },
}));
vi.mock('@/components/MessageDialog.vue', () => ({
	default: { name: 'MessageDialog', template: '<div />' },
}));
vi.mock('@/components/BulkEditParticipantsModal.vue', () => ({
	default: { name: 'BulkEditParticipantsModal', template: '<div />' },
}));
vi.mock('@/components/TagBadge.vue', () => ({
	default: { name: 'TagBadge', template: '<span />' },
}));

import BagsReportView from '../BagsReportView.vue';
import { useRetreatStore } from '@/stores/retreatStore';
import { useParticipantStore } from '@/stores/participantStore';

function createWalker(overrides: any = {}) {
	return {
		id: `walker-${Math.random().toString(36).slice(2, 8)}`,
		firstName: 'Test',
		lastName: 'Walker',
		type: 'walker',
		tshirtSize: 'M',
		tableMesa: null,
		id_on_retreat: 1,
		...overrides,
	};
}

function mountBagsReport(participants: any[] = []) {
	const pinia = createPinia();
	setActivePinia(pinia);

	const retreatStore = useRetreatStore(pinia);
	retreatStore.retreats = [
		{
			id: 'retreat-1',
			name: 'Test Retreat',
			startDate: '2026-04-17',
			endDate: '2026-04-19',
		} as any,
	];
	retreatStore.selectedRetreatId = 'retreat-1';

	const participantStore = useParticipantStore(pinia);
	participantStore.participants = participants;
	participantStore.fetchParticipants = vi.fn().mockResolvedValue(participants);

	return mount(BagsReportView, {
		global: {
			plugins: [pinia],
			stubs: {
				teleport: { template: '<div><slot /></div>' },
			},
		},
	});
}

describe('BagsReportView', () => {
	afterEach(() => {
		cleanupMocks();
	});

	describe('Checklist rendering', () => {
		it('renders the checklist header', () => {
			const wrapper = mountBagsReport();
			expect(wrapper.text()).toContain('Checklist para las bolsas');
		});

		it('renders all 5 checklist items', () => {
			const wrapper = mountBagsReport();
			expect(wrapper.text()).toContain('Agua bendita');
			expect(wrapper.text()).toContain('Playera');
			expect(wrapper.text()).toContain('Celulares');
			expect(wrapper.text()).toContain('Palancas');
			expect(wrapper.text()).toContain('Invitación para otro retiro');
		});

		it('shows progress as 0/5 initially', () => {
			const wrapper = mountBagsReport();
			expect(wrapper.text()).toContain('0/5');
		});

		it('shows 0% progress initially', () => {
			const wrapper = mountBagsReport();
			expect(wrapper.text()).toContain('0%');
		});
	});

	describe('Checklist interaction', () => {
		it('toggles a checklist item when checkbox is clicked', async () => {
			const wrapper = mountBagsReport();
			const checkboxes = wrapper.findAll('[role="checkbox"]');
			expect(checkboxes.length).toBe(5);

			// Click the first checkbox
			await checkboxes[0].trigger('click');
			await nextTick();

			expect(wrapper.text()).toContain('1/5');
		});

		it('updates progress percentage when items are checked', async () => {
			const wrapper = mountBagsReport();
			const checkboxes = wrapper.findAll('[role="checkbox"]');

			// Check 2 items
			await checkboxes[0].trigger('click');
			await checkboxes[1].trigger('click');
			await nextTick();

			expect(wrapper.text()).toContain('2/5');
			expect(wrapper.text()).toContain('40%');
		});

		it('applies strikethrough class to checked items', async () => {
			const wrapper = mountBagsReport();
			const checkboxes = wrapper.findAll('[role="checkbox"]');

			await checkboxes[0].trigger('click');
			await nextTick();

			const labels = wrapper.findAll('label');
			const firstLabel = labels[0];
			expect(firstLabel.classes()).toContain('bg-green-50');
		});

		it('unchecks a previously checked item', async () => {
			const wrapper = mountBagsReport();
			const checkboxes = wrapper.findAll('[role="checkbox"]');

			// Check then uncheck
			await checkboxes[0].trigger('click');
			await nextTick();
			expect(wrapper.text()).toContain('1/5');

			await checkboxes[0].trigger('click');
			await nextTick();
			expect(wrapper.text()).toContain('0/5');
		});

		it('shows 100% when all items are checked', async () => {
			const wrapper = mountBagsReport();
			const checkboxes = wrapper.findAll('[role="checkbox"]');

			for (const cb of checkboxes) {
				await cb.trigger('click');
			}
			await nextTick();

			expect(wrapper.text()).toContain('5/5');
			expect(wrapper.text()).toContain('100%');
		});
	});

	describe('Collapse/expand', () => {
		it('hides checklist items when header is clicked', async () => {
			const wrapper = mountBagsReport();
			expect(wrapper.text()).toContain('Agua bendita');

			// Click the header area to collapse
			const header = wrapper.find('.cursor-pointer');
			await header.trigger('click');
			await nextTick();

			expect(wrapper.text()).not.toContain('Agua bendita');
		});

		it('shows checklist items again when header is clicked twice', async () => {
			const wrapper = mountBagsReport();
			const header = wrapper.find('.cursor-pointer');

			await header.trigger('click');
			await nextTick();
			expect(wrapper.text()).not.toContain('Agua bendita');

			await header.trigger('click');
			await nextTick();
			expect(wrapper.text()).toContain('Agua bendita');
		});
	});

	describe('T-shirt size summary', () => {
		it('shows size summary cards when participants have sizes', () => {
			const participants = [
				createWalker({ tshirtSize: 'M', id_on_retreat: 1 }),
				createWalker({ tshirtSize: 'M', id_on_retreat: 2 }),
				createWalker({ tshirtSize: 'G', id_on_retreat: 3 }),
				createWalker({ tshirtSize: 'X', id_on_retreat: 4 }),
			];
			const wrapper = mountBagsReport(participants);

			// Should show size labels
			expect(wrapper.text()).toContain('M');
			expect(wrapper.text()).toContain('L'); // G maps to L
			expect(wrapper.text()).toContain('XL'); // X maps to XL
		});

		it('shows correct count per size', () => {
			const participants = [
				createWalker({ tshirtSize: 'M', id_on_retreat: 1 }),
				createWalker({ tshirtSize: 'M', id_on_retreat: 2 }),
				createWalker({ tshirtSize: 'M', id_on_retreat: 3 }),
				createWalker({ tshirtSize: 'G', id_on_retreat: 4 }),
			];
			const wrapper = mountBagsReport(participants);

			// Find the size summary section - M should have count 3
			const sizeCards = wrapper.findAll('.rounded-xl');
			const cardTexts = sizeCards.map(c => c.text());

			// At least one card should contain "3" (for M size)
			expect(cardTexts.some(t => t.includes('3'))).toBe(true);
		});

		it('shows total walker count', () => {
			const participants = [
				createWalker({ id_on_retreat: 1 }),
				createWalker({ id_on_retreat: 2 }),
				createWalker({ id_on_retreat: 3 }),
			];
			const wrapper = mountBagsReport(participants);

			// Total card should show 3
			const totalCard = wrapper.find('.bg-indigo-600');
			expect(totalCard.exists()).toBe(true);
			expect(totalCard.text()).toContain('3');
		});

		it('shows "Sin talla" card for participants without size', () => {
			const participants = [
				createWalker({ tshirtSize: 'M', id_on_retreat: 1 }),
				createWalker({ tshirtSize: null, id_on_retreat: 2 }),
				createWalker({ tshirtSize: '', id_on_retreat: 3 }),
			];
			const wrapper = mountBagsReport(participants);

			expect(wrapper.text()).toContain('Sin talla');
		});

		it('does not show size summary when no participants', () => {
			const wrapper = mountBagsReport([]);
			const totalCard = wrapper.find('.bg-indigo-600');
			expect(totalCard.exists()).toBe(false);
		});

		it('handles XXL size correctly', () => {
			const participants = [
				createWalker({ tshirtSize: '2', id_on_retreat: 1 }),
			];
			const wrapper = mountBagsReport(participants);
			expect(wrapper.text()).toContain('XXL');
		});

		it('excludes non-walker participants from summary', () => {
			const participants = [
				createWalker({ tshirtSize: 'M', id_on_retreat: 1 }),
				{ ...createWalker({ tshirtSize: 'G', id_on_retreat: 2 }), type: 'server' },
			];
			const wrapper = mountBagsReport(participants);

			const totalCard = wrapper.find('.bg-indigo-600');
			expect(totalCard.text()).toContain('1');
		});
	});

	describe('Print functionality', () => {
		it('calls window.print when print button is clicked', async () => {
			const printSpy = vi.spyOn(window, 'print').mockImplementation(() => {});
			const wrapper = mountBagsReport();

			const printButton = wrapper.find('[title="Imprimir"]');
			expect(printButton.exists()).toBe(true);

			await printButton.trigger('click');
			expect(printSpy).toHaveBeenCalled();

			printSpy.mockRestore();
		});
	});

	describe('ParticipantList integration', () => {
		it('renders ParticipantList component', () => {
			const wrapper = mountBagsReport();
			const participantList = wrapper.findComponent({ name: 'ParticipantList' });
			expect(participantList.exists()).toBe(true);
		});

		it('passes walker type to ParticipantList', () => {
			const wrapper = mountBagsReport();
			const participantList = wrapper.findComponent({ name: 'ParticipantList' });
			expect(participantList.props('type')).toBe('walker');
		});

		it('passes correct columns to ParticipantList', () => {
			const wrapper = mountBagsReport();
			const participantList = wrapper.findComponent({ name: 'ParticipantList' });
			const expectedColumns = ['id_on_retreat', 'firstName', 'lastName', 'tableMesa.name', 'tshirtSize'];
			expect(participantList.props('columnsToShowInTable')).toEqual(expectedColumns);
		});
	});

	describe('Data loading', () => {
		it('fetches retreats if none loaded', async () => {
			const pinia = createPinia();
			setActivePinia(pinia);

			const retreatStore = useRetreatStore(pinia);
			retreatStore.retreats = [];
			retreatStore.fetchRetreats = vi.fn().mockResolvedValue([]);

			const participantStore = useParticipantStore(pinia);
			participantStore.fetchParticipants = vi.fn().mockResolvedValue([]);

			mount(BagsReportView, {
				global: {
					plugins: [pinia],
					stubs: { teleport: { template: '<div><slot /></div>' } },
				},
			});

			await nextTick();
			expect(retreatStore.fetchRetreats).toHaveBeenCalled();
		});

		it('fetches participants when retreat is selected', async () => {
			const pinia = createPinia();
			setActivePinia(pinia);

			const retreatStore = useRetreatStore(pinia);
			retreatStore.retreats = [{ id: 'r1', name: 'Test' } as any];
			retreatStore.selectedRetreatId = 'r1';
			retreatStore.fetchRetreats = vi.fn();

			const participantStore = useParticipantStore(pinia);
			participantStore.fetchParticipants = vi.fn().mockResolvedValue([]);

			mount(BagsReportView, {
				global: {
					plugins: [pinia],
					stubs: { teleport: { template: '<div><slot /></div>' } },
				},
			});

			await nextTick();
			await nextTick();
			expect(participantStore.fetchParticipants).toHaveBeenCalled();
		});
	});
});
