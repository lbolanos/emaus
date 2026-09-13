import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { VueWrapper } from '@vue/test-utils';
import { nextTick } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import Sidebar from '../layout/Sidebar.vue';
// NOTE: unlike Sidebar.test.ts, this file does NOT mock SidebarMenuItem /
// SidebarSection — it verifies the hover/focus wiring against the real item,
// including the classes that paint the focus ring.
import { createTestWrapper, cleanupMocks } from '../../test/utils';

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

// Mock the API service
const mockApiResponse = { data: [] };
vi.mock('@/services/api', () => ({
	api: {
		get: vi.fn(() => Promise.resolve(mockApiResponse)),
		post: vi.fn(() => Promise.resolve(mockApiResponse)),
		put: vi.fn(() => Promise.resolve(mockApiResponse)),
		delete: vi.fn(() => Promise.resolve(mockApiResponse)),
	},
	getReceptionStats: vi.fn(() => Promise.resolve({ pending: 0 })),
}));

// Mock vue-router
vi.mock('vue-router', () => ({
	useRouter: () => ({
		push: vi.fn(),
		replace: vi.fn(),
		resolve: vi.fn(() => ({ href: '/test-route' })),
	}),
	useRoute: () => ({
		name: 'walkers',
		params: { id: 'test-retreat-id' },
		path: '/walkers/test-retreat-id',
		meta: {},
		query: {},
		fullPath: '/walkers/test-retreat-id',
	}),
}));

// Mock child components (NOT SidebarMenuItem/SidebarSection — those are the
// subject under test)
vi.mock('@/components/RetreatModal.vue', () => ({
	default: { template: '<div />' },
}));
vi.mock('@/components/DeleteRetreatDialog.vue', () => ({
	default: { template: '<div />' },
}));
vi.mock('@/components/HelpPanel.vue', () => ({
	default: { template: '<div />' },
}));

// Mock @repo/ui components
vi.mock('@repo/ui', () => {
	const s = { template: '<div><slot /></div>' };
	return {
		Button: { template: '<button><slot /></button>' },
		Select: s, SelectContent: s, SelectGroup: s, SelectItem: s,
		SelectTrigger: s, SelectValue: s,
		Tooltip: s, TooltipContent: s, TooltipProvider: s, TooltipTrigger: s,
		DropdownMenu: s, DropdownMenuContent: s, DropdownMenuItem: s,
		DropdownMenuLabel: s, DropdownMenuSeparator: s,
		DropdownMenuSub: s, DropdownMenuSubContent: s, DropdownMenuSubTrigger: s,
		DropdownMenuTrigger: s,
		useToast: () => ({ toast: vi.fn() }),
	};
});

// Mock lucide-vue-next icons (same allowlist approach as Sidebar.test.ts,
// plus the icons used by SidebarMenuItem and SidebarSection)
vi.mock('lucide-vue-next', () => {
	const icon = (name: string) => ({ template: `<div data-icon="${name}" />` });
	return {
		LogOut: icon('LogOut'), Users: icon('Users'), UtensilsCrossed: icon('UtensilsCrossed'),
		LayoutDashboard: icon('LayoutDashboard'), ChevronLeft: icon('ChevronLeft'),
		Home: icon('Home'), Ban: icon('Ban'), Bed: icon('Bed'), HandHeart: icon('HandHeart'),
		DollarSign: icon('DollarSign'), NotebookPen: icon('NotebookPen'), Building: icon('Building'),
		UsersRound: icon('UsersRound'), Salad: icon('Salad'), FileX: icon('FileX'),
		UserCheck: icon('UserCheck'), ShoppingBag: icon('ShoppingBag'), Pill: icon('Pill'),
		Shirt: icon('Shirt'), UserCog: icon('UserCog'), Table: icon('Table'),
		Settings: icon('Settings'), Package: icon('Package'), Globe: icon('Globe'),
		Briefcase: icon('Briefcase'), Search: icon('Search'), X: icon('X'),
		ArrowRight: icon('ArrowRight'), ChevronDown: icon('ChevronDown'), Lock: icon('Lock'),
		CreditCard: icon('CreditCard'), Activity: icon('Activity'), KeyRound: icon('KeyRound'),
		Heart: icon('Heart'), UserPlus: icon('UserPlus'), UserCircle: icon('UserCircle'),
		MessageSquare: icon('MessageSquare'), Clock: icon('Clock'),
		ClipboardList: icon('ClipboardList'), BookOpen: icon('BookOpen'), Plus: icon('Plus'),
		Edit: icon('Edit'), Trash2: icon('Trash2'), HelpCircle: icon('HelpCircle'),
		Cross: icon('Cross'), User: icon('User'), Languages: icon('Languages'),
		DoorOpen: icon('DoorOpen'),
	};
});

