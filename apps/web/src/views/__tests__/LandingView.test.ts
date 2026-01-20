import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { mount, VueWrapper } from '@vue/test-utils';
import { nextTick } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import LandingView from '../LandingView.vue';
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

// Mock the API service - must be defined inline to avoid hoisting issues
vi.mock('@/services/api', () => ({
	api: {
		get: vi.fn(),
		post: vi.fn(),
		put: vi.fn(),
		delete: vi.fn(),
	},
	getPublicRetreats: vi.fn(() => Promise.resolve([])),
	getPublicCommunities: vi.fn(() => Promise.resolve([])),
	getPublicCommunityMeetings: vi.fn(() => Promise.resolve([])),
	getLandingTestimonials: vi.fn(() => Promise.resolve([])),
	subscribeToNewsletter: vi.fn(() => Promise.resolve()),
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
		name: 'home',
		params: {},
		path: '/',
	}),
}));

// Mock @repo/ui components
vi.mock('@repo/ui', () => ({
	Button: { template: '<button><slot /></button>' },
	Input: { template: '<input />' },
	Label: { template: '<label><slot /></label>' },
	Dialog: { template: '<div><slot /></div>' },
	DialogBody: { template: '<div><slot /></div>' },
	useToast: () => ({ toast: vi.fn() }),
}));

// Mock lucide-vue-next icons
vi.mock('lucide-vue-next', () => ({
	MapPin: { template: '<div data-icon="MapPin" />' },
	Calendar: { template: '<div data-icon="Calendar" />' },
	Clock: { template: '<div data-icon="Clock" />' },
	ChevronRight: { template: '<div data-icon="ChevronRight" />' },
	Menu: { template: '<div data-icon="Menu" />' },
	X: { template: '<div data-icon="X" />' },
	Instagram: { template: '<div data-icon="Instagram" />' },
	Facebook: { template: '<div data-icon="Facebook" />' },
	Mail: { template: '<div data-icon="Mail" />' },
}));

// Mock the modal components
vi.mock('@/components/community/PublicJoinRequestModal.vue', () => ({
	default: { template: '<div>JoinRequestModal</div>' },
}));

vi.mock('@/components/PublicRetreatFlyerModal.vue', () => ({
	default: { template: '<div>RetreatFlyerModal</div>' },
}));

