import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
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
const mockRouterPush = vi.fn();
const mockRouteParams = { id: 'community-1', meetingId: 'meeting-1' };
vi.mock('vue-router', () => ({
	useRouter: () => ({
		push: mockRouterPush,
		replace: vi.fn(),
		resolve: vi.fn(() => ({ href: '/test-route' })),
	}),
	useRoute: () => ({
		name: 'community-meeting-flyer',
		params: mockRouteParams,
		path: '/app/communities/community-1/meetings/meeting-1/flyer',
	}),
}));

// Mock qrcode.vue (the location block renders a QR canvas)
vi.mock('qrcode.vue', () => ({
	default: { name: 'QrcodeVue', template: '<canvas />', props: ['value', 'size'] },
}));

// Local lucide mock: the global one is a fixed allowlist and this view's icons
// (plus its blocks') are not all on it.
vi.mock('lucide-vue-next', () => ({
	Printer: { name: 'Printer', template: '<svg></svg>' },
	Pencil: { name: 'Pencil', template: '<svg></svg>' },
	ArrowLeft: { name: 'ArrowLeft', template: '<svg></svg>' },
	LayoutTemplate: { name: 'LayoutTemplate', template: '<svg></svg>' },
	Image: { name: 'Image', template: '<svg></svg>' },
	MessageCircle: { name: 'MessageCircle', template: '<svg></svg>' },
	Copy: { name: 'Copy', template: '<svg></svg>' },
	Check: { name: 'Check', template: '<svg></svg>' },
	Loader2: { name: 'Loader2', template: '<svg></svg>' },
	ChevronRight: { name: 'ChevronRight', template: '<svg></svg>' },
	RotateCcw: { name: 'RotateCcw', template: '<svg></svg>' },
	Upload: { name: 'Upload', template: '<svg></svg>' },
	Palette: { name: 'Palette', template: '<svg></svg>' },
	Calendar: { name: 'Calendar', template: '<svg></svg>' },
	MapPin: { name: 'MapPin', template: '<svg></svg>' },
	FileText: { name: 'FileText', template: '<svg></svg>' },
}));

import CommunityMeetingFlyerView from '../CommunityMeetingFlyerView.vue';
import { useCommunityStore } from '@/stores/communityStore';

const BASE_MEETING = {
	id: 'meeting-1',
	title: 'Convivencia de Adviento',
	description: 'Una tarde para compartir',
	startDate: '2026-12-05T18:00:00.000Z',
	durationMinutes: 120,
	isAnnouncement: false,
	flyerTemplate: '',
};

const BASE_COMMUNITY = {
	id: 'community-1',
	name: 'buen despacho',
	address1: 'Parroquia El Señor del Buen Despacho',
	city: 'Ciudad de México',
	state: 'CDMX',
	country: 'México',
	googleMapsUrl: 'https://maps.google.com/?cid=123',
	flyerBackgroundUrl: null,
	flyerCardOpacity: 0.8,
	flyerOptions: null,
};

/**
 * The style lives in localStorage and the view reads it during setup, so it has
 * to be seeded before mounting. Fetches are spied to no-ops: the view copies the
 * store state after awaiting them, and the store already holds the fixture.
 */
function mountFlyer({
	community = {},
	meeting = {},
	style = 'default',
}: { community?: Record<string, any>; meeting?: Record<string, any>; style?: string } = {}) {
	localStorage.setItem('emaus_flyer_style', style);
	const pinia = createPinia();
	setActivePinia(pinia);

	const communityStore = useCommunityStore(pinia);
	communityStore.currentCommunity = { ...BASE_COMMUNITY, ...community };
	communityStore.meetings = [{ ...BASE_MEETING, ...meeting }];
	communityStore.fetchCommunity = vi.fn(async () => {});
	communityStore.fetchMeetings = vi.fn(async () => {});

	return mount(CommunityMeetingFlyerView, {
		global: {
			plugins: [pinia],
			stubs: {
				MeetingFormModal: true,
				teleport: { template: '<div><slot /></div>' },
			},
		},
	});
}

const buttonByText = (wrapper: ReturnType<typeof mount>, text: string) =>
	wrapper.findAll('button').find((b) => b.text().includes(text));

describe('CommunityMeetingFlyerView', () => {
	beforeEach(() => {
		localStorage.clear();
	});

	afterEach(() => {
		cleanupMocks();
	});

	describe("'custom' style — the saved design", () => {
		it('renders the custom canvas as the printable area', async () => {
			const wrapper = mountFlyer({ style: 'custom' });
			await flushPromises();

			const canvas = wrapper.find('#printable-area');
			expect(canvas.exists()).toBe(true);
			// The print rule for this flavour is anchored on the attribute: without it
			// the canvas would print at the legacy 210mm sizing instead of 850px+scale.
			expect(canvas.attributes('data-custom-canvas')).toBeDefined();
		});

		it('renders the default white cards when nothing was saved', async () => {
			const wrapper = mountFlyer({ style: 'custom' });
			await flushPromises();

			const dateBlock = wrapper.find('[data-flyer-block="dateTime"]');
			expect(dateBlock.attributes('style')).toContain('--fb-bg: rgba(255, 255, 255, 0.85)');
		});

		it("paints the community's saved theme and block styles", async () => {
			// The retreat's lesson: a prop the published view forgets to pass doesn't
			// look like a bug — the canvas falls back to its defaults and the saved
			// design silently reads as "nothing was customised".
			const wrapper = mountFlyer({
				style: 'custom',
				community: {
					flyerOptions: {
						layoutVersion: 2,
						images: {},
						theme: { textColor: '#ffffff', headingColor: '#fde68a', textShadow: true },
						blockStyles: { dateTime: { backgroundColor: '#ffffff', backgroundOpacity: 0 } },
						hiddenTexts: [],
					},
				},
			});
			await flushPromises();

			const dateBlock = wrapper.find('[data-flyer-block="dateTime"]');
			expect(dateBlock.attributes('style')).toContain('--fb-text: #ffffff');
			// The saved override clears the date's card: text straight on the artwork.
			expect(dateBlock.attributes('style')).toContain('--fb-bg: transparent');
			// A block without an override still follows the saved theme.
			const description = wrapper.find('[data-flyer-block="description"]');
			expect(description.attributes('style')).toContain('--fb-text: #ffffff');
		});

		it('hides the background picker (the editor owns the background)', async () => {
			const custom = mountFlyer({ style: 'custom' });
			await flushPromises();
			expect(buttonByText(custom, 'Fondo')).toBeUndefined();

			const poster = mountFlyer({ style: 'poster' });
			await flushPromises();
			expect(buttonByText(poster, 'Fondo')).toBeDefined();
		});

		it('navigates to the design editor', async () => {
			const wrapper = mountFlyer({ style: 'custom' });
			await flushPromises();

			await wrapper.find('button[title="Editar diseño"]').trigger('click');
			expect(mockRouterPush).toHaveBeenCalledWith({
				name: 'community-meeting-flyer-edit',
				params: { id: 'community-1', meetingId: 'meeting-1' },
			});
		});
	});

	describe('legacy styles', () => {
		it('renders the default flyer without the custom canvas', async () => {
			const wrapper = mountFlyer({ style: 'default' });
			await flushPromises();

			const canvas = wrapper.find('#printable-area');
			expect(canvas.exists()).toBe(true);
			// data-custom-canvas is what re-targets print sizing; the legacy styles
			// must keep the generic 210mm rule.
			expect(canvas.attributes('data-custom-canvas')).toBeUndefined();
			expect(wrapper.find('[data-flyer-block]').exists()).toBe(false);
		});
	});
});
