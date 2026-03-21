import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { VueWrapper } from '@vue/test-utils';
import { nextTick } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import RetreatRoleManagementView from '../RetreatRoleManagementView.vue';
import { createTestWrapper, cleanupMocks } from '@/test/utils';

// Mock axios
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
		get: vi.fn(),
		post: vi.fn(),
		put: vi.fn(),
		delete: vi.fn(),
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

// Mock API service
const mockApiGet = vi.fn();
const mockApiPost = vi.fn();
const mockApiPut = vi.fn();
const mockApiDelete = vi.fn();
const mockSearchUsers = vi.fn();

vi.mock('@/services/api', () => ({
	default: {
		get: (...args: any[]) => mockApiGet(...args),
		post: (...args: any[]) => mockApiPost(...args),
		put: (...args: any[]) => mockApiPut(...args),
		delete: (...args: any[]) => mockApiDelete(...args),
	},
	searchUsers: (...args: any[]) => mockSearchUsers(...args),
}));

// Mock vue-router
const mockPush = vi.fn();
vi.mock('vue-router', () => ({
	useRouter: () => ({
		push: mockPush,
		replace: vi.fn(),
		resolve: vi.fn(() => ({ href: '/test-route' })),
	}),
	useRoute: () => ({
		name: 'retreat-role-management',
		params: { id: 'retreat-123' },
		path: '/retreats/retreat-123/role-management',
	}),
}));

// Mock toast
const mockToast = vi.fn();

// Mock @repo/ui components
vi.mock('@repo/ui', () => ({
	Button: {
		template:
			'<button :disabled="disabled" :data-variant="variant" @click="$emit(\'click\')"><slot /></button>',
		props: ['variant', 'size', 'disabled'],
	},
	Badge: { template: '<span><slot /></span>', props: ['variant'] },
	Card: { template: '<div class="card-mock"><slot /></div>' },
	CardHeader: { template: '<div><slot /></div>' },
	CardTitle: { template: '<h2><slot /></h2>' },
	CardDescription: { template: '<p><slot /></p>' },
	CardContent: { template: '<div><slot /></div>' },
	Dialog: {
		template: '<div v-if="open" class="dialog-mock"><slot /></div>',
		props: ['open'],
		emits: ['update:open'],
	},
	DialogContent: { template: '<div class="dialog-content-mock"><slot /></div>' },
	DialogFooter: { template: '<div class="dialog-footer-mock"><slot /></div>' },
	DialogHeader: { template: '<div class="dialog-header-mock"><slot /></div>' },
	DialogTitle: { template: '<h2 class="dialog-title-mock"><slot /></h2>' },
	DialogDescription: { template: '<p class="dialog-description-mock"><slot /></p>' },
	Label: { template: '<label class="label-mock"><slot /></label>' },
	Input: {
		template:
			'<input :type="type" :placeholder="placeholder" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" class="input-mock" />',
		props: ['modelValue', 'type', 'placeholder', 'required', 'id'],
	},
	Select: {
		template: '<div class="select-mock"><slot /></div>',
		props: ['modelValue'],
		emits: ['update:modelValue'],
	},
	SelectTrigger: { template: '<div class="select-trigger-mock"><slot /></div>' },
	SelectValue: { template: '<span class="select-value-mock"><slot /></span>', props: ['placeholder'] },
	SelectContent: { template: '<div class="select-content-mock"><slot /></div>' },
	SelectGroup: { template: '<div class="select-group-mock"><slot /></div>' },
	SelectItem: {
		template: '<div class="select-item-mock" @click="$emit(\'select\')"><slot /></div>',
		props: ['value'],
	},
	Textarea: { template: '<textarea class="textarea-mock"></textarea>', props: ['modelValue'] },
	Switch: { template: '<div class="switch-mock"></div>', props: ['checked'] },
	Avatar: { template: '<div class="avatar-mock"><slot /></div>' },
	AvatarImage: { template: '<img class="avatar-image-mock" />', props: ['src'] },
	AvatarFallback: { template: '<span class="avatar-fallback-mock"><slot /></span>' },
	Command: {
		template: '<div class="command-mock"><slot /></div>',
		props: ['searchTerm', 'filterFunction'],
		emits: ['update:searchTerm'],
	},
	CommandInput: { template: '<input class="command-input-mock" />', props: ['placeholder'] },
	CommandList: { template: '<div class="command-list-mock"><slot /></div>' },
	CommandGroup: { template: '<div class="command-group-mock"><slot /></div>', props: ['heading'] },
	CommandItem: {
		template: '<div class="command-item-mock" @click="$emit(\'select\')"><slot /></div>',
		props: ['value'],
		emits: ['select'],
	},
	CommandEmpty: { template: '<div class="command-empty-mock"><slot /></div>' },
	useToast: () => ({ toast: mockToast }),
}));

