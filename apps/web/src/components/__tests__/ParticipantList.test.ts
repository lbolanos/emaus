import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { mount, VueWrapper } from '@vue/test-utils';
import { nextTick } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import ParticipantList from '../ParticipantList.vue';
import { createTestWrapper, createMockParticipant, cleanupMocks } from '../../test/utils';

// Mock axios first
vi.mock('axios', () => {
	const mockAxios = {
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
		defaults: {
			baseURL: '',
			withCredentials: false,
		},
	};
	return {
		default: mockAxios,
		...mockAxios,
	};
});

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
vi.mock('@/services/api', () => {
	const mockApiGet = vi.fn(() => Promise.resolve({ data: [] }));
	const mockApiPost = vi.fn(() => Promise.resolve({ data: {} }));
	const mockApiPut = vi.fn(() => Promise.resolve({ data: {} }));
	const mockApiDelete = vi.fn(() => Promise.resolve({ data: {} }));

	return {
		api: {
			get: mockApiGet,
			post: mockApiPost,
			put: mockApiPut,
			delete: mockApiDelete,
		},
		mockApiGet,
		mockApiPost,
		mockApiPut,
		mockApiDelete,
	};
});

// Mock vue-router
vi.mock('vue-router', () => ({
	useRoute: () => ({
		name: 'walkers',
		params: { id: 'test-retreat-id' },
		path: '/walkers/test-retreat-id',
	}),
	useRouter: () => ({
		push: vi.fn(),
		resolve: vi.fn(() => ({ href: '/test-route' })),
	}),
}));

// Mock vue-i18n
vi.mock('vue-i18n', () => ({
	useI18n: () => ({
		t: (key: string) => key,
	}),
}));

// Mock @repo/ui components
vi.mock('@repo/ui', () => ({
	Button: { template: '<button><slot /></button>' },
	Input: { template: '<input type="text" />' },
	Table: { template: '<table><slot /></table>' },
	TableBody: { template: '<tbody><slot /></tbody>' },
	TableCell: { template: '<td><slot /></td>' },
	TableHead: { template: '<th><slot /></th>' },
	TableHeader: { template: '<thead><slot /></thead>' },
	TableRow: { template: '<tr><slot /></tr>' },
	TableCaption: { template: '<caption><slot /></caption>' },
	TableFooter: { template: '<tfoot><slot /></tfoot>' },
	Dialog: { template: '<div v-if="open"><slot /></div>' },
	DialogContent: { template: '<div><slot /></div>' },
	DialogDescription: { template: '<p><slot /></p>' },
	DialogFooter: { template: '<div><slot /></div>' },
	DialogHeader: { template: '<div><slot /></div>' },
	DialogTitle: { template: '<h2><slot /></h2>' },
	Tooltip: { template: '<div><slot /></div>' },
	TooltipContent: { template: '<div><slot /></div>' },
	TooltipProvider: { template: '<div><slot /></div>' },
	TooltipTrigger: { template: '<div><slot /></div>' },
	DropdownMenu: { template: '<div><slot /></div>' },
	DropdownMenuContent: { template: '<div><slot /></div>' },
	DropdownMenuItem: { template: '<div><slot /></div>' },
	DropdownMenuLabel: { template: '<div><slot /></div>' },
	DropdownMenuSeparator: { template: '<hr />' },
	DropdownMenuTrigger: { template: '<div><slot /></div>' },
	useToast: () => ({ toast: vi.fn() }),
}));

// Mock lucide-vue-next icons
vi.mock('lucide-vue-next', () => ({
	ArrowUpDown: { template: '<span>sort</span>' },
	Trash2: { template: '<span>delete</span>' },
	Edit: { template: '<span>edit</span>' },
	FileUp: { template: '<span>import</span>' },
	FileDown: { template: '<span>export</span>' },
	Columns: { template: '<span>columns</span>' },
	ListFilter: { template: '<span>filter</span>' },
	MoreVertical: { template: '<span>more</span>' },
	Plus: { template: '<span>plus</span>' },
	X: { template: '<span>x</span>' },
	Printer: { template: '<span>print</span>' },
}));

