import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { mount, VueWrapper } from '@vue/test-utils';
import { nextTick } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import LandingView from '../LandingView.vue';
import { createTestWrapper, createMockUser, createMockRetreat, cleanupMocks } from '@/test/utils';

// ─── Helpers ────────────────────────────────────────────────────────────────

const makeCommunity = (overrides: Record<string, any> = {}) => ({
	id: `c-${Math.random().toString(36).slice(2)}`,
	name: 'Comunidad Emaús',
	city: 'Ciudad de México',
	state: 'CDMX',
	latitude: 19.4326,
	longitude: -99.1332,
	...overrides,
});

const makeMeeting = (community: ReturnType<typeof makeCommunity>, overrides: Record<string, any> = {}) => ({
	id: `m-${Math.random().toString(36).slice(2)}`,
	title: 'Reunión semanal',
	startDate: new Date(Date.now() + 86_400_000).toISOString(),
	community,
	...overrides,
});

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
	Loader2: { template: '<div data-icon="Loader2" />' },
}));

// Mock the modal components
vi.mock('@/components/community/PublicJoinRequestModal.vue', () => ({
	default: { template: '<div>JoinRequestModal</div>' },
}));

vi.mock('@/components/PublicRetreatFlyerModal.vue', () => ({
	default: { template: '<div>RetreatFlyerModal</div>' },
}));

// Mock Leaflet map — expone los pins como botones con [title] para tests.
// Reemplazamos también defineAsyncComponent para resolver síncronamente.
const CommunityMapMock = {
	name: 'CommunityMap',
	props: ['communities', 'userLocation'],
	emits: ['select-community'],
	template: `
		<div data-test="community-map">
			<button
				v-for="c in communities.slice(0, 4)"
				:key="c.id"
				:title="c.name"
				@click="$emit('select-community', c.id, c.name)"
			>{{ c.name }}</button>
		</div>
	`,
};

vi.mock('@/components/landing/CommunityMap.vue', () => ({
	default: CommunityMapMock,
}));

// Mock para defineAsyncComponent: resuelve el loader inline para tests síncronos.
// Para el LandingView esto cubre CommunityMap.vue y CommunityDetailModal.vue
// (ambos cargados con defineAsyncComponent). Ambos están mockeados con vi.mock arriba.
const CommunityDetailModalMock = {
	name: 'CommunityDetailModal',
	props: ['open', 'community', 'distance'],
	emits: ['update:open', 'join'],
	template: '<div v-if="open" data-test="community-detail-modal">{{ community?.name }}</div>',
};

vi.mock('@/components/landing/CommunityDetailModal.vue', () => ({
	default: CommunityDetailModalMock,
}));

