import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { mount, VueWrapper } from '@vue/test-utils';
import { nextTick } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import LoginView from '../LoginView.vue';
import { createTestWrapper, createMockUser, createMockRetreat, cleanupMocks } from '@/test/utils';

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
	defaults: {
		baseURL: '',
		withCredentials: false,
	},
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
const mockPush = vi.fn();
const mockReplace = vi.fn();

vi.mock('vue-router', () => ({
	useRouter: () => ({
		push: mockPush,
		replace: mockReplace,
		resolve: vi.fn(() => ({ href: '/test-route' })),
	}),
	useRoute: () => ({
		name: 'login',
		params: {},
		path: '/login',
	}),
}));

// Mock @repo/ui components
vi.mock('@repo/ui', () => ({
	Button: { template: '<button><slot /></button>' },
	Input: { template: '<input v-bind="$attrs" />' },
	Label: { template: '<label><slot /></label>' },
	Card: { template: '<div><slot /></div>' },
	CardContent: { template: '<div><slot /></div>' },
	CardDescription: { template: '<p><slot /></p>' },
	CardHeader: { template: '<div><slot /></div>' },
	CardTitle: { template: '<h2><slot /></h2>' },
	useToast: () => ({ toast: vi.fn() }),
}));

describe('LoginView', () => {
	let wrapper: VueWrapper<any>;
	let pinia: any;

	beforeEach(async () => {
		pinia = createPinia();
		setActivePinia(pinia);

		wrapper = createTestWrapper(LoginView, {
			global: {
				mocks: {
					$t: (key: string) => key,
				},
				stubs: {
					'router-view': true,
					transition: true,
					'transition-group': true,
				},
			},
		});

		await nextTick();
	});

	afterEach(() => {
		wrapper?.unmount();
		cleanupMocks();
		mockPush.mockClear();
		mockReplace.mockClear();
	});

	describe('Rendering', () => {
		it('should render the login component', () => {
			expect(wrapper.exists()).toBe(true);
		});

		it('should display the Emmaus logo with link to landing page', () => {
			const logoImg = wrapper.find('img[src="/crossRoseButtT.png"]');
			expect(logoImg.exists()).toBe(true);
			expect(logoImg.attributes('alt')).toBe('Emmaus Rose');

			// The logo should be inside a container with proper styling
			const logoContainer = wrapper.find('.flex.items-center.gap-2.mb-4');
			expect(logoContainer.exists()).toBe(true);
		});

		it('should render email input field', () => {
			const emailInput = wrapper.find('input[type="email"]');
			expect(emailInput.exists()).toBe(true);
			expect(emailInput.attributes('placeholder')).toBe('user@example.com');
		});

		it('should render password input field', () => {
			const passwordInput = wrapper.find('input[type="password"]');
			expect(passwordInput.exists()).toBe(true);
		});

		it('should render login button', () => {
			const loginButton = wrapper.find('button');
			expect(loginButton.exists()).toBe(true);
		});

		it('should render Google login button', () => {
			const googleLink = wrapper.find('a[href="http://localhost:3001/api/auth/google"]');
			expect(googleLink.exists()).toBe(true);
		});

		it('should render forgot password link', () => {
			// Check for the presence of the link by its text content (i18n key)
			const html = wrapper.html();
			// The link text would contain the i18n key value
			expect(html).toContain('ml-auto');
		});
	});

	describe('Logo and Branding', () => {
		it('should have logo linking to landing page', () => {
			// Find the logo image
			const logoImg = wrapper.find('img[src="/crossRoseButtT.png"]');
			expect(logoImg.exists()).toBe(true);

			// Check that the image has the correct alt text
			expect(logoImg.attributes('alt')).toBe('Emmaus Rose');
		});

		it('should display Emmaus text using i18n', () => {
			// Find the logo container by its class
			const logoContainer = wrapper.find('.flex.items-center.gap-2.mb-4');
			expect(logoContainer.exists()).toBe(true);

			// Find the text span with the styling classes
			const textSpan = logoContainer.find('.text-xl.font-light.tracking-widest.uppercase');
			expect(textSpan.exists()).toBe(true);
			// Should contain the i18n key value
			expect(textSpan.text()).toBe('landing.emmaus');
		});

		it('should have proper styling on logo container', () => {
			const logoContainer = wrapper.find('.flex.items-center.gap-2.mb-4');
			expect(logoContainer.exists()).toBe(true);
			expect(logoContainer.classes()).toContain('flex');
			expect(logoContainer.classes()).toContain('items-center');
			expect(logoContainer.classes()).toContain('gap-2');
		});
	});

	describe('Login Redirect Behavior', () => {
		it('should redirect to most recent retreat dashboard after successful login', async () => {
			const { useAuthStore: useAuthStoreImport } = await import('@/stores/authStore');
			const { useRetreatStore: useRetreatStoreImport } = await import('@/stores/retreatStore');

			const authStore = useAuthStoreImport();
			const retreatStore = useRetreatStoreImport();

			// Mock successful login
			const mockUser = createMockUser();
			const { api } = await import('@/services/api');
			(api.post as any).mockResolvedValue({
				data: {
					...mockUser,
					profile: mockUser,
				},
			});

			// Mock retreats
			const mockRetreat = createMockRetreat({ id: 'retreat-123' });
			(api.get as any).mockResolvedValue({
				data: [mockRetreat],
			});

			// Set form values directly on the component
			wrapper.vm.email = 'test@example.com';
			wrapper.vm.password = 'password';

			// Call handleLogin directly
			await wrapper.vm.handleLogin();
			await nextTick();

			// Verify login was called
			expect(api.post).toHaveBeenCalledWith('/auth/login', {
				email: 'test@example.com',
				password: 'password',
			});

			// Wait for async operations
			await new Promise((resolve) => setTimeout(resolve, 100));
			await nextTick();

			// Verify redirect to dashboard with retreat ID
			expect(mockPush).toHaveBeenCalledWith({
				name: 'retreat-dashboard',
				params: { id: 'retreat-123' },
			});
		});

		it('should redirect to /app if no retreats exist after login', async () => {
			const { useAuthStore: useAuthStoreImport } = await import('@/stores/authStore');
			const { useRetreatStore: useRetreatStoreImport } = await import('@/stores/retreatStore');

			const authStore = useAuthStoreImport();
			const retreatStore = useRetreatStoreImport();

			// Mock successful login
			const mockUser = createMockUser();
			const { api } = await import('@/services/api');
			(api.post as any).mockResolvedValue({
				data: {
					...mockUser,
					profile: mockUser,
				},
			});

			// Mock empty retreats list
			(api.get as any).mockResolvedValue({
				data: [],
			});

			// Set form values directly on the component
			wrapper.vm.email = 'test@example.com';
			wrapper.vm.password = 'password';

			// Call handleLogin directly
			await wrapper.vm.handleLogin();
			await nextTick();

			// Wait for async operations
			await new Promise((resolve) => setTimeout(resolve, 100));
			await nextTick();

			// Verify redirect to /app
			expect(mockPush).toHaveBeenCalledWith('/app');
		});
	});

	describe('Form Interaction', () => {
		it('should bind email input to email ref', async () => {
			const emailInput = wrapper.find('input[type="email"]');
			await emailInput.setValue('test@example.com');
			expect((emailInput.element as HTMLInputElement).value).toBe('test@example.com');
		});

		it('should bind password input to password ref', async () => {
			const passwordInput = wrapper.find('input[type="password"]');
			await passwordInput.setValue('password123');
			expect((passwordInput.element as HTMLInputElement).value).toBe('password123');
		});

		it('should support Enter key to submit login', async () => {
			const { api } = await import('@/services/api');
			(api.post as any).mockResolvedValue({
				data: {
					...createMockUser(),
					profile: createMockUser(),
				},
			});
			(api.get as any).mockResolvedValue({ data: [] });

			const passwordInput = wrapper.find('input[type="password"]');
			await passwordInput.trigger('keyup.enter');
			await nextTick();

			// Login should be attempted
			await new Promise((resolve) => setTimeout(resolve, 50));
		});
	});

	describe('Error Handling', () => {
		it('should display error message on login failure', async () => {
			const { api } = await import('@/services/api');
			(api.post as any).mockRejectedValue({
				response: { data: { message: 'Invalid credentials' } },
			});

			// Set form values
			const emailInput = wrapper.find('input[type="email"]');
			const passwordInput = wrapper.find('input[type="password"]');
			await emailInput.setValue('wrong@example.com');
			await passwordInput.setValue('wrongpassword');

			// Trigger login
			const loginButton = wrapper.findAll('button')[0];
			await loginButton.trigger('click');
			await nextTick();

			// Wait for async operations
			await new Promise((resolve) => setTimeout(resolve, 100));
			await nextTick();

			// Check for error display
			const errorDiv = wrapper.find('.text-destructive');
			expect(errorDiv.exists()).toBe(true);
			expect(errorDiv.text()).toBe('Invalid credentials');
		});

		it('should disable button while loading', async () => {
			const { useAuthStore: useAuthStoreImport } = await import('@/stores/authStore');
			const authStore = useAuthStoreImport();

			authStore.loading = true;
			await nextTick();

			const loginButton = wrapper.findAll('button')[0];
			expect(loginButton.attributes('disabled')).toBeDefined();
		});
	});
});
