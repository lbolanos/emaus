import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { mount, VueWrapper } from '@vue/test-utils';
import { nextTick } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import AcceptCommunityInvitationView from '../AcceptCommunityInvitationView.vue';
import { createTestWrapper, cleanupMocks } from '@/test/utils';

// Mock vue-router
vi.mock('vue-router', () => ({
	useRoute: () => ({
		params: { token: 'test-token-123' },
	}),
	useRouter: () => ({
		push: vi.fn(),
		replace: vi.fn(),
		go: vi.fn(),
		back: vi.fn(),
		forward: vi.fn(),
		resolve: vi.fn(() => ({ href: '/mocked-route' })),
	}),
}));

// Mock axios
vi.mock('axios', () => ({
	default: {
		create: vi.fn(() => ({
			get: vi.fn(),
			post: vi.fn(),
			put: vi.fn(),
			delete: vi.fn(),
		})),
		get: vi.fn(),
		post: vi.fn(),
		put: vi.fn(),
		delete: vi.fn(),
	},
}));

// Mock API service to return success by default
vi.mock('@/services/api', () => ({
	getCommunityInvitationStatus: vi.fn().mockResolvedValue({
		data: {
			valid: true,
			community: { id: 'comm-1', name: 'Test Community' },
			user: { id: 'user-1', email: 'invited@example.com' },
			invitationExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
		},
	}),
	acceptCommunityInvitation: vi.fn().mockResolvedValue({
		id: 'admin-1',
		status: 'active',
	}),
}));

// Mock auth store
const mockAuthStore = {
	isAuthenticated: false,
	checkAuthStatus: vi.fn().mockResolvedValue(undefined),
};
vi.mock('@/stores/authStore', () => ({
	useAuthStore: () => mockAuthStore,
}));

// Mock @repo/utils
vi.mock('@repo/utils', () => ({
	formatDate: (date: Date) => {
		if (!(date instanceof Date)) return '';
		return date.toLocaleDateString('es-ES');
	},
}));

