import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { VueWrapper } from '@vue/test-utils';
import { nextTick } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import InviteAdminModal from '../community/InviteAdminModal.vue';
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

// Mock searchUsers (modo "buscar usuario")
const mockSearchUsers = vi.fn();
vi.mock('@/services/api', () => ({
	searchUsers: (...args: any[]) => mockSearchUsers(...args),
}));

// Mock toast
const mockToast = vi.fn();

// Mock @repo/ui
vi.mock('@repo/ui', () => {
	const slot = (cls: string) => ({ template: `<div class="${cls}"><slot /></div>` });
	return {
	Button: {
		template:
			'<button :disabled="disabled" :data-variant="variant" :data-size="size"><slot /></button>',
		props: ['variant', 'size', 'disabled'],
	},
	Dialog: {
		template: '<div v-if="open" class="dialog-mock"><slot /></div>',
		props: ['open'],
		emits: ['update:open'],
	},
	DialogContent: slot('dialog-content-mock'),
	DialogFooter: slot('dialog-footer-mock'),
	DialogHeader: slot('dialog-header-mock'),
	DialogTitle: { template: '<h2 class="dialog-title-mock"><slot /></h2>' },
	Tabs: {
		template: '<div class="tabs-mock"><slot /></div>',
		props: ['modelValue'],
		emits: ['update:modelValue'],
	},
	TabsList: slot('tabs-list-mock'),
	TabsTrigger: { template: '<button class="tabs-trigger-mock"><slot /></button>', props: ['value'] },
	TabsContent: { template: '<div class="tabs-content-mock"><slot /></div>', props: ['value'] },
	Command: {
		template: '<div class="command-mock"><slot /></div>',
		props: ['searchTerm', 'filterFunction'],
		emits: ['update:searchTerm'],
	},
	CommandInput: { template: '<input class="command-input-mock" :placeholder="placeholder" />', props: ['placeholder'] },
	CommandList: slot('command-list-mock'),
	CommandGroup: slot('command-group-mock'),
	CommandItem: { template: '<div class="command-item-mock"><slot /></div>', props: ['value'] },
	CommandEmpty: slot('command-empty-mock'),
	Avatar: slot('avatar-mock'),
	AvatarImage: { template: '<img class="avatar-image-mock" :src="src" />', props: ['src'] },
	AvatarFallback: slot('avatar-fallback-mock'),
	Label: { template: '<label class="label-mock"><slot /></label>' },
	Input: {
		template:
			'<input :type="type" :placeholder="placeholder" :required="required" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" class="input-mock" />',
		props: ['modelValue', 'type', 'placeholder', 'required'],
	},
	useToast: () => ({ toast: mockToast }),
	};
});

// Mock lucide-vue-next icons
vi.mock('lucide-vue-next', () => ({
	Loader2: { template: '<div data-icon="Loader2" />' },
	Copy: { template: '<div data-icon="Copy" />' },
}));

// Mock community store
const mockInviteAdmin = vi.fn();
const mockAddAdmin = vi.fn();
vi.mock('@/stores/communityStore', () => ({
	useCommunityStore: () => ({
		inviteAdmin: mockInviteAdmin,
		addAdmin: mockAddAdmin,
	}),
}));