// Mock lucide-vue-next icons
vi.mock('lucide-vue-next', () => ({
	UserPlus: { template: '<svg data-icon="UserPlus" />' },
	RefreshCw: { template: '<svg data-icon="RefreshCw" />' },
	UserCheck: { template: '<svg data-icon="UserCheck" />' },
	Users: { template: '<svg data-icon="Users" />' },
	Check: { template: '<svg data-icon="Check" />' },
	X: { template: '<svg data-icon="X" />' },
	Clock: { template: '<svg data-icon="Clock" />' },
	Shield: { template: '<svg data-icon="Shield" />' },
	Settings: { template: '<svg data-icon="Settings" />' },
	UserMinus: { template: '<svg data-icon="UserMinus" />' },
	Plus: { template: '<svg data-icon="Plus" />' },
	Search: { template: '<svg data-icon="Search" />' },
	Calendar: { template: '<svg data-icon="Calendar" />' },
	Mail: { template: '<svg data-icon="Mail" />' },
	ShieldPlus: { template: '<svg data-icon="ShieldPlus" />' },
}));

// Mock InviteUsersModal
vi.mock('@/components/InviteUsersModal.vue', () => ({
	default: {
		template: '<div class="invite-modal-mock" />',
		props: ['isOpen', 'retreatId'],
		emits: ['close', 'invited'],
	},
}));

// Mock authStore
vi.mock('@/stores/authStore', () => ({
	useAuthStore: () => ({
		user: { id: 'current-user-id' },
	}),
}));

// Mock retreatStore
const mockSelectedRetreatId = { value: 'retreat-123' };
const mockSelectedRetreat = {
	value: {
		id: 'retreat-123',
		createdBy: 'current-user-id',
	} as any,
};
vi.mock('@/stores/retreatStore', () => ({
	useRetreatStore: () => ({
		get selectedRetreatId() {
			return mockSelectedRetreatId.value;
		},
		get selectedRetreat() {
			return mockSelectedRetreat.value;
		},
	}),
}));

// Mock @repo/utils
vi.mock('@repo/utils', () => ({
	formatDate: vi.fn((d: string) => d),
}));

// Mock @repo/types (just needs to exist for type imports)
vi.mock('@repo/types', () => ({}));