vi.mock('vue', async () => {
	const actual = await vi.importActual<typeof import('vue')>('vue');
	return {
		...actual,
		// Resolver lazy components a su mock síncrono según el loader que reciben
		defineAsyncComponent: (loader: any) => {
			// Inspeccionar el string del loader para decidir cuál devolver
			const src = typeof loader === 'function' ? loader.toString() : '';
			if (src.includes('CommunityDetailModal')) return CommunityDetailModalMock;
			return CommunityMapMock; // fallback (incluye CommunityMap)
		},
	};
});

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

	// ─── Community Search ──────────────────────────────────────────────────────

	describe('Community Search', () => {
		// Helper: espera el debounce de searchQuery (200ms en el componente)
		const flushDebounce = async () => {
			await new Promise((r) => setTimeout(r, 250));
			await nextTick();
		};

		const mountWithCommunities = async (communities: any[], meetings: any[] = []) => {
			const { getPublicCommunities, getPublicCommunityMeetings } = await import('@/services/api');
			(getPublicCommunities as any).mockResolvedValue(communities);
			(getPublicCommunityMeetings as any).mockResolvedValue(meetings);

			const w = createTestWrapper(LandingView, {
				global: { mocks: { $t: (key: string, p?: any) => (p ? `${key}:${JSON.stringify(p)}` : key) } },
			});
			await nextTick();
			await new Promise((r) => setTimeout(r, 100));
			return w;
		};

		afterEach(() => {
			// Restore geolocation after each test that may mock it
			vi.restoreAllMocks();
		});

		// ── Carga de datos ──────────────────────────────────────────────────

		it('muestra las primeras 4 comunidades como pines en el mapa por defecto', async () => {
			const communities = [
				makeCommunity({ name: 'Alpha' }),
				makeCommunity({ name: 'Beta' }),
				makeCommunity({ name: 'Gamma' }),
				makeCommunity({ name: 'Delta' }),
				makeCommunity({ name: 'Epsilon' }),
			];
			const w = await mountWithCommunities(communities);
			const section = w.find('#community');

			// Los 4 primeros deben aparecer como pines (botones con title)
			const pins = section.findAll('button[title]');
			expect(pins.length).toBe(4);
			expect(pins[0].attributes('title')).toBe('Alpha');
			expect(pins[3].attributes('title')).toBe('Delta');

			w.unmount();
		});

		it('muestra el nombre de la primera comunidad en la tarjeta inferior', async () => {
			const communities = [makeCommunity({ name: 'Emaús Querétaro', city: 'Juriquilla', state: 'Querétaro' })];
			const w = await mountWithCommunities(communities);
			const section = w.find('#community');

			expect(section.text()).toContain('Emaús Querétaro');
			expect(section.text()).toContain('Juriquilla');
			w.unmount();
		});

		it('llama a getPublicCommunities al montar', async () => {
			const { getPublicCommunities } = await import('@/services/api');
			(getPublicCommunities as any).mockResolvedValue([]);
			const w = await mountWithCommunities([]);
			expect(getPublicCommunities).toHaveBeenCalled();
			w.unmount();
		});

		// ── Búsqueda por texto ──────────────────────────────────────────────

		it('filtra comunidades por nombre al escribir en el input', async () => {
			const communities = [
				makeCommunity({ name: 'Emaús Querétaro', city: 'Querétaro', state: 'Querétaro' }),
				makeCommunity({ name: 'Emaús CDMX', city: 'Ciudad de México', state: 'CDMX' }),
			];
			const w = await mountWithCommunities(communities);
			const input = w.find('input[type="search"]');

			await input.setValue('Querétaro');
			await flushDebounce();

			const section = w.find('#community');
			const pins = section.findAll('button[title]');
			expect(pins.length).toBe(1);
			expect(pins[0].attributes('title')).toBe('Emaús Querétaro');
			w.unmount();
		});

		it('filtra comunidades por ciudad (case-insensitive)', async () => {
			const communities = [
				makeCommunity({ name: 'Grupo Norte', city: 'Monterrey', state: 'NL' }),
				makeCommunity({ name: 'Grupo Sur', city: 'Guadalajara', state: 'Jalisco' }),
			];
			const w = await mountWithCommunities(communities);
			const input = w.find('input[type="search"]');

			await input.setValue('guadalajara');
			await flushDebounce();

			const section = w.find('#community');
			const pins = section.findAll('button[title]');
			expect(pins.length).toBe(1);
			expect(pins[0].attributes('title')).toBe('Grupo Sur');
			w.unmount();
		});

		it('filtra comunidades por estado', async () => {
			const communities = [
				makeCommunity({ name: 'Emaús Jalisco', city: 'Guadalajara', state: 'Jalisco' }),
				makeCommunity({ name: 'Emaús CDMX', city: 'Ciudad de México', state: 'CDMX' }),
			];
			const w = await mountWithCommunities(communities);
			const input = w.find('input[type="search"]');

			await input.setValue('Jalisco');
			await flushDebounce();

			const section = w.find('#community');
			const pins = section.findAll('button[title]');
			expect(pins.length).toBe(1);
			expect(pins[0].attributes('title')).toBe('Emaús Jalisco');
			w.unmount();
		});

		it('muestra 0 pines y estado vacío cuando la búsqueda no coincide', async () => {
			const communities = [makeCommunity({ name: 'Emaús CDMX', city: 'CDMX', state: 'CDMX' })];
			const w = await mountWithCommunities(communities);
			const input = w.find('input[type="search"]');

			await input.setValue('xyz_no_existe_123');
			await flushDebounce();

			const section = w.find('#community');
			const pins = section.findAll('button[title]');
			expect(pins.length).toBe(0);

			// Debe mostrar mensaje de estado vacío
			expect(section.text()).toContain('landing.noCommunitiesFound');
			w.unmount();
		});

		it('restaura todos los pines al limpiar el input', async () => {
			const communities = [
				makeCommunity({ name: 'Alpha' }),
				makeCommunity({ name: 'Beta' }),
			];
			const w = await mountWithCommunities(communities);
			const input = w.find('input[type="search"]');

			await input.setValue('Alpha');
			await flushDebounce();
			expect(w.find('#community').findAll('button[title]').length).toBe(1);

			await input.setValue('');
			await flushDebounce();
			expect(w.find('#community').findAll('button[title]').length).toBe(2);
			w.unmount();
		});

		// ── Botón Limpiar ───────────────────────────────────────────────────

		it('muestra botón Limpiar cuando hay texto en el input', async () => {
			const w = await mountWithCommunities([makeCommunity()]);
			const input = w.find('input[type="search"]');

			await input.setValue('algo');
			await flushDebounce();

			const clearBtn = w.findAll('button').find((b) => b.text().includes('landing.clearSearch'));
			expect(clearBtn?.exists()).toBe(true);
			w.unmount();
		});

		it('no muestra botón Limpiar cuando el input está vacío sin geolocalización', async () => {
			const w = await mountWithCommunities([makeCommunity()]);

			const clearBtn = w.findAll('button').find((b) => b.text().includes('landing.clearSearch'));
			expect(clearBtn?.exists()).toBeFalsy();
			w.unmount();
		});

		it('el botón Limpiar resetea el input y restaura todas las comunidades', async () => {
			const communities = [makeCommunity({ name: 'Alpha' }), makeCommunity({ name: 'Beta' })];
			const w = await mountWithCommunities(communities);
			const input = w.find('input[type="search"]');

			await input.setValue('Alpha');
			await flushDebounce();
			expect(w.find('#community').findAll('button[title]').length).toBe(1);

			const clearBtn = w.findAll('button').find((b) => b.text().includes('landing.clearSearch'));
			await clearBtn!.trigger('click');
			await flushDebounce();

			expect((input.element as HTMLInputElement).value).toBe('');
			expect(w.find('#community').findAll('button[title]').length).toBe(2);
			w.unmount();
		});

		// ── Contador de resultados ──────────────────────────────────────────

		it('muestra el contador de resultados solo cuando hay filtro activo', async () => {
			const communities = [makeCommunity({ name: 'Alpha' }), makeCommunity({ name: 'Beta' })];
			const w = await mountWithCommunities(communities);

			// Sin filtro: no debe mostrar contador
			expect(w.text()).not.toContain('landing.communitiesFound');

			const input = w.find('input[type="search"]');
			await input.setValue('Alpha');
			await flushDebounce();

			// Con filtro: debe mostrar contador con count=1
			expect(w.text()).toContain('landing.communitiesFound');
			w.unmount();
		});

		// ── Geolocalización ─────────────────────────────────────────────────

		it('llama a getCurrentPosition silenciosamente al montar', async () => {
			const mockGetCurrentPosition = vi.fn();
			Object.defineProperty(navigator, 'geolocation', {
				value: { getCurrentPosition: mockGetCurrentPosition },
				configurable: true,
			});

			const w = await mountWithCommunities([makeCommunity()]);
			expect(mockGetCurrentPosition).toHaveBeenCalled();
			w.unmount();
		});

		it('no muestra error cuando getCurrentPosition es denegado', async () => {
			const mockToast = vi.fn();
			vi.mocked(await import('@repo/ui')).useToast = () => ({ toast: mockToast } as any);

			Object.defineProperty(navigator, 'geolocation', {
				value: {
					getCurrentPosition: (_success: any, error: any) => error(new Error('denied')),
				},
				configurable: true,
			});

			const w = await mountWithCommunities([makeCommunity()]);
			// El toast de error NO debe haberse llamado en detectLocationSilently
			expect(mockToast).not.toHaveBeenCalled();
			w.unmount();
		});

		it('ordena comunidades por distancia cuando la geolocalización es exitosa', async () => {
			// CDMX ~19.43, -99.13 → la más cercana debe aparecer primero
			const cdmx = makeCommunity({ name: 'CDMX', latitude: 19.4326, longitude: -99.1332 });
			const cancun = makeCommunity({ name: 'Cancún', latitude: 21.1619, longitude: -86.8515 });
			const bogota = makeCommunity({ name: 'Bogotá', latitude: 4.711, longitude: -74.0721 });

			Object.defineProperty(navigator, 'geolocation', {
				value: {
					getCurrentPosition: (success: any) =>
						success({ coords: { latitude: 19.43, longitude: -99.13 } }),
				},
				configurable: true,
			});

			// Entregar en orden aleatorio: Bogotá, Cancún, CDMX
			const w = await mountWithCommunities([bogota, cancun, cdmx]);
			await nextTick();
			await new Promise((r) => setTimeout(r, 50));

			const pins = w.find('#community').findAll('button[title]');
			// El primer pin debe ser la más cercana (CDMX)
			expect(pins[0].attributes('title')).toBe('CDMX');
			// La más lejana (Bogotá) debe ir al final
			expect(pins[2].attributes('title')).toBe('Bogotá');
			w.unmount();
		});

		it('muestra la distancia en la tarjeta inferior cuando hay geolocalización', async () => {
			Object.defineProperty(navigator, 'geolocation', {
				value: {
					getCurrentPosition: (success: any) =>
						success({ coords: { latitude: 19.4326, longitude: -99.1332 } }),
				},
				configurable: true,
			});

			// Comunidad a ~1.6 km del centro de CDMX (19.4326, -99.1332)
			const nearby = makeCommunity({ name: 'Cerca', latitude: 19.4383, longitude: -99.1357 });
			const w = await mountWithCommunities([nearby]);
			await nextTick();
			await new Promise((r) => setTimeout(r, 50));

			const cardText = w.find('#community').text();
			// Debe incluir un valor en km o m
			expect(cardText).toMatch(/\d+(\.\d+)?\s*(km|m)/);
			w.unmount();
		});

		it('el botón Usar Mi Ubicación muestra spinner mientras geolocalizando', async () => {
			// getCurrentPosition que nunca resuelve (pending)
			Object.defineProperty(navigator, 'geolocation', {
				value: { getCurrentPosition: vi.fn() }, // no llama ni success ni error
				configurable: true,
			});

			const w = await mountWithCommunities([makeCommunity()]);

			// Hacer click en el botón de ubicación
			const locationBtn = w.findAll('button').find((b) =>
				b.text().includes('landing.useMyLocation')
			);
			await locationBtn!.trigger('click');
			await nextTick();

			// Debe mostrar el ícono de spinner (Loader2)
			expect(w.find('[data-icon="Loader2"]').exists()).toBe(true);
			w.unmount();
		});

		// ── filteredMeetings ────────────────────────────────────────────────

		it('filtra la tabla de reuniones según las comunidades encontradas', async () => {
			const comQro = makeCommunity({ id: 'qro', name: 'Emaús Querétaro', city: 'Querétaro', state: 'Querétaro' });
			const comMx = makeCommunity({ id: 'mx', name: 'Emaús CDMX', city: 'CDMX', state: 'CDMX' });
			const meetings = [makeMeeting(comQro), makeMeeting(comMx)];

			const w = await mountWithCommunities([comQro, comMx], meetings);

			// Sin filtro: ambas reuniones
			// (La tabla muestra text de la comunidad)
			expect(w.text()).toContain('Emaús Querétaro');
			expect(w.text()).toContain('Emaús CDMX');

			// Filtrar por Querétaro
			await w.find('input[type="search"]').setValue('Querétaro');
			await flushDebounce();
			await nextTick();

			expect(w.text()).toContain('Emaús Querétaro');
			expect(w.text()).not.toContain('Emaús CDMX');
			w.unmount();
		});

		it('ordena la tabla de reuniones por cercanía cuando hay geolocalización', async () => {
			// Yo estoy en CDMX
			const cdmx = makeCommunity({ id: 'mx', name: 'Emaús CDMX', latitude: 19.43, longitude: -99.13 });
			const cancun = makeCommunity({ id: 'cn', name: 'Emaús Cancún', latitude: 21.16, longitude: -86.85 });

			// Las meetings vienen en orden inverso (Cancún primero)
			const meetings = [makeMeeting(cancun, { title: 'Reunión Cancún' }), makeMeeting(cdmx, { title: 'Reunión CDMX' })];

			Object.defineProperty(navigator, 'geolocation', {
				value: {
					getCurrentPosition: (success: any) =>
						success({ coords: { latitude: 19.43, longitude: -99.13 } }),
				},
				configurable: true,
			});

			const w = await mountWithCommunities([cancun, cdmx], meetings);
			await nextTick();
			await new Promise((r) => setTimeout(r, 50));

			// La tabla debe listar CDMX antes que Cancún (más cercano primero)
			const rows = w.findAll('tbody tr');
			expect(rows.length).toBe(2);
			expect(rows[0].text()).toContain('Emaús CDMX');
			expect(rows[1].text()).toContain('Emaús Cancún');
			w.unmount();
		});

		it('ordena la tabla de reuniones por relevancia de búsqueda (las que matchean primero)', async () => {
			const qro = makeCommunity({ id: 'q', name: 'Emaús Querétaro' });
			const mx = makeCommunity({ id: 'm', name: 'Emaús CDMX' });
			// Meeting de CDMX antes de Querétaro en el orden del API
			const meetings = [makeMeeting(mx, { title: 'CDMX meeting' }), makeMeeting(qro, { title: 'Qro meeting' })];

			const w = await mountWithCommunities([qro, mx], meetings);
			// Buscar Querétaro: la tabla debe mostrar solo Qro
			await w.find('input[type="search"]').setValue('Querétaro');
			await flushDebounce();
			await nextTick();

			const rows = w.findAll('tbody tr');
			expect(rows.length).toBe(1);
			expect(rows[0].text()).toContain('Emaús Querétaro');
			w.unmount();
		});

		// ── Nueva lógica: fallback a default meeting + límite 20 ────────────

		it('muestra fila por cada comunidad filtrada aunque no tenga meeting próximo', async () => {
			const comQro = makeCommunity({
				id: 'qro',
				name: 'Emaús Querétaro',
				defaultMeetingDayOfWeek: 'tuesday',
				defaultMeetingTime: '20:00',
			});
			// Sin meetings en absoluto
			const w = await mountWithCommunities([comQro], []);
			await w.find('input[type="search"]').setValue('Querétaro');
			await flushDebounce();

			// La tabla debe tener una fila con la comunidad
			const rows = w.findAll('tbody tr');
			expect(rows.length).toBe(1);
			expect(rows[0].text()).toContain('Emaús Querétaro');
			// Y mostrar el day/time del default meeting
			expect(rows[0].text()).toContain('landing.detail.days.tuesday');
			expect(rows[0].text()).toContain('20:00');
			w.unmount();
		});

		it('limita la tabla de horarios a 20 comunidades', async () => {
			// 25 comunidades sin meetings (todas fallback a default)
			const communities = Array.from({ length: 25 }, (_, i) =>
				makeCommunity({ id: `c-${i}`, name: `Comunidad ${i}`, defaultMeetingDayOfWeek: 'monday' })
			);
			const w = await mountWithCommunities(communities, []);
			await nextTick();

			const rows = w.findAll('tbody tr');
			expect(rows.length).toBe(20);
			w.unmount();
		});

		it('muestra indicador "X de Y" cuando filteredCommunities supera el límite', async () => {
			const communities = Array.from({ length: 23 }, (_, i) =>
				makeCommunity({ id: `c-${i}`, name: `Comunidad ${i}` })
			);
			const w = await mountWithCommunities(communities, []);
			await nextTick();

			expect(w.text()).toContain('landing.showingXofY');
			w.unmount();
		});

		it('NO muestra indicador "X de Y" cuando filteredCommunities está bajo el límite', async () => {
			const communities = Array.from({ length: 5 }, (_, i) =>
				makeCommunity({ id: `c-${i}`, name: `Comunidad ${i}` })
			);
			const w = await mountWithCommunities(communities, []);
			await nextTick();

			expect(w.text()).not.toContain('landing.showingXofY');
			w.unmount();
		});

		it('el meeting real prevalece sobre el default meeting de la comunidad', async () => {
			const comQro = makeCommunity({
				id: 'qro',
				name: 'Emaús Querétaro',
				defaultMeetingDayOfWeek: 'monday',
				defaultMeetingTime: '20:00',
			});
			// Meeting real específico
			const realMeeting = makeMeeting(comQro, { title: 'Reunión especial' });
			const w = await mountWithCommunities([comQro], [realMeeting]);
			await nextTick();

			const rows = w.findAll('tbody tr');
			expect(rows.length).toBe(1);
			// Debe usar formatMeetingDate/Time, no el default (monday 20:00)
			const text = rows[0].text();
			expect(text).toContain('Emaús Querétaro');
			// El default day "Monday" del fallback NO debe estar (el real meeting es otra fecha)
			expect(text).not.toContain('landing.detail.days.monday');
			w.unmount();
		});

		it('comunidades sin lat/lng se marcan en la tabla', async () => {
			const com = makeCommunity({
				id: 'no-coords',
				name: 'Sin Coords',
				latitude: null as any,
				longitude: null as any,
			});
			const w = await mountWithCommunities([com], []);
			await nextTick();

			const rows = w.findAll('tbody tr');
			expect(rows[0].text()).toContain('landing.noLocation');
			w.unmount();
		});

		// ── geolocationDenied state ─────────────────────────────────────────

		it('cuando se deniega permiso de geolocalización muestra estado persistente', async () => {
			Object.defineProperty(navigator, 'geolocation', {
				value: {
					getCurrentPosition: (_success: any, error: any) => error({ code: 1 }), // PERMISSION_DENIED
				},
				configurable: true,
			});

			const w = await mountWithCommunities([makeCommunity()]);
			// detectLocationSilently corre on mount y debe setear geolocationDenied
			await new Promise((r) => setTimeout(r, 50));
			await nextTick();

			expect(w.text()).toContain('landing.geoDenied');
			w.unmount();
		});

		it('muestra "no hay reuniones" cuando el filtro excluye todas las comunidades con reunión', async () => {
			const comMx = makeCommunity({ id: 'mx', name: 'Emaús CDMX', city: 'CDMX', state: 'CDMX' });
			const meetings = [makeMeeting(comMx)];

			const w = await mountWithCommunities([comMx], meetings);
			await w.find('input[type="search"]').setValue('xyz_inexistente');
			await flushDebounce();
			await nextTick();

			expect(w.text()).toContain('landing.noUpcomingMeetings');
			w.unmount();
		});
	});
});