describe('InviteAdminModal Component', () => {
	let wrapper: VueWrapper<any>;
	let pinia: any;

	const createWrapper = async (props = {}) => {
		pinia = createPinia();
		setActivePinia(pinia);

		const wrapper = createTestWrapper(InviteAdminModal, {
			props: {},
			global: {
				mocks: {
					$t: (key: string) => key,
				},
			},
		});

		await wrapper.setProps({ open: true, communityId: 'test-community-id', ...props });
		await nextTick();

		return wrapper;
	};

	beforeEach(async () => {
		wrapper = await createWrapper();
		await nextTick();
	});

	afterEach(() => {
		wrapper?.unmount();
		cleanupMocks();
		vi.clearAllMocks();
	});

	describe('Modal Rendering', () => {
		it('should render when open prop is true', async () => {
			expect(wrapper.exists()).toBe(true);
		});

		it('should have proper title', () => {
			expect(wrapper.text()).toContain('community.admin.invite');
		});

		it('should render both tabs (search + link)', () => {
			expect(wrapper.text()).toContain('community.admin.tabSearch');
			expect(wrapper.text()).toContain('community.admin.tabLink');
		});

		it('should default to the search tab', () => {
			expect(wrapper.vm.activeTab).toBe('search');
		});
	});

	describe('Search mode (acceso inmediato)', () => {
		it('should not search when query has fewer than 2 chars', async () => {
			wrapper.vm.searchQuery = 'a';
			await nextTick();
			await new Promise((r) => setTimeout(r, 350));
			expect(mockSearchUsers).not.toHaveBeenCalled();
			expect(wrapper.vm.searchResults).toEqual([]);
		});

		it('should query searchUsers and map .user when query >= 2 chars', async () => {
			mockSearchUsers.mockResolvedValue([
				{ user: { id: 'u1', displayName: 'Ana', email: 'ana@example.com' } },
			]);
			wrapper.vm.searchQuery = 'an';
			await nextTick();
			await new Promise((r) => setTimeout(r, 350));
			expect(mockSearchUsers).toHaveBeenCalledWith('an');
			expect(wrapper.vm.searchResults).toEqual([
				{ id: 'u1', displayName: 'Ana', email: 'ana@example.com' },
			]);
		});

		it('selectUser should set the selected user and clear the search', () => {
			wrapper.vm.searchResults = [{ id: 'u1', displayName: 'Ana', email: 'ana@example.com' }];
			wrapper.vm.searchQuery = 'an';
			wrapper.vm.selectUser({ id: 'u1', displayName: 'Ana', email: 'ana@example.com' });
			expect(wrapper.vm.selectedUser?.id).toBe('u1');
			expect(wrapper.vm.searchQuery).toBe('');
			expect(wrapper.vm.searchResults).toEqual([]);
		});

		it('handleAddAccess should call store.addAdmin with the selected userId', async () => {
			mockAddAdmin.mockResolvedValue({ id: 'a1', userId: 'u1', status: 'active' });
			wrapper.vm.selectedUser = { id: 'u1', displayName: 'Ana', email: 'ana@example.com' };
			await wrapper.vm.handleAddAccess();
			await nextTick();
			expect(mockAddAdmin).toHaveBeenCalledWith('test-community-id', 'u1');
		});

		it('handleAddAccess should emit invited and close on success', async () => {
			mockAddAdmin.mockResolvedValue({ id: 'a1', userId: 'u1', status: 'active' });
			wrapper.vm.selectedUser = { id: 'u1', displayName: 'Ana', email: 'ana@example.com' };
			await wrapper.vm.handleAddAccess();
			await nextTick();
			expect(wrapper.emitted('invited')).toBeTruthy();
			expect(wrapper.emitted('update:open')?.some((e: any[]) => e[0] === false)).toBe(true);
		});

		it('handleAddAccess should handle errors gracefully', async () => {
			mockAddAdmin.mockRejectedValue(new Error('boom'));
			wrapper.vm.selectedUser = { id: 'u1', displayName: 'Ana', email: 'ana@example.com' };
			await wrapper.vm.handleAddAccess();
			await nextTick();
			expect(wrapper.vm.isAdding).toBe(false);
			expect(mockToast).toHaveBeenCalled();
		});

		it('getInitials should produce up to two uppercase initials', () => {
			expect(wrapper.vm.getInitials('Ana Maria')).toBe('AM');
			expect(wrapper.vm.getInitials('')).toBe('');
		});
	});

	describe('Link mode (respaldo por email)', () => {
		it('should validate email format correctly', async () => {
			wrapper.vm.email = 'invalid-email';
			await nextTick();
			expect(wrapper.vm.isValidEmail).toBe(false);

			wrapper.vm.email = 'valid@example.com';
			await nextTick();
			expect(wrapper.vm.isValidEmail).toBe(true);
		});

		it('handleInvite should call store.inviteAdmin and build the link', async () => {
			mockWindowLocation('http://localhost:3000');
			mockInviteAdmin.mockResolvedValue({ invitationToken: 'tok-123' });
			wrapper.vm.email = 'admin@example.com';
			await wrapper.vm.handleInvite();
			await nextTick();
			expect(mockInviteAdmin).toHaveBeenCalledWith('test-community-id', 'admin@example.com');
			expect(wrapper.vm.invitationLink).toContain('/accept-community-invitation/tok-123');
		});

		it('handleInvite should emit invited but NOT close (so user can copy link)', async () => {
			mockWindowLocation('http://localhost:3000');
			mockInviteAdmin.mockResolvedValue({ invitationToken: 'tok-xyz' });
			wrapper.vm.email = 'admin@example.com';
			await wrapper.vm.handleInvite();
			await nextTick();
			expect(wrapper.emitted('invited')).toBeTruthy();
			expect(wrapper.emitted('update:open')).toBeFalsy();
		});

		it('handleInvite should do nothing with invalid email', async () => {
			wrapper.vm.email = '';
			await wrapper.vm.handleInvite();
			await nextTick();
			expect(mockInviteAdmin).not.toHaveBeenCalled();
		});

		it('copyLink should write the link to clipboard', async () => {
			const mockWriteText = vi.fn();
			Object.defineProperty(navigator, 'clipboard', {
				value: { writeText: mockWriteText },
				writable: true,
			});
			wrapper.vm.invitationLink = 'http://localhost:3000/accept-community-invitation/tok';
			await wrapper.vm.copyLink();
			await nextTick();
			expect(mockWriteText).toHaveBeenCalledWith(
				'http://localhost:3000/accept-community-invitation/tok',
			);
			expect(mockToast).toHaveBeenCalled();
		});
	});

	describe('Props & reset', () => {
		it('should accept communityId prop', () => {
			expect(wrapper.props('communityId')).toBe('test-community-id');
		});

		it('should reset internal state when closed', async () => {
			wrapper.vm.email = 'admin@example.com';
			wrapper.vm.selectedUser = { id: 'u1', displayName: 'Ana', email: 'ana@example.com' };
			wrapper.vm.invitationLink = 'http://localhost:3000/x';
			await wrapper.setProps({ open: false });
			await nextTick();
			expect(wrapper.vm.email).toBe('');
			expect(wrapper.vm.selectedUser).toBeNull();
			expect(wrapper.vm.invitationLink).toBe('');
			expect(wrapper.vm.activeTab).toBe('search');
		});
	});
});

// Helper function to mock window.location
function mockWindowLocation(href: string) {
	Object.defineProperty(window, 'location', {
		value: {
			href,
			origin: 'http://localhost:3000',
			protocol: 'http:',
			host: 'localhost:3000',
			hostname: 'localhost',
			port: '3000',
		},
		writable: true,
	});
}