describe('LandingView', () => {
	let wrapper: VueWrapper<any>;
	let pinia: any;

	beforeEach(async () => {
		pinia = createPinia();
		setActivePinia(pinia);

		// Get the API functions and set up mocks
		const { api } = await import('@/services/api');
		(api.get as any).mockResolvedValue({ data: [] });

		const { getPublicRetreats } = await import('@/services/api');
		(getPublicRetreats as any).mockResolvedValue([]);

		const { getPublicCommunities } = await import('@/services/api');
		(getPublicCommunities as any).mockResolvedValue([]);

		const { getPublicCommunityMeetings } = await import('@/services/api');
		(getPublicCommunityMeetings as any).mockResolvedValue([]);

		const { getLandingTestimonials } = await import('@/services/api');
		(getLandingTestimonials as any).mockResolvedValue([]);

		wrapper = createTestWrapper(LandingView, {
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
		vi.clearAllMocks();
	});

	describe('Rendering', () => {
		it('should render the landing component', () => {
			expect(wrapper.exists()).toBe(true);
		});

		it('should render navigation bar', () => {
			const nav = wrapper.find('nav');
			expect(nav.exists()).toBe(true);
		});

		it('should render Emmaus logo', () => {
			const logoImg = wrapper.find('img[src="/crossRoseButtT.png"]');
			expect(logoImg.exists()).toBe(true);
		});
	});

	describe('handleLoginClick Function', () => {
		it('should redirect to login page when user is not authenticated', async () => {
			const { useAuthStore: useAuthStoreImport } = await import('@/stores/authStore');
			const { api } = await import('@/services/api');
			const authStore = useAuthStoreImport();

			// Ensure user is not authenticated
			authStore.isAuthenticated = false;
			authStore.user = null;
			authStore.userProfile = null;

			(api.get as any).mockResolvedValue({
				data: { authenticated: false },
			});

			// Find and click login button
			const loginButtons = wrapper.findAll('button').filter((btn) => {
				const text = btn.text();
				return text.includes('landing.loginLink') || text.includes('landing.signupLink');
			});

			if (loginButtons.length > 0) {
				await loginButtons[0].trigger('click');
				await nextTick();

				// Wait for async operations
				await new Promise((resolve) => setTimeout(resolve, 50));
				await nextTick();

				// Should redirect to login page
				expect(mockPush).toHaveBeenCalledWith('/login');
			}
		});

		it('should redirect to dashboard when user is already authenticated', async () => {
			const { useAuthStore: useAuthStoreImport } = await import('@/stores/authStore');
			const { useRetreatStore: useRetreatStoreImport } = await import('@/stores/retreatStore');
			const { api } = await import('@/services/api');

			const authStore = useAuthStoreImport();
			const retreatStore = useRetreatStoreImport();

			// Set user as authenticated
			const mockUser = createMockUser();
			authStore.isAuthenticated = true;
			authStore.user = mockUser;
			authStore.userProfile = mockUser;

			(api.get as any).mockResolvedValue({
				data: {
					...mockUser,
					profile: mockUser,
				},
			});

			// Mock retreats
			const mockRetreat = createMockRetreat({ id: 'retreat-456' });
			(api.get as any).mockResolvedValue({
				data: [mockRetreat],
			});

			// Find and click login button
			const loginButtons = wrapper.findAll('button').filter((btn) => {
				const text = btn.text();
				return text.includes('landing.loginLink') || text.includes('landing.signupLink');
			});

			if (loginButtons.length > 0) {
				await loginButtons[0].trigger('click');
				await nextTick();

				// Wait for async operations
				await new Promise((resolve) => setTimeout(resolve, 100));
				await nextTick();

				// Should redirect to dashboard with retreat ID
				expect(mockPush).toHaveBeenCalledWith({
					name: 'retreat-dashboard',
					params: { id: 'retreat-456' },
				});
			}
		});

		it('should redirect to /app when authenticated but no retreats exist', async () => {
			const { useAuthStore: useAuthStoreImport } = await import('@/stores/authStore');
			const { useRetreatStore: useRetreatStoreImport } = await import('@/stores/retreatStore');
			const { api } = await import('@/services/api');

			const authStore = useAuthStoreImport();
			const retreatStore = useRetreatStoreImport();

			// Set user as authenticated
			const mockUser = createMockUser();
			authStore.isAuthenticated = true;
			authStore.user = mockUser;
			authStore.userProfile = mockUser;

			(api.get as any).mockResolvedValue({
				data: {
					...mockUser,
					profile: mockUser,
				},
			});

			// Mock empty retreats
			(api.get as any).mockResolvedValue({
				data: [],
			});

			// Find and click login button
			const loginButtons = wrapper.findAll('button').filter((btn) => {
				const text = btn.text();
				return text.includes('landing.loginLink') || text.includes('landing.signupLink');
			});

			if (loginButtons.length > 0) {
				await loginButtons[0].trigger('click');
				await nextTick();

				// Wait for async operations
				await new Promise((resolve) => setTimeout(resolve, 100));
				await nextTick();

				// Should redirect to /app
				expect(mockPush).toHaveBeenCalledWith('/app');
			}
		});

		it('should check auth status before redirecting', async () => {
			const { useAuthStore: useAuthStoreImport } = await import('@/stores/authStore');
			const { api } = await import('@/services/api');
			const authStore = useAuthStoreImport();

			const checkAuthSpy = vi.spyOn(authStore, 'checkAuthStatus');

			// Mock unauthenticated user
			(api.get as any).mockResolvedValue({
				data: { authenticated: false },
			});

			// Find and click login button
			const loginButtons = wrapper.findAll('button').filter((btn) => {
				const text = btn.text();
				return text.includes('landing.loginLink') || text.includes('landing.signupLink');
			});

			if (loginButtons.length > 0) {
				await loginButtons[0].trigger('click');
				await nextTick();

				// Wait for async operations
				await new Promise((resolve) => setTimeout(resolve, 50));
				await nextTick();

				// Should have called checkAuthStatus
				expect(checkAuthSpy).toHaveBeenCalled();
			}
		});
	});

	describe('Login Buttons', () => {
		it('should render login link button', () => {
			const buttons = wrapper
				.findAll('button')
				.filter((btn) => btn.text().includes('landing.loginLink'));
			expect(buttons.length).toBeGreaterThan(0);
		});

		it('should render signup button', () => {
			const buttons = wrapper
				.findAll('button')
				.filter((btn) => btn.text().includes('landing.signupLink'));
			expect(buttons.length).toBeGreaterThan(0);
		});

		it('should use button elements with click handlers instead of router-link', () => {
			const buttons = wrapper.findAll('button');

			// Find login-related buttons
			const loginButtons = buttons.filter((btn) => {
				const text = btn.text();
				return text.includes('landing.loginLink') || text.includes('landing.signupLink');
			});

			loginButtons.forEach((button) => {
				// Should be a button element, not a router-link
				expect(button.element.tagName.toLowerCase()).toBe('button');
			});
		});
	});

	describe('Stories Section', () => {
		it('should render the stories section with id="stories"', () => {
			const storiesSection = wrapper.find('#stories');
			expect(storiesSection.exists()).toBe(true);
		});

		it('should show empty state when no testimonials are available', async () => {
			const { getLandingTestimonials } = await import('@/services/api');
			(getLandingTestimonials as any).mockResolvedValue([]);

			wrapper = createTestWrapper(LandingView, {
				global: {
					mocks: {
						$t: (key: string) => key,
					},
				},
			});

			await nextTick();
			await new Promise((resolve) => setTimeout(resolve, 100));

			const storiesSection = wrapper.find('#stories');
			const emptyState = storiesSection?.text();
			expect(emptyState).toContain('landing.noStories');
		});

		it('should display testimonials when available', async () => {
			const { getLandingTestimonials } = await import('@/services/api');

			const mockTestimonials = [
				{
					id: 1,
					content: 'This was an amazing experience!',
					createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
					approvedForLanding: true,
					user: {
						displayName: 'John Doe',
						photo: null,
					},
					retreat: {
						parish: "St. Mary's Parish",
					},
				},
				{
					id: 2,
					content: 'Life changing retreat!',
					createdAt: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString(),
					approvedForLanding: true,
					user: {
						displayName: 'Jane Smith',
						photo: 'https://example.com/avatar.jpg',
					},
					retreat: null,
				},
			];

			(getLandingTestimonials as any).mockResolvedValue(mockTestimonials);

			wrapper = createTestWrapper(LandingView, {
				global: {
					mocks: {
						$t: (key: string) => key,
					},
				},
			});

			await nextTick();
			await new Promise((resolve) => setTimeout(resolve, 100));

			const storiesSection = wrapper.find('#stories');
			const text = storiesSection?.text() || '';
			expect(text).toContain('John Doe');
			expect(text).toContain('Jane Smith');
		});

		it('should show loading state while fetching testimonials', async () => {
			const { getLandingTestimonials } = await import('@/services/api');

			// Create a promise that we can control
			let resolveTestimonials: any;
			const testimonialPromise = new Promise((resolve) => {
				resolveTestimonials = resolve;
			});

			(getLandingTestimonials as any).mockReturnValue(testimonialPromise);

			wrapper = createTestWrapper(LandingView, {
				global: {
					mocks: {
						$t: (key: string) => key,
					},
				},
			});

			await nextTick();

			const storiesSection = wrapper.find('#stories');
			// Should show loading spinner
			const spinner = storiesSection?.find('.animate-spin');
			expect(spinner?.exists()).toBe(true);

			// Resolve the promise
			resolveTestimonials([]);
			await nextTick();
			await new Promise((resolve) => setTimeout(resolve, 50));
		});

		it('should show login CTA when user is not authenticated', async () => {
			const { useAuthStore: useAuthStoreImport } = await import('@/stores/authStore');
			const { getLandingTestimonials } = await import('@/services/api');

			(getLandingTestimonials as any).mockResolvedValue([]);

			const authStore = useAuthStoreImport();
			authStore.isAuthenticated = false;
			authStore.user = null;

			wrapper = createTestWrapper(LandingView, {
				global: {
					mocks: {
						$t: (key: string) => key,
					},
				},
			});

			await nextTick();
			await new Promise((resolve) => setTimeout(resolve, 100));

			const storiesSection = wrapper.find('#stories');
			const text = storiesSection?.text() || '';
			expect(text).toContain('landing.shareYourStory');
			expect(text).toContain('landing.loginToShare');
		});

		it('should not show login CTA when user is authenticated', async () => {
			const { useAuthStore: useAuthStoreImport } = await import('@/stores/authStore');
			const { getLandingTestimonials } = await import('@/services/api');

			(getLandingTestimonials as any).mockResolvedValue([]);

			// Create a fresh pinia instance for this test
			const testPinia = createPinia();
			setActivePinia(testPinia);

			// Get auth store and set authenticated state
			const authStore = useAuthStoreImport();
			authStore.isAuthenticated = true;
			authStore.user = createMockUser();

			// Create wrapper with the test pinia instance that has auth state set
			wrapper = mount(LandingView, {
				global: {
					plugins: [testPinia],
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
			await new Promise((resolve) => setTimeout(resolve, 150));
			await nextTick();

			const storiesSection = wrapper.find('#stories');
			const text = storiesSection?.text() || '';

			// Verify the CTA is NOT present when authenticated
			expect(text).not.toContain('landing.shareYourStory');
			expect(text).not.toContain('landing.loginToShare');
		});

		it('should display user initials when no photo is available', async () => {
			const { getLandingTestimonials } = await import('@/services/api');

			const mockTestimonials = [
				{
					id: 1,
					content: 'Great experience!',
					createdAt: new Date().toISOString(),
					approvedForLanding: true,
					user: {
						displayName: 'Maria Garcia',
						photo: null,
					},
					retreat: null,
				},
			];

			(getLandingTestimonials as any).mockResolvedValue(mockTestimonials);

			wrapper = createTestWrapper(LandingView, {
				global: {
					mocks: {
						$t: (key: string) => key,
					},
				},
			});

			await nextTick();
			await new Promise((resolve) => setTimeout(resolve, 100));

			const storiesSection = wrapper.find('#stories');
			const text = storiesSection?.text() || '';
			expect(text).toContain('MG'); // Maria Garcia -> MG
		});

		it('should display retreat parish when retreat is associated', async () => {
			const { getLandingTestimonials } = await import('@/services/api');

			const mockTestimonials = [
				{
					id: 1,
					content: 'Great experience!',
					createdAt: new Date().toISOString(),
					approvedForLanding: true,
					user: {
						displayName: 'Test User',
						photo: null,
					},
					retreat: {
						parish: 'Holy Cross Church',
					},
				},
			];

			(getLandingTestimonials as any).mockResolvedValue(mockTestimonials);

			wrapper = createTestWrapper(LandingView, {
				global: {
					mocks: {
						$t: (key: string) => key,
					},
				},
			});

			await nextTick();
			await new Promise((resolve) => setTimeout(resolve, 100));

			const storiesSection = wrapper.find('#stories');
			const text = storiesSection?.text() || '';
			expect(text).toContain('Holy Cross Church');
		});

		it('should call getLandingTestimonials on mount', async () => {
			const { getLandingTestimonials } = await import('@/services/api');

			wrapper = createTestWrapper(LandingView, {
				global: {
					mocks: {
						$t: (key: string) => key,
					},
				},
			});

			await nextTick();
			await new Promise((resolve) => setTimeout(resolve, 50));

			expect(getLandingTestimonials).toHaveBeenCalled();
		});

		it('should render stories section with correct styling', () => {
			const storiesSection = wrapper.find('#stories');
			expect(storiesSection.exists()).toBe(true);

			// Check for section styling classes
			const sectionElement = storiesSection?.element as HTMLElement;
			expect(sectionElement?.classList.contains('py-24')).toBe(true);
			expect(sectionElement?.classList.contains('px-6')).toBe(true);
			expect(sectionElement?.classList.contains('bg-stone-50')).toBe(true);
		});
	});
});