describe('RetreatRoleManagementView - Quick Assign Dialog', () => {
	let wrapper: VueWrapper<any>;

	const mockRoles = [
		{ name: 'admin', description: 'Administrator' },
		{ name: 'treasurer', description: 'Treasurer' },
		{ name: 'logistics', description: 'Logistics' },
		{ name: 'communications', description: 'Communications' },
		{ name: 'regular_server', description: 'Regular Server' },
	];

	const mockUser = {
		id: 'user-1',
		displayName: 'Juan Pérez',
		email: 'juan@example.com',
		photo: null,
	};

	beforeEach(async () => {
		const pinia = createPinia();
		setActivePinia(pinia);

		// Reset retreat mock to default (current user is creator)
		mockSelectedRetreat.value = {
			id: 'retreat-123',
			createdBy: 'current-user-id',
		};

		// Default API responses for loadData
		mockApiGet.mockImplementation((url: string) => {
			if (url.includes('/users')) return Promise.resolve({ data: [] });
			if (url.includes('/role-requests/')) return Promise.resolve({ data: [] });
			if (url === '/retreat-roles/roles') return Promise.resolve({ data: mockRoles });
			return Promise.resolve({ data: [] });
		});

		wrapper = createTestWrapper(RetreatRoleManagementView, {
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
		vi.clearAllMocks();
	});

	describe('Button Rendering', () => {
		it('should render "Asignación Rápida" button instead of "Admin Rápido"', () => {
			const text = wrapper.text();
			expect(text).toContain('Asignación Rápida');
			expect(text).not.toContain('Admin Rápido');
		});

		it('should have ShieldPlus icon on the button', () => {
			const icon = wrapper.find('[data-icon="ShieldPlus"]');
			expect(icon.exists()).toBe(true);
		});
	});

	describe('Dialog Open/Close', () => {
		it('should not show dialog initially', () => {
			expect(wrapper.vm.quickAssignOpen).toBe(false);
		});

		it('should open dialog when button is clicked', async () => {
			// Find the Asignación Rápida button
			const buttons = wrapper.findAll('button');
			const quickAssignBtn = buttons.find((b) => b.text().includes('Asignación Rápida'));
			expect(quickAssignBtn).toBeDefined();

			await quickAssignBtn!.trigger('click');
			await nextTick();

			expect(wrapper.vm.quickAssignOpen).toBe(true);
		});

		it('should fetch roles when dialog opens', async () => {
			wrapper.vm.quickAssignOpen = true;
			await nextTick();

			// Wait for the watcher to fire and API to resolve
			await new Promise((r) => setTimeout(r, 50));

			expect(mockApiGet).toHaveBeenCalledWith('/retreat-roles/roles');
		});

		it('should reset state when dialog closes', async () => {
			// Open and set some state
			wrapper.vm.quickAssignOpen = true;
			await nextTick();

			wrapper.vm.quickSelectedUser = mockUser;
			wrapper.vm.quickSelectedRole = 'admin';
			wrapper.vm.quickSearchQuery = 'test';
			wrapper.vm.quickSearchResults = [mockUser];

			// Close dialog
			wrapper.vm.quickAssignOpen = false;
			await nextTick();

			expect(wrapper.vm.quickSelectedUser).toBeNull();
			expect(wrapper.vm.quickSelectedRole).toBe('');
			expect(wrapper.vm.quickSearchQuery).toBe('');
			expect(wrapper.vm.quickSearchResults).toEqual([]);
		});
	});

	describe('User Search', () => {
		it('should not search when query is less than 2 characters', async () => {
			wrapper.vm.quickSearchQuery = 'a';
			await nextTick();
			await new Promise((r) => setTimeout(r, 400));

			expect(mockSearchUsers).not.toHaveBeenCalled();
			expect(wrapper.vm.quickSearchResults).toEqual([]);
		});

		it('should search users with debounce when query is 2+ chars', async () => {
			mockSearchUsers.mockResolvedValue([{ user: mockUser }]);

			wrapper.vm.quickSearchQuery = 'ju';
			await nextTick();

			// Wait for debounce (300ms) + processing
			await new Promise((r) => setTimeout(r, 400));

			expect(mockSearchUsers).toHaveBeenCalledWith('ju');
			expect(wrapper.vm.quickSearchResults).toEqual([mockUser]);
		});

		it('should handle search errors gracefully', async () => {
			mockSearchUsers.mockRejectedValue(new Error('Network error'));

			wrapper.vm.quickSearchQuery = 'test';
			await nextTick();
			await new Promise((r) => setTimeout(r, 400));

			expect(wrapper.vm.quickSearchResults).toEqual([]);
		});

		it('should clear results when search query drops below 2 chars', async () => {
			// First set a valid query to populate results
			mockSearchUsers.mockResolvedValue([{ user: mockUser }]);
			wrapper.vm.quickSearchQuery = 'ju';
			await nextTick();
			await new Promise((r) => setTimeout(r, 400));

			expect(wrapper.vm.quickSearchResults).toEqual([mockUser]);

			// Now clear the query — watcher should clear results
			wrapper.vm.quickSearchQuery = '';
			await nextTick();

			expect(wrapper.vm.quickSearchResults).toEqual([]);
		});
	});

	describe('User Selection', () => {
		it('should set selected user when quickSelectUser is called', async () => {
			wrapper.vm.quickSelectUser(mockUser);
			await nextTick();

			expect(wrapper.vm.quickSelectedUser).toEqual(mockUser);
			expect(wrapper.vm.quickSearchQuery).toBe('');
			expect(wrapper.vm.quickSearchResults).toEqual([]);
		});

		it('should clear selected user when "Cambiar" is clicked', async () => {
			wrapper.vm.quickAssignOpen = true;
			wrapper.vm.quickSelectedUser = mockUser;
			wrapper.vm.quickSelectedRole = 'admin';
			await nextTick();

			// Reset user (simulates clicking "Cambiar")
			wrapper.vm.quickSelectedUser = null;
			wrapper.vm.quickSelectedRole = '';
			await nextTick();

			expect(wrapper.vm.quickSelectedUser).toBeNull();
			expect(wrapper.vm.quickSelectedRole).toBe('');
		});
	});

	describe('Role Selection', () => {
		it('should cache roles after first fetch', async () => {
			wrapper.vm.quickAssignOpen = true;
			await nextTick();
			await new Promise((r) => setTimeout(r, 50));

			const callCount = mockApiGet.mock.calls.filter(
				(c: any[]) => c[0] === '/retreat-roles/roles'
			).length;

			// Close and reopen
			wrapper.vm.quickAssignOpen = false;
			await nextTick();
			wrapper.vm.quickAssignOpen = true;
			await nextTick();
			await new Promise((r) => setTimeout(r, 50));

			const newCallCount = mockApiGet.mock.calls.filter(
				(c: any[]) => c[0] === '/retreat-roles/roles'
			).length;

			// Should not have fetched again since roles are cached
			expect(newCallCount).toBe(callCount);
		});

		it('should handle role fetch error gracefully', async () => {
			mockApiGet.mockImplementation((url: string) => {
				if (url === '/retreat-roles/roles') return Promise.reject(new Error('Failed'));
				return Promise.resolve({ data: [] });
			});

			// Clear any cached roles
			wrapper.vm.quickAvailableRoles = [];
			await wrapper.vm.fetchQuickRoles();

			expect(wrapper.vm.quickAvailableRoles).toEqual([]);
		});
	});

	describe('Confirm Assignment', () => {
		it('should not submit when no user is selected', async () => {
			wrapper.vm.quickSelectedRole = 'admin';
			await wrapper.vm.confirmQuickAssign();

			expect(mockApiPost).not.toHaveBeenCalled();
		});

		it('should not submit when no role is selected', async () => {
			wrapper.vm.quickSelectedUser = mockUser;
			await wrapper.vm.confirmQuickAssign();

			expect(mockApiPost).not.toHaveBeenCalled();
		});

		it('should not submit while loading', async () => {
			wrapper.vm.quickSelectedUser = mockUser;
			wrapper.vm.quickSelectedRole = 'admin';
			wrapper.vm.quickAddLoading = true;
			await wrapper.vm.confirmQuickAssign();

			expect(mockApiPost).not.toHaveBeenCalled();
		});

		it('should POST with correct email and roleName', async () => {
			mockApiPost.mockResolvedValue({ data: { success: true } });

			wrapper.vm.quickSelectedUser = mockUser;
			wrapper.vm.quickSelectedRole = 'treasurer';
			await wrapper.vm.confirmQuickAssign();

			expect(mockApiPost).toHaveBeenCalledWith('/retreat-roles/retreat-123/invite', {
				email: 'juan@example.com',
				roleName: 'treasurer',
			});
		});

		it('should show success toast with role display name', async () => {
			mockApiPost.mockResolvedValue({ data: { success: true } });

			wrapper.vm.quickSelectedUser = mockUser;
			wrapper.vm.quickSelectedRole = 'treasurer';
			await wrapper.vm.confirmQuickAssign();

			expect(mockToast).toHaveBeenCalledWith({
				title: 'Rol asignado',
				description: 'Juan Pérez ha sido agregado como Tesorero',
			});
		});

		it('should close dialog after successful assignment', async () => {
			mockApiPost.mockResolvedValue({ data: { success: true } });

			wrapper.vm.quickAssignOpen = true;
			wrapper.vm.quickSelectedUser = mockUser;
			wrapper.vm.quickSelectedRole = 'admin';
			await wrapper.vm.confirmQuickAssign();

			expect(wrapper.vm.quickAssignOpen).toBe(false);
		});

		it('should reload data after successful assignment', async () => {
			mockApiPost.mockResolvedValue({ data: { success: true } });
			mockApiGet.mockClear();

			wrapper.vm.quickSelectedUser = mockUser;
			wrapper.vm.quickSelectedRole = 'admin';
			await wrapper.vm.confirmQuickAssign();

			// loadData should have been called (fetches users and requests)
			const usersCalls = mockApiGet.mock.calls.filter((c: any[]) =>
				c[0].includes('/retreat-roles/retreat/')
			);
			expect(usersCalls.length).toBeGreaterThan(0);
		});

		it('should show error toast on API failure', async () => {
			mockApiPost.mockRejectedValue({
				response: { data: { error: 'User already has a role' } },
			});

			wrapper.vm.quickSelectedUser = mockUser;
			wrapper.vm.quickSelectedRole = 'admin';
			await wrapper.vm.confirmQuickAssign();

			expect(mockToast).toHaveBeenCalledWith({
				title: 'Error',
				description: 'User already has a role',
				variant: 'destructive',
			});
		});

		it('should show fallback error message when no specific error', async () => {
			mockApiPost.mockRejectedValue(new Error('Network error'));

			wrapper.vm.quickSelectedUser = mockUser;
			wrapper.vm.quickSelectedRole = 'admin';
			await wrapper.vm.confirmQuickAssign();

			expect(mockToast).toHaveBeenCalledWith({
				title: 'Error',
				description: 'No se pudo asignar el rol',
				variant: 'destructive',
			});
		});

		it('should reset loading state after success', async () => {
			mockApiPost.mockResolvedValue({ data: { success: true } });

			wrapper.vm.quickSelectedUser = mockUser;
			wrapper.vm.quickSelectedRole = 'admin';
			await wrapper.vm.confirmQuickAssign();

			expect(wrapper.vm.quickAddLoading).toBe(false);
		});

		it('should reset loading state after failure', async () => {
			mockApiPost.mockRejectedValue(new Error('fail'));

			wrapper.vm.quickSelectedUser = mockUser;
			wrapper.vm.quickSelectedRole = 'admin';
			await wrapper.vm.confirmQuickAssign();

			expect(wrapper.vm.quickAddLoading).toBe(false);
		});
	});

	describe('Role Display Names', () => {
		it('should display correct Spanish name for each role', () => {
			const expectations: Record<string, string> = {
				admin: 'Administrador',
				treasurer: 'Tesorero',
				logistics: 'Logística',
				communications: 'Comunicaciones',
				regular_server: 'Servidor',
				coordinator: 'Coordinador',
				viewer: 'Observador',
				superadmin: 'Superadministrador',
			};

			for (const [key, expected] of Object.entries(expectations)) {
				expect(wrapper.vm.getRoleDisplayName(key)).toBe(expected);
			}
		});

		it('should return raw role name for unknown roles', () => {
			expect(wrapper.vm.getRoleDisplayName('custom_role')).toBe('custom_role');
		});
	});

	describe('Dialog Content - Step 1 (Search)', () => {
		it('should show search when no user is selected', async () => {
			wrapper.vm.quickAssignOpen = true;
			wrapper.vm.quickSelectedUser = null;
			await nextTick();

			// Command component should be visible (search step)
			const dialog = wrapper.find('.dialog-mock');
			if (dialog.exists()) {
				expect(dialog.find('.command-mock').exists()).toBe(true);
			}
		});
	});

	describe('Dialog Content - Step 2 (User + Role)', () => {
		it('should show user card when user is selected', async () => {
			wrapper.vm.quickAssignOpen = true;
			wrapper.vm.quickSelectedUser = mockUser;
			await nextTick();

			// Command search should NOT be visible (we're on step 2)
			// The avatar fallback should show initials
			const text = wrapper.text();
			expect(text).toContain('Juan Pérez');
			expect(text).toContain('juan@example.com');
		});

		it('should show role selector when user is selected', async () => {
			wrapper.vm.quickAssignOpen = true;
			wrapper.vm.quickSelectedUser = mockUser;
			await nextTick();

			const text = wrapper.text();
			expect(text).toContain('Rol a asignar');
		});

		it('should show "Cambiar" button in user card', async () => {
			wrapper.vm.quickAssignOpen = true;
			wrapper.vm.quickSelectedUser = mockUser;
			await nextTick();

			const text = wrapper.text();
			expect(text).toContain('Cambiar');
		});
	});

	describe('isRetreatCreator', () => {
		it('should be true when current user is the retreat creator', async () => {
			// Default mock has createdBy: 'current-user-id' matching authStore user
			expect(wrapper.vm.isRetreatCreator).toBe(true);
		});

		it('should be false when current user is NOT the retreat creator', async () => {
			// Must set mock before mounting to get correct initial computed value
			mockSelectedRetreat.value = {
				id: 'retreat-123',
				createdBy: 'other-user-id',
			};

			const localWrapper = createTestWrapper(RetreatRoleManagementView, {
				global: { mocks: { $t: (key: string) => key } },
			});
			await nextTick();

			expect(localWrapper.vm.isRetreatCreator).toBe(false);
			localWrapper.unmount();
		});

		it('should be false when no retreat is selected', async () => {
			mockSelectedRetreat.value = null;

			const localWrapper = createTestWrapper(RetreatRoleManagementView, {
				global: { mocks: { $t: (key: string) => key } },
			});
			await nextTick();

			expect(localWrapper.vm.isRetreatCreator).toBe(false);
			localWrapper.unmount();
		});

		it('should disable invite and quick assign buttons when not creator', async () => {
			mockSelectedRetreat.value = {
				id: 'retreat-123',
				createdBy: 'other-user-id',
			};

			const localWrapper = createTestWrapper(RetreatRoleManagementView, {
				global: { mocks: { $t: (key: string) => key } },
			});
			await nextTick();

			const buttons = localWrapper.findAll('button');
			const inviteBtn = buttons.find((b) => b.text().includes('Invitar Usuario'));
			const quickAssignBtn = buttons.find((b) => b.text().includes('Asignación Rápida'));

			expect(inviteBtn?.attributes('disabled')).toBeDefined();
			expect(quickAssignBtn?.attributes('disabled')).toBeDefined();
			localWrapper.unmount();
		});

		it('should enable invite and quick assign buttons when user is creator', async () => {
			// Default mock already has createdBy: 'current-user-id'
			const buttons = wrapper.findAll('button');
			const inviteBtn = buttons.find((b) => b.text().includes('Invitar Usuario'));
			const quickAssignBtn = buttons.find((b) => b.text().includes('Asignación Rápida'));

			expect(inviteBtn?.attributes('disabled')).toBeUndefined();
			expect(quickAssignBtn?.attributes('disabled')).toBeUndefined();
		});
	});

	describe('Full Flow Integration', () => {
		it('should complete the full assignment flow', async () => {
			mockSearchUsers.mockResolvedValue([{ user: mockUser }]);
			mockApiPost.mockResolvedValue({ data: { success: true } });

			// Step 1: Open dialog
			wrapper.vm.quickAssignOpen = true;
			await nextTick();
			await new Promise((r) => setTimeout(r, 50));

			// Step 2: Search for user
			wrapper.vm.quickSearchQuery = 'juan';
			await nextTick();
			await new Promise((r) => setTimeout(r, 400));

			expect(wrapper.vm.quickSearchResults).toEqual([mockUser]);

			// Step 3: Select user
			wrapper.vm.quickSelectUser(mockUser);
			await nextTick();

			expect(wrapper.vm.quickSelectedUser).toEqual(mockUser);

			// Step 4: Select role
			wrapper.vm.quickSelectedRole = 'logistics';
			await nextTick();

			// Step 5: Confirm
			await wrapper.vm.confirmQuickAssign();

			expect(mockApiPost).toHaveBeenCalledWith('/retreat-roles/retreat-123/invite', {
				email: 'juan@example.com',
				roleName: 'logistics',
			});

			expect(mockToast).toHaveBeenCalledWith({
				title: 'Rol asignado',
				description: 'Juan Pérez ha sido agregado como Logística',
			});

			expect(wrapper.vm.quickAssignOpen).toBe(false);
		});
	});
});
