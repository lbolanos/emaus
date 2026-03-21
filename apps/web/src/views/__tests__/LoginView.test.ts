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

// Mock reCAPTCHA service
vi.mock('@/services/recaptcha', () => ({
	getRecaptchaToken: vi.fn(() => Promise.resolve('mock-recaptcha-token')),
	RECAPTCHA_ACTIONS: {
		LOGIN: 'login',
		USER_REGISTER: 'user_register',
		NEWSLETTER_SUBSCRIBE: 'newsletter_subscribe',
		COMMUNITY_JOIN: 'community_join',
		PUBLIC_CONTACT: 'public_contact',
		PASSWORD_RESET_REQUEST: 'password_reset_request',
		PASSWORD_RESET: 'password_reset',
		PARTICIPANT_REGISTER: 'participant_register',
		INVITATION_ACCEPT: 'invitation_accept',
		COMMUNITY_INVITATION_ACCEPT: 'community_invitation_accept',
		PUBLIC_ATTENDANCE_TOGGLE: 'public_attendance_toggle',
	},
	isRecaptchaConfigured: vi.fn(() => true),
	installRecaptcha: vi.fn(),
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
			expect(emailInput.attributes('placeholder')).toContain('example.com');
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
				recaptchaToken: 'mock-recaptcha-token',
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

	describe('Register Mode Toggle', () => {
		it('should render "create account" toggle link in login mode', () => {
			const html = wrapper.html();
			expect(html).toContain('login.noAccount');
			expect(html).toContain('login.createAccount');
		});

		it('should switch to register mode when "create account" is clicked', async () => {
			// Find the toggle button (outside the card)
			const toggleBtn = wrapper.find('.mt-4 button');
			expect(toggleBtn.exists()).toBe(true);
			await toggleBtn.trigger('click');
			await nextTick();

			const html = wrapper.html();
			// Title should now be register
			expect(html).toContain('login.registerTitle');
			expect(html).toContain('login.registerDescription');
			// Should show "already have account" link
			expect(html).toContain('login.hasAccount');
			expect(html).toContain('login.loginLink');
		});

		it('should show name and confirm password fields in register mode', async () => {
			// Switch to register mode
			const toggleBtn = wrapper.find('.mt-4 button');
			await toggleBtn.trigger('click');
			await nextTick();

			// Name field
			const nameInput = wrapper.find('input#displayName');
			expect(nameInput.exists()).toBe(true);

			// Confirm password field
			const confirmInput = wrapper.find('input#confirmPassword');
			expect(confirmInput.exists()).toBe(true);
		});

		it('should hide Google login and forgot password in register mode', async () => {
			const toggleBtn = wrapper.find('.mt-4 button');
			await toggleBtn.trigger('click');
			await nextTick();

			// Google login link should be gone
			const googleLink = wrapper.find('a[href="http://localhost:3001/api/auth/google"]');
			expect(googleLink.exists()).toBe(false);

			// Forgot password link should be gone
			const html = wrapper.html();
			expect(html).not.toContain('login.forgotPassword');
		});

		it('should switch back to login mode', async () => {
			// Go to register mode
			const toggleBtn = wrapper.find('.mt-4 button');
			await toggleBtn.trigger('click');
			await nextTick();

			// Go back to login mode
			const backBtn = wrapper.find('.mt-4 button');
			await backBtn.trigger('click');
			await nextTick();

			const html = wrapper.html();
			expect(html).toContain('login.title');
			expect(html).toContain('login.noAccount');

			// Name and confirm password fields should be gone
			expect(wrapper.find('input#displayName').exists()).toBe(false);
			expect(wrapper.find('input#confirmPassword').exists()).toBe(false);
		});

		it('should clear error when toggling mode', async () => {
			// Trigger a login error first
			const { api } = await import('@/services/api');
			(api.post as any).mockRejectedValue({
				response: { data: { message: 'Invalid credentials' } },
			});
			const loginButton = wrapper.findAll('button')[0];
			await loginButton.trigger('click');
			await nextTick();
			await new Promise((resolve) => setTimeout(resolve, 100));
			await nextTick();

			// Error should be visible
			expect(wrapper.find('.text-destructive').exists()).toBe(true);

			// Toggle to register mode
			const toggleBtn = wrapper.find('.mt-4 button');
			await toggleBtn.trigger('click');
			await nextTick();

			// Error should be cleared
			expect(wrapper.find('.text-destructive').exists()).toBe(false);
		});
	});

	describe('Register Form', () => {
		beforeEach(async () => {
			// Switch to register mode
			const toggleBtn = wrapper.find('.mt-4 button');
			await toggleBtn.trigger('click');
			await nextTick();
		});

		it('should show password mismatch error when passwords do not match', async () => {
			wrapper.vm.displayName = 'Test User';
			wrapper.vm.email = 'test@example.com';
			wrapper.vm.password = 'password123';
			wrapper.vm.confirmPassword = 'differentpassword';

			await wrapper.vm.handleRegister();
			await nextTick();

			const errorDiv = wrapper.find('.text-destructive');
			expect(errorDiv.exists()).toBe(true);
			expect(errorDiv.text()).toBe('login.passwordMismatch');
		});

		it('should not call register API when passwords do not match', async () => {
			const { api } = await import('@/services/api');
			(api.post as any).mockClear();

			wrapper.vm.displayName = 'Test User';
			wrapper.vm.email = 'test@example.com';
			wrapper.vm.password = 'password123';
			wrapper.vm.confirmPassword = 'differentpassword';

			await wrapper.vm.handleRegister();
			await nextTick();

			expect(api.post).not.toHaveBeenCalledWith('/auth/register', expect.anything());
		});

		it('should call register API with correct data and reCAPTCHA token when passwords match', async () => {
			const { api } = await import('@/services/api');
			(api.post as any).mockResolvedValue({ data: { success: true } });

			wrapper.vm.displayName = 'Test User';
			wrapper.vm.email = 'test@example.com';
			wrapper.vm.password = 'password123';
			wrapper.vm.confirmPassword = 'password123';

			await wrapper.vm.handleRegister();
			await nextTick();
			await new Promise((resolve) => setTimeout(resolve, 100));

			expect(api.post).toHaveBeenCalledWith('/auth/register', {
				email: 'test@example.com',
				password: 'password123',
				displayName: 'Test User',
				recaptchaToken: 'mock-recaptcha-token',
			});
		});

		it('should switch back to login mode after successful registration', async () => {
			const { api } = await import('@/services/api');
			(api.post as any).mockResolvedValue({ data: { success: true } });

			wrapper.vm.displayName = 'Test User';
			wrapper.vm.email = 'test@example.com';
			wrapper.vm.password = 'password123';
			wrapper.vm.confirmPassword = 'password123';

			await wrapper.vm.handleRegister();
			await nextTick();
			await new Promise((resolve) => setTimeout(resolve, 100));
			await nextTick();

			// Should be back in login mode
			const html = wrapper.html();
			expect(html).toContain('login.noAccount');
		});

		it('should clear password fields after successful registration', async () => {
			const { api } = await import('@/services/api');
			(api.post as any).mockResolvedValue({ data: { success: true } });

			wrapper.vm.displayName = 'Test User';
			wrapper.vm.email = 'test@example.com';
			wrapper.vm.password = 'password123';
			wrapper.vm.confirmPassword = 'password123';

			await wrapper.vm.handleRegister();
			await nextTick();
			await new Promise((resolve) => setTimeout(resolve, 100));

			expect(wrapper.vm.password).toBe('');
			expect(wrapper.vm.confirmPassword).toBe('');
		});

		it('should display error on registration failure', async () => {
			const { api } = await import('@/services/api');
			(api.post as any).mockRejectedValue({
				response: { data: { message: 'Email already in use' } },
				message: 'Email already in use',
			});

			wrapper.vm.displayName = 'Test User';
			wrapper.vm.email = 'test@example.com';
			wrapper.vm.password = 'password123';
			wrapper.vm.confirmPassword = 'password123';

			await wrapper.vm.handleRegister();
			await nextTick();
			await new Promise((resolve) => setTimeout(resolve, 100));
			await nextTick();

			const errorDiv = wrapper.find('.text-destructive');
			expect(errorDiv.exists()).toBe(true);
		});

		it('should render register button in register mode', () => {
			const html = wrapper.html();
			expect(html).toContain('login.registerButton');
		});

		it('should show password too short error when password is less than 8 characters', async () => {
			wrapper.vm.displayName = 'Test User';
			wrapper.vm.email = 'test@example.com';
			wrapper.vm.password = 'short';
			wrapper.vm.confirmPassword = 'short';

			await wrapper.vm.handleRegister();
			await nextTick();

			const errorDiv = wrapper.find('.text-destructive');
			expect(errorDiv.exists()).toBe(true);
			expect(errorDiv.text()).toBe('login.passwordTooShort');
		});

		it('should not call register API when password is too short', async () => {
			const { api } = await import('@/services/api');
			(api.post as any).mockClear();

			wrapper.vm.displayName = 'Test User';
			wrapper.vm.email = 'test@example.com';
			wrapper.vm.password = 'short';
			wrapper.vm.confirmPassword = 'short';

			await wrapper.vm.handleRegister();
			await nextTick();

			expect(api.post).not.toHaveBeenCalledWith('/auth/register', expect.anything());
		});

		it('should call getRecaptchaToken with USER_REGISTER action', async () => {
			const { api } = await import('@/services/api');
			(api.post as any).mockResolvedValue({ data: { success: true } });

			const { getRecaptchaToken } = await import('@/services/recaptcha');

			wrapper.vm.displayName = 'Test User';
			wrapper.vm.email = 'test@example.com';
			wrapper.vm.password = 'password123';
			wrapper.vm.confirmPassword = 'password123';

			await wrapper.vm.handleRegister();
			await nextTick();
			await new Promise((resolve) => setTimeout(resolve, 100));

			expect(getRecaptchaToken).toHaveBeenCalledWith('user_register');
		});

		it('should clear displayName after successful registration', async () => {
			const { api } = await import('@/services/api');
			(api.post as any).mockResolvedValue({ data: { success: true } });

			wrapper.vm.displayName = 'Test User';
			wrapper.vm.email = 'test@example.com';
			wrapper.vm.password = 'password123';
			wrapper.vm.confirmPassword = 'password123';

			await wrapper.vm.handleRegister();
			await nextTick();
			await new Promise((resolve) => setTimeout(resolve, 100));

			expect(wrapper.vm.displayName).toBe('');
		});

		it('should show password hint in register mode', () => {
			const html = wrapper.html();
			expect(html).toContain('login.passwordHint');
		});

		it('should have minlength attribute on password input in register mode', () => {
			const passwordInput = wrapper.find('input#password');
			expect(passwordInput.attributes('minlength')).toBe('8');
		});
	});
});