// Mock the composables
vi.mock('@/composables/useAuthPermissions', () => ({
	useAuthPermissions: () => ({
		can: {
			read: vi.fn(() => true),
			create: vi.fn(() => true),
			update: vi.fn(() => true),
			delete: vi.fn(() => true),
			list: vi.fn(() => true),
			manage: vi.fn(() => true),
		},
		isSuperadmin: vi.fn(() => true),
		isAdmin: vi.fn(() => true),
		hasRole: vi.fn(() => true),
		currentRetreatRole: { value: null },
		retreatOnlyPermissions: { value: [] },
	}),
}));

// router-link stub that supports the custom v-slot used by SidebarMenuItem
// ({ href, navigate, isActive }). The default VTU stub does not provide the
// slot scope, so the item's <a> would not render.
const RouterLinkSlotStub = {
	name: 'RouterLink',
	props: ['to'],
	setup(_props: any, { slots }: any) {
		return () => slots.default?.({ href: '#', navigate: vi.fn(), isActive: false });
	},
};

describe('Sidebar hover vs keyboard focus', () => {
	let wrapper: VueWrapper<any>;

	const getSetupState = (w: VueWrapper<any>) => (w.vm as any).$.setupState;

	const allItems = (w: VueWrapper<any>): any[] => {
		const raw = getSetupState(w)?.allMenuItems;
		return Array.isArray(raw) ? raw : raw?.value ?? [];
	};

	const itemIndexByName = (w: VueWrapper<any>, name: string) =>
		allItems(w).findIndex((i: any) => i.name === name);

	const anchorOf = (w: VueWrapper<any>, index: number) =>
		w.find(`[data-menu-item-index="${index}"]`);

	beforeEach(async () => {
		const pinia = createPinia();
		setActivePinia(pinia);

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
					role: { name: 'superadmin' },
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
		// keep the watch on retreat selection from resetting the profile
		authStore.refreshUserProfile = vi.fn().mockResolvedValue(undefined) as any;

		const { useRetreatStore: useRetreatStoreImport } = await import('@/stores/retreatStore');
		const retreatStore = useRetreatStoreImport();
		retreatStore.selectRetreat('test-retreat-id');

		wrapper = createTestWrapper(Sidebar, {
			// pass the pre-populated pinia so the component sees the user/retreat
			pinia,
			global: {
				stubs: { 'router-link': RouterLinkSlotStub },
				mocks: { $t: (key: string) => key },
			},
		});

		await nextTick();
	});

	afterEach(() => {
		wrapper?.unmount();
		cleanupMocks();
	});

	it('hover does not paint the active-item ring (regresión 2026-09-12)', async () => {
		const idx = itemIndexByName(wrapper, 'servers');
		const a = anchorOf(wrapper, idx);
		expect(a.exists()).toBe(true);

		await a.trigger('mouseenter');

		// Before the fix, mouseenter set focusedIndex and the focused ring
		// (ring-2 ring-blue-500 ...) is identical to the active item's — and it
		// never went away because nothing listened to mouseleave.
		expect(a.classes()).not.toContain('ring-2');
		expect(a.classes()).not.toContain('ring-blue-500');
	});

	it('mouseenter syncs the index for arrow keys; mouseleave clears it', async () => {
		const state = getSetupState(wrapper);
		const idx = itemIndexByName(wrapper, 'servers');

		await anchorOf(wrapper, idx).trigger('mouseenter');
		expect(state.focusedIndex).toBe(idx);

		await anchorOf(wrapper, idx).trigger('mouseleave');
		expect(state.focusedIndex).toBe(-1);
	});

	it('keyboard navigation still paints the focus ring', async () => {
		const state = getSetupState(wrapper);
		state.toggleSection('people');

		await wrapper.find('aside').trigger('keydown.down');

		expect(state.focusedIndex).toBeGreaterThanOrEqual(0);
		const focused = anchorOf(wrapper, state.focusedIndex);
		expect(focused.exists()).toBe(true);
		expect(focused.classes()).toContain('ring-2');
	});

	it('arrow keys continue from the hovered item', async () => {
		const state = getSetupState(wrapper);
		state.toggleSection('people');
		const idx = itemIndexByName(wrapper, 'servers');

		await anchorOf(wrapper, idx).trigger('mouseenter');
		await wrapper.find('aside').trigger('keydown.down');

		// next visible item (angelitos, same section) takes the focus
		expect(state.focusedIndex).toBe(idx + 1);
	});

	it('mouseleave after keyboard navigation does not clear the keyboard focus', async () => {
		const state = getSetupState(wrapper);
		state.toggleSection('people');
		const idx = itemIndexByName(wrapper, 'servers');

		await anchorOf(wrapper, idx).trigger('mouseenter');
		await wrapper.find('aside').trigger('keydown.down');
		expect(state.focusedIndex).toBe(idx + 1);

		// leaving the previously hovered item must not drop the keyboard focus
		await anchorOf(wrapper, idx).trigger('mouseleave');
		expect(state.focusedIndex).toBe(idx + 1);
	});
});