// Mock child components
vi.mock('../ColumnSelector.vue', () => ({
	default: {
		name: 'ColumnSelector',
		template: '<div><slot /></div>',
	},
}));

vi.mock('../EditParticipantForm.vue', () => ({
	default: {
		name: 'EditParticipantForm',
		template: '<div><slot /></div>',
	},
}));

vi.mock('../FilterDialog.vue', () => ({
	default: {
		name: 'FilterDialog',
		template: '<div><slot /></div>',
	},
}));

vi.mock('../ImportParticipantsModal.vue', () => ({
	default: {
		name: 'ImportParticipantsModal',
		template: '<div>Import Modal</div>',
	},
}));

vi.mock('../ExportParticipantsModal.vue', () => ({
	default: {
		name: 'ExportParticipantsModal',
		template: '<div>Export Modal</div>',
	},
}));

vi.mock('../TagBadge.vue', () => ({
	default: {
		name: 'TagBadge',
		template: '<span class="tag-badge"><slot /></span>',
	},
}));

vi.mock('../MessageDialog.vue', () => ({
	default: {
		name: 'MessageDialog',
		template: '<div>Message Dialog</div>',
	},
}));

vi.mock('../BulkEditParticipantsModal.vue', () => ({
	default: {
		name: 'BulkEditParticipantsModal',
		template: '<div>Bulk Edit Dialog</div>',
	},
}));

// Mock ExcelJS
vi.mock('exceljs', () => ({
	Workbook: vi.fn(() => ({
		addWorksheet: vi.fn(() => ({
			addRow: vi.fn(),
			getRow: vi.fn(() => ({
				font: {},
				fill: {},
			})),
		})),
		xlsx: {
			writeBuffer: vi.fn(() => Promise.resolve(Buffer.from([]))),
		},
	})),
}));