describe('AcceptCommunityInvitationView Component', () => {
	let wrapper: VueWrapper<any>;
	let pinia: any;

	const createWrapper = async () => {
		pinia = createPinia();
		setActivePinia(pinia);

		return createTestWrapper(AcceptCommunityInvitationView, {
			global: {
				mocks: {
					$route: {
						params: { token: 'test-token-123' },
					},
				},
			},
		});
	};

	beforeEach(async () => {
		// Reset auth store mock to default unauthenticated state
		mockAuthStore.isAuthenticated = false;
		wrapper = await createWrapper();
		await nextTick();
	});

	afterEach(() => {
		wrapper?.unmount();
		cleanupMocks();
	});

	describe('Component Rendering', () => {
		it('should render the component', () => {
			expect(wrapper.exists()).toBe(true);
		});

		it('should have invitation card container', () => {
			const card = wrapper.find('.invitation-card');
			expect(card.exists()).toBe(true);
		});

		it('should display logo section with app name', () => {
			const logoSection = wrapper.find('.logo-section');
			expect(logoSection.exists()).toBe(true);
			expect(logoSection.text()).toContain('Emaús');
			expect(logoSection.text()).toContain('Sistema de Gestión de Retiros');
		});
	});

	describe('Loading State', () => {
		it('should render loading section when loading is true', async () => {
			wrapper.vm.loading = true;
			await nextTick();

			const loadingSection = wrapper.find('.loading-section');
			expect(loadingSection.exists()).toBe(true);
		});

		it('should display loading spinner', async () => {
			wrapper.vm.loading = true;
			await nextTick();

			const spinner = wrapper.find('.spinner');
			expect(spinner.exists()).toBe(true);
		});

		it('should show loading verification text', async () => {
			wrapper.vm.loading = true;
			await nextTick();

			const loadingText = wrapper.find('.loading-section h3');
			expect(loadingText.text()).toBe('Verificando tu invitación');
		});
	});

	describe('Error State', () => {
		it('should show error state when error is set', async () => {
			wrapper.vm.loading = false;
			wrapper.vm.error = 'Invitación no válida o expirada';
			wrapper.vm.invitationData = null;
			await nextTick();

			const errorSection = wrapper.find('.error-section');
			expect(errorSection.exists()).toBe(true);
		});

		it('should display error message text', async () => {
			wrapper.vm.loading = false;
			wrapper.vm.error = 'El token ha expirado';
			wrapper.vm.invitationData = null;
			await nextTick();

			const errorSection = wrapper.find('.error-section');
			expect(errorSection.text()).toContain('El token ha expirado');
		});

		it('should have login button in error state', async () => {
			wrapper.vm.loading = false;
			wrapper.vm.error = 'Error';
			wrapper.vm.invitationData = null;
			await nextTick();

			const loginButton = wrapper
				.findAll('button')
				.find((b: any) => b.text().includes('Ir al Inicio de Sesión'));
			expect(loginButton).toBeDefined();
		});
	});

	describe('Authentication Required State', () => {
		it('should show auth required state when not authenticated with valid invitation', async () => {
			const mockInvitationData = {
				valid: true,
				community: { id: 'comm-1', name: 'Test Community' },
				user: { id: 'user-1', email: 'invited@example.com' },
			};

			wrapper.vm.loading = false;
			wrapper.vm.error = '';
			wrapper.vm.invitationData = mockInvitationData;
			await nextTick();

			const authSection = wrapper.find('.auth-required-section');
			expect(authSection.exists()).toBe(true);
		});

		it('should display community name', async () => {
			const mockInvitationData = {
				valid: true,
				community: { id: 'comm-1', name: 'Test Community' },
				user: { id: 'user-1', email: 'invited@example.com' },
			};

			wrapper.vm.loading = false;
			wrapper.vm.error = '';
			wrapper.vm.invitationData = mockInvitationData;
			await nextTick();

			const authSection = wrapper.find('.auth-required-section');
			expect(authSection.text()).toContain('Test Community');
		});

		it('should have iniciar sesión button', async () => {
			const mockInvitationData = {
				valid: true,
				community: { id: 'comm-1', name: 'Test Community' },
				user: { id: 'user-1', email: 'invited@example.com' },
			};

			wrapper.vm.loading = false;
			wrapper.vm.error = '';
			wrapper.vm.invitationData = mockInvitationData;
			await nextTick();

			const loginButton = wrapper
				.findAll('button')
				.find((b: any) => b.text().includes('Iniciar Sesión'));
			expect(loginButton).toBeDefined();
		});

		it('should store token in sessionStorage on login click', async () => {
			const mockInvitationData = {
				valid: true,
				community: { id: 'comm-1', name: 'Test Community' },
				user: { id: 'user-1', email: 'invited@example.com' },
			};

			wrapper.vm.loading = false;
			wrapper.vm.error = '';
			wrapper.vm.invitationData = mockInvitationData;
			await nextTick();

			const loginButton = wrapper
				.findAll('button')
				.find((b: any) => b.text().includes('Iniciar Sesión'));
			if (loginButton) {
				await loginButton.trigger('click');
				await nextTick();

				expect(sessionStorage.getItem('communityInviteToken')).toBe('test-token-123');
			}
		});
	});

	describe('Invitation Info State (Authenticated)', () => {
		beforeEach(() => {
			// Mock authenticated user
			mockAuthStore.isAuthenticated = true;
		});

		it('should show invitation info when authenticated with valid invitation', async () => {
			const mockInvitationData = {
				valid: true,
				community: { id: 'comm-1', name: 'Test Community' },
				user: { id: 'user-1', email: 'invited@example.com' },
				invitationExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
			};

			wrapper.vm.loading = false;
			wrapper.vm.error = '';
			wrapper.vm.invitationData = mockInvitationData;
			await nextTick();

			const infoSection = wrapper.find('.invitation-info-section');
			expect(infoSection.exists()).toBe(true);
		});

		it('should display community name', async () => {
			const mockInvitationData = {
				valid: true,
				community: { id: 'comm-1', name: 'My Awesome Community' },
				user: { id: 'user-1', email: 'user@example.com' },
				invitationExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
			};

			wrapper.vm.loading = false;
			wrapper.vm.error = '';
			wrapper.vm.invitationData = mockInvitationData;
			await nextTick();

			const infoSection = wrapper.find('.invitation-info-section');
			expect(infoSection.text()).toContain('My Awesome Community');
		});

		it('should display user email', async () => {
			const mockInvitationData = {
				valid: true,
				community: { id: 'comm-1', name: 'Test Community' },
				user: { id: 'user-1', email: 'test@example.com' },
				invitationExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
			};

			wrapper.vm.loading = false;
			wrapper.vm.error = '';
			wrapper.vm.invitationData = mockInvitationData;
			await nextTick();

			const infoSection = wrapper.find('.invitation-info-section');
			expect(infoSection.text()).toContain('test@example.com');
		});

		it('should have accept invitation button', async () => {
			const mockInvitationData = {
				valid: true,
				community: { id: 'comm-1', name: 'Test Community' },
				user: { id: 'user-1', email: 'test@example.com' },
				invitationExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
			};

			wrapper.vm.loading = false;
			wrapper.vm.error = '';
			wrapper.vm.invitationData = mockInvitationData;
			await nextTick();

			const acceptButton = wrapper
				.findAll('button')
				.find((b: any) => b.text().includes('Aceptar Invitación'));
			expect(acceptButton).toBeDefined();
		});
	});

	describe('Success State', () => {
		beforeEach(() => {
			// Set authenticated state for success tests
			mockAuthStore.isAuthenticated = true;
		});

		it('should show success state when invitation is accepted', async () => {
			const mockInvitationData = {
				valid: true,
				community: { id: 'comm-1', name: 'Test Community' },
				user: { id: 'user-1', email: 'test@example.com' },
			};

			wrapper.vm.loading = false;
			wrapper.vm.error = '';
			wrapper.vm.invitationData = mockInvitationData;
			wrapper.vm.accepted = true;
			await nextTick();

			const successSection = wrapper.find('.success-section');
			expect(successSection.exists()).toBe(true);
		});

		it('should display success message with community name', async () => {
			const mockInvitationData = {
				valid: true,
				community: { id: 'comm-1', name: 'Amazing Community' },
				user: { id: 'user-1', email: 'test@example.com' },
			};

			wrapper.vm.loading = false;
			wrapper.vm.error = '';
			wrapper.vm.invitationData = mockInvitationData;
			wrapper.vm.accepted = true;
			await nextTick();

			const successSection = wrapper.find('.success-section');
			expect(successSection.text()).toContain('Amazing Community');
		});

		it('should have go to community button', async () => {
			const mockInvitationData = {
				valid: true,
				community: { id: 'comm-1', name: 'Test Community' },
				user: { id: 'user-1', email: 'test@example.com' },
			};

			wrapper.vm.loading = false;
			wrapper.vm.error = '';
			wrapper.vm.invitationData = mockInvitationData;
			wrapper.vm.accepted = true;
			await nextTick();

			const communityButton = wrapper
				.findAll('button')
				.find((b: any) => b.text().includes('Ir a la Comunidad'));
			expect(communityButton).toBeDefined();
		});
	});

	describe('Token Extraction', () => {
		it('should extract token from route params', () => {
			expect(wrapper.vm.token).toBe('test-token-123');
		});
	});

	describe('Helper Functions Exist', () => {
		it('should have goToLogin method', () => {
			expect(typeof wrapper.vm.goToLogin).toBe('function');
		});

		it('should have goToDashboard method', () => {
			expect(typeof wrapper.vm.goToDashboard).toBe('function');
		});

		it('should have goToCommunity method', () => {
			expect(typeof wrapper.vm.goToCommunity).toBe('function');
		});

		it('should have validateInvitation method', () => {
			expect(typeof wrapper.vm.validateInvitation).toBe('function');
		});

		it('should have acceptInvitation method', () => {
			expect(typeof wrapper.vm.acceptInvitation).toBe('function');
		});
	});
});