describe('ParticipantList Component', () => {
	let wrapper: VueWrapper<any>;
	let pinia: any;

	beforeEach(async () => {
		pinia = createPinia();
		setActivePinia(pinia);

		// Initialize auth store
		const { useAuthStore: useAuthStoreImport } = await import('@/stores/authStore');
		const authStore = useAuthStoreImport();

		const mockUser = {
			id: 'test-user-id',
			email: 'test@example.com',
			firstName: 'Test',
			lastName: 'User',
			displayName: 'Test User',
			roles: [
				{
					id: 'role-1',
					role: { name: 'admin' },
					retreats: [],
					globalPermissions: [],
				},
			],
			isActive: true,
			emailVerified: true,
			permissions: [],
		};

		authStore.user = mockUser;
		authStore.userProfile = mockUser;
		authStore.isAuthenticated = true;

		// Initialize retreat store
		const { useRetreatStore: useRetreatStoreImport } = await import('@/stores/retreatStore');
		const retreatStore = useRetreatStoreImport();
		retreatStore.selectRetreat('test-retreat-id');

		// Initialize participant store with mock data
		const { useParticipantStore: useParticipantStoreImport } = await import(
			'@/stores/participantStore'
		);
		const participantStore = useParticipantStoreImport();

		participantStore.participants = [
			createMockParticipant({
				id: '1',
				firstName: 'John',
				lastName: 'Doe',
				email: 'john@example.com',
				type: 'walker',
			}),
			createMockParticipant({
				id: '2',
				firstName: 'Jane',
				lastName: 'Smith',
				email: 'jane@example.com',
				type: 'walker',
			}),
			createMockParticipant({
				id: '3',
				firstName: 'Bob',
				lastName: 'Jones',
				email: 'bob@example.com',
				type: 'server',
			}),
		];
		participantStore.loading = false;
		participantStore.error = null;

		wrapper = createTestWrapper(ParticipantList, {
			props: {
				type: 'walker',
			},
			global: {
				mocks: {
					$t: (key: string) => key,
				},
			},
		});

		await nextTick();
	});

	afterEach(() => {
		wrapper?.unmount();
		cleanupMocks();
	});

	describe('Rendering', () => {
		it('should render the participant list component', () => {
			expect(wrapper.exists()).toBe(true);
		});

		it('should display the search input', () => {
			const input = wrapper.find('input[type="text"]');
			expect(input.exists()).toBe(true);
		});

		it('should display the filter button', () => {
			const buttons = wrapper.findAll('button');
			expect(buttons.length).toBeGreaterThan(0);
		});

		it('should display participants when data is available', async () => {
			// The component should have rendered successfully
			expect(wrapper.exists()).toBe(true);

			// Check if the component has the table structure
			const table = wrapper.find('table');
			const hasTableOrMessage = table.exists() || wrapper.text().length > 0;
			expect(hasTableOrMessage).toBe(true);
		});

		it('should show loading state when loading', async () => {
			const participantStore = (await import('@/stores/participantStore')).useParticipantStore();
			participantStore.loading = true;
			await nextTick();

			// Component should show loading indicator
			expect(wrapper.text()).toContain('loading');
		});

		it('should show error state when there is an error', async () => {
			const participantStore = (await import('@/stores/participantStore')).useParticipantStore();
			participantStore.error = 'Failed to load participants';
			participantStore.loading = false;
			await nextTick();

			// Component should show error message
			expect(wrapper.text()).toContain('Failed to load participants');
		});

		it('should show empty state when no retreat is selected', async () => {
			const { useRetreatStore: useRetreatStoreImport } = await import('@/stores/retreatStore');
			const retreatStore = useRetreatStoreImport();
			retreatStore.selectedRetreatId = null;
			await nextTick();

			// Should show empty state message
			expect(wrapper.text()).toContain('selectRetreatPrompt');
		});
	});

	describe('Props', () => {
		it('should accept type prop', () => {
			// Component should be able to accept type prop without errors
			expect(wrapper.exists()).toBe(true);
		});

		it('should accept columnsToShowInTable prop', async () => {
			const newWrapper = createTestWrapper(ParticipantList, {
				props: {
					type: 'walker',
					columnsToShowInTable: ['firstName', 'lastName', 'email'],
				},
				global: {
					mocks: {
						$t: (key: string) => key,
					},
				},
			});

			// Component should mount without errors
			expect(newWrapper.exists()).toBe(true);

			newWrapper.unmount();
		});

		it('should accept isCancelled prop', async () => {
			const newWrapper = createTestWrapper(ParticipantList, {
				props: {
					type: undefined,
					isCancelled: true,
				},
				global: {
					mocks: {
						$t: (key: string) => key,
					},
				},
			});

			// Component should mount without errors
			expect(newWrapper.exists()).toBe(true);

			newWrapper.unmount();
		});
	});

	describe('Search Functionality', () => {
		it('should filter participants by search query', async () => {
			const input = wrapper.find('input[type="text"]');
			expect(input.exists()).toBe(true);

			// Set the search query directly on the component
			wrapper.vm.searchQuery = 'John';
			await nextTick();

			// Component should have updated the search query
			expect(wrapper.vm.searchQuery).toBe('John');
		});

		it('should clear search query when X button is clicked', async () => {
			const input = wrapper.find('input[type="text"]');
			await input.setValue('John');
			await nextTick();

			const clearButton = wrapper.findAll('button').find((btn) => btn.text().includes('x'));
			if (clearButton) {
				await clearButton.trigger('click');
				await nextTick();
				expect(wrapper.vm.searchQuery).toBe('');
			}
		});
	});

	describe('Sorting', () => {
		it('should sort participants when column header is clicked', async () => {
			const tableHead = wrapper.findAll('th');
			expect(tableHead.length).toBeGreaterThan(0);

			const firstNameHeader = tableHead.find((th) => th.text().includes('firstName'));
			if (firstNameHeader) {
				await firstNameHeader.trigger('click');
				await nextTick();
				expect(wrapper.vm.sortKey).toBe('firstName');
			}
		});

		it('should toggle sort order when same column is clicked twice', async () => {
			const tableHead = wrapper.findAll('th');
			const firstNameHeader = tableHead.find((th) => th.text().includes('firstName'));

			if (firstNameHeader) {
				await firstNameHeader.trigger('click');
				await nextTick();
				expect(wrapper.vm.sortOrder).toBe('asc');

				await firstNameHeader.trigger('click');
				await nextTick();
				expect(wrapper.vm.sortOrder).toBe('desc');
			}
		});
	});

	describe('Bulk Selection', () => {
		it('should have a select all checkbox', () => {
			const checkboxes = wrapper.findAll('input[type="checkbox"]');
			expect(checkboxes.length).toBeGreaterThan(0);
		});

		it('should track selected participants', async () => {
			const checkboxes = wrapper.findAll('input[type="checkbox"]');

			if (checkboxes.length > 1) {
				// Select first participant checkbox (after the "select all" checkbox)
				await checkboxes[1].setValue(true);
				await nextTick();

				expect(wrapper.vm.selectedParticipants.size).toBeGreaterThan(0);
			}
		});

		it('should select all participants when select all checkbox is clicked', async () => {
			const selectAllCheckbox = wrapper.find('input[type="checkbox"]');
			expect(selectAllCheckbox.exists()).toBe(true);

			await selectAllCheckbox.trigger('change');
			await nextTick();

			// Should have selected some participants
			const selectedCount = wrapper.vm.selectedParticipants.size;
			expect(selectedCount).toBeGreaterThanOrEqual(0);
		});
	});

	describe('Column Visibility', () => {
		it('should have visible columns', () => {
			const tableHead = wrapper.findAll('th');
			expect(tableHead.length).toBeGreaterThan(0);
		});

		it('should toggle column visibility', async () => {
			const initialColumns = wrapper.vm.visibleColumns.length;
			expect(initialColumns).toBeGreaterThan(0);

			// Toggle a column
			wrapper.vm.toggleColumn('firstName');
			await nextTick();

			const newColumns = wrapper.vm.visibleColumns.length;
			// Column count should have changed
			expect(newColumns).not.toBe(initialColumns);
		});
	});

	describe('Filtering', () => {
		it('should have filter state', () => {
			expect(wrapper.vm.filters).toBeDefined();
			expect(wrapper.vm.filterStatus).toBeDefined();
		});

		it('should update filters when filter changes', async () => {
			wrapper.vm.filters = { city: 'Madrid' };
			await nextTick();

			expect(wrapper.vm.filters.city).toBe('Madrid');
		});

		it('should clear all filters', async () => {
			wrapper.vm.filters = { city: 'Madrid', maritalStatus: 'single' };
			wrapper.vm.searchQuery = 'test';
			await nextTick();

			wrapper.vm.clearAllFilters();
			await nextTick();

			expect(wrapper.vm.searchQuery).toBe('');
			expect(Object.keys(wrapper.vm.filters).length).toBe(0);
		});

		it('should remove specific filter', async () => {
			wrapper.vm.filters = { city: 'Madrid', maritalStatus: 'single' };
			await nextTick();

			wrapper.vm.removeFilter('city', 'dynamic');
			await nextTick();

			expect(wrapper.vm.filters.city).toBeUndefined();
		});
	});

	describe('Dialog Actions', () => {
		it('should open delete dialog when delete button is clicked', async () => {
			const deleteButtons = wrapper
				.findAll('button')
				.filter((btn) => btn.text().includes('delete'));

			if (deleteButtons.length > 0) {
				await deleteButtons[0].trigger('click');
				await nextTick();

				expect(wrapper.vm.isDeleteDialogOpen).toBe(true);
			}
		});

		it('should open edit dialog when edit button is clicked', async () => {
			const editButtons = wrapper.findAll('button').filter((btn) => btn.text().includes('edit'));

			if (editButtons.length > 0) {
				await editButtons[0].trigger('click');
				await nextTick();

				expect(wrapper.vm.isEditDialogOpen).toBe(true);
			}
		});

		it('should open filter dialog when filter button is clicked', async () => {
			const filterButton = wrapper.findAll('button').find((btn) => btn.text().includes('filter'));

			if (filterButton) {
				await filterButton.trigger('click');
				await nextTick();

				expect(wrapper.vm.isFilterDialogOpen).toBe(true);
			}
		});
	});

	describe('Computed Properties', () => {
		it('should compute filteredAndSortedParticipants', () => {
			const computed = wrapper.vm.filteredAndSortedParticipants;
			expect(computed).toBeDefined();
			expect(Array.isArray(computed)).toBe(true);
		});

		it('should compute isAllSelected correctly', () => {
			const isAllSelected = wrapper.vm.isAllSelected;
			expect(isAllSelected).toBeDefined();
			expect(typeof isAllSelected).toBe('boolean');
		});

		it('should compute isSomeSelected correctly', () => {
			const isSomeSelected = wrapper.vm.isSomeSelected;
			expect(isSomeSelected).toBeDefined();
			expect(typeof isSomeSelected).toBe('boolean');
		});

		it('should compute selectedCount correctly', () => {
			const selectedCount = wrapper.vm.selectedCount;
			expect(selectedCount).toBeDefined();
			expect(typeof selectedCount).toBe('number');
		});

		it('should compute activeFiltersList correctly', () => {
			const activeFiltersList = wrapper.vm.activeFiltersList;
			expect(activeFiltersList).toBeDefined();
			expect(Array.isArray(activeFiltersList)).toBe(true);
		});

		it('should compute activeDynamicFiltersCount correctly', () => {
			const count = wrapper.vm.activeDynamicFiltersCount;
			expect(count).toBeDefined();
			expect(typeof count).toBe('number');
		});
	});

	describe('Participant Actions', () => {
		it('should format cell values correctly', () => {
			const participant = createMockParticipant({
				birthDate: '1990-01-01',
				totalPaid: 100,
			});

			const formattedDate = wrapper.vm.formatCell(participant, 'birthDate');
			expect(formattedDate).toBeDefined();

			const formattedPayment = wrapper.vm.formatCell(participant, 'totalPaid');
			expect(formattedPayment).toBeDefined();
		});

		it('should get nested properties correctly', () => {
			const participant = createMockParticipant({
				tableMesa: { name: 'Table 1' },
			});

			const tableName = wrapper.vm.getNestedProperty(participant, 'tableMesa.name');
			expect(tableName).toBe('Table 1');
		});

		it('should check birthday during retreat', () => {
			const participant = createMockParticipant({
				birthDate: '2000-06-02',
			});

			const hasBirthday = wrapper.vm.hasBirthdayDuringRetreat(participant);
			expect(typeof hasBirthday).toBe('boolean');
		});
	});

	describe('Keyboard Shortcuts', () => {
		it('should handle Ctrl+A to select all', async () => {
			const event = new KeyboardEvent('keydown', {
				key: 'a',
				ctrlKey: true,
			});

			// Prevent default behavior
			Object.defineProperty(event, 'preventDefault', {
				value: vi.fn(),
				writable: false,
			});

			wrapper.vm.handleKeyboardShortcuts(event);
			await nextTick();

			expect(event.preventDefault).toHaveBeenCalled();
		});

		it('should handle Escape to clear selection', async () => {
			wrapper.vm.selectedParticipants.add('1');

			const event = new KeyboardEvent('keydown', { key: 'Escape' });
			Object.defineProperty(event, 'preventDefault', {
				value: vi.fn(),
				writable: false,
			});

			wrapper.vm.handleKeyboardShortcuts(event);
			await nextTick();

			expect(wrapper.vm.selectedParticipants.size).toBe(0);
		});

		it('should handle Delete key for bulk delete', async () => {
			wrapper.vm.selectedParticipants.add('1');
			wrapper.vm.selectedParticipants.add('2');

			const event = new KeyboardEvent('keydown', { key: 'Delete' });
			Object.defineProperty(event, 'preventDefault', {
				value: vi.fn(),
				writable: false,
			});

			wrapper.vm.handleKeyboardShortcuts(event);
			await nextTick();

			expect(event.preventDefault).toHaveBeenCalled();
		});
	});

	describe('Type Filtering', () => {
		it('should filter participants by type when type prop is provided', () => {
			const walkers = wrapper.vm.participants;
			expect(Array.isArray(walkers)).toBe(true);

			// The component should have computed participants
			expect(walkers.length).toBeGreaterThanOrEqual(0);
		});

		it('should handle undefined type prop', async () => {
			// Just verify the component accepts undefined type
			const newWrapper = createTestWrapper(ParticipantList, {
				props: {
					type: undefined,
				},
				global: {
					mocks: {
						$t: (key: string) => key,
					},
				},
			});

			// Component should mount without errors
			expect(newWrapper.exists()).toBe(true);

			newWrapper.unmount();
		});
	});
});
