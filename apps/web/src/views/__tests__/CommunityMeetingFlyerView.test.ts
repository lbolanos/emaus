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

// The copy button captures the flyer with modern-screenshot (mocked: the real
// one needs a fully laid-out canvas).
vi.mock('modern-screenshot', () => ({
	domToBlob: vi.fn(async () => new Blob(['flyer-png'], { type: 'image/png' })),
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
	Share2: { name: 'Share2', template: '<svg></svg>' },
	Calendar: { name: 'Calendar', template: '<svg></svg>' },
	MapPin: { name: 'MapPin', template: '<svg></svg>' },
	FileText: { name: 'FileText', template: '<svg></svg>' },
}));

import CommunityMeetingFlyerView from '../CommunityMeetingFlyerView.vue';
import { useCommunityStore } from '@/stores/communityStore';
import { domToBlob } from 'modern-screenshot';

const domToBlobMock = vi.mocked(domToBlob);

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

		it("renders the flavour's boxless defaults when nothing was saved", async () => {
			const wrapper = mountFlyer({ style: 'custom' });
			await flushPromises();

			const dateBlock = wrapper.find('[data-flyer-block="dateTime"]');
			expect(dateBlock.attributes('style')).toContain('--fb-bg: transparent');
			expect(dateBlock.attributes('style')).toContain('--fb-text: #ffffff');
		});

		it("paints the community's saved theme and block styles", async () => {
			// The retreat's lesson: a prop the published view forgets to pass doesn't
			// look like a bug — the canvas falls back to its defaults and the saved
			// design silently reads as "nothing was customised". The fixture's values
			// are deliberately unlike this flavour's boxless defaults so a dropped
			// prop fails the test.
			const wrapper = mountFlyer({
				style: 'custom',
				community: {
					flyerOptions: {
						layoutVersion: 2,
						images: {},
						theme: { textColor: '#fef3c7', headingColor: '#93c5fd', textShadow: true },
						blockStyles: { dateTime: { backgroundColor: '#111827', backgroundOpacity: 70 } },
						hiddenTexts: [],
					},
				},
			});
			await flushPromises();

			const dateBlock = wrapper.find('[data-flyer-block="dateTime"]');
			expect(dateBlock.attributes('style')).toContain('--fb-text: #fef3c7');
			// The saved card reached the canvas, not just the theme colours.
			expect(dateBlock.attributes('style')).toContain('--fb-bg: rgba(17, 24, 39, 0.7)');
			// A block without an override still follows the saved theme.
			const description = wrapper.find('[data-flyer-block="description"]');
			expect(description.attributes('style')).toContain('--fb-text: #fef3c7');
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

	describe('copy/share image button (one capability per platform)', () => {
		// The phone bug (2026-09-21): the old flow awaited the capture BEFORE
		// clipboard.write, which burns the user gesture — and iOS Safari can't
		// write images to the clipboard at all. Now: clipboard on desktop (the
		// blob handed to ClipboardItem as a Promise, created with the click),
		// the OS share sheet on phones, download as the last resort.

		const savedClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
		const savedCanShare = Object.getOwnPropertyDescriptor(navigator, 'canShare');
		const savedShare = Object.getOwnPropertyDescriptor(navigator, 'share');
		const savedClipboardItem = Object.getOwnPropertyDescriptor(window, 'ClipboardItem');
		// Own spies are restored individually — vi.restoreAllMocks() would also
		// tear down the global setup mocks (ResizeObserver dies mid-mount).
		const ownRestores: Array<() => void> = [];

		afterEach(() => {
			const restore = (target: object, key: string, saved: PropertyDescriptor | undefined) => {
				if (saved) Object.defineProperty(target, key, saved);
				else delete (target as Record<string, unknown>)[key];
			};
			restore(navigator, 'clipboard', savedClipboard);
			restore(navigator, 'canShare', savedCanShare);
			restore(navigator, 'share', savedShare);
			restore(window, 'ClipboardItem', savedClipboardItem);
			ownRestores.splice(0).forEach((fn) => fn());
			domToBlobMock.mockClear();
		});

		/** Desktop-like clipboard: supports image/png writes. */
		const stubImageClipboard = (writeImpl?: (items: unknown[]) => Promise<void>) => {
			(window as unknown as Record<string, unknown>).ClipboardItem = class {
				static supports(type: string) {
					return type === 'image/png';
				}
				constructor(public items: Record<string, Promise<Blob>>) {}
			};
			const write = vi.fn(writeImpl ?? (async () => {}));
			Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { write } });
			return write;
		};

		/** Phone-like: no image clipboard (iOS), Web Share with files available. */
		const stubWebShare = (shareImpl?: () => Promise<void>) => {
			(window as unknown as Record<string, unknown>).ClipboardItem = undefined;
			const share = vi.fn(shareImpl ?? (async () => {}));
			Object.defineProperty(navigator, 'canShare', {
				configurable: true,
				value: (data: { files?: unknown[] }) => !!data?.files?.length,
			});
			Object.defineProperty(navigator, 'share', { configurable: true, value: share });
			return share;
		};

		/**
		 * happy-dom lays out at 0×0 (stub the rect) and its <img> elements never
		 * finish loading (force `complete`).
		 */
		const prepareFlyerElement = (wrapper: ReturnType<typeof mount>) => {
			const el = wrapper.find('#printable-area').element as HTMLElement;
			const rectSpy = vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({
				width: 850, height: 1200, top: 0, left: 0, right: 850, bottom: 1200, x: 0, y: 0,
				toJSON: () => ({}),
			} as DOMRect);
			ownRestores.push(() => rectSpy.mockRestore());
			el.querySelectorAll('img').forEach((img) =>
				Object.defineProperty(img, 'complete', { configurable: true, get: () => true }),
			);
			return el;
		};

		/** Click copy/share and let the handler's 200ms render-settle timer pass. */
		const flushCopy = async (wrapper: ReturnType<typeof mount>) => {
			const el = prepareFlyerElement(wrapper);
			const button = wrapper.findAll('button').find((b) =>
				b.text().includes('Copiar imagen') || b.text().includes('Compartir'),
			);
			await button!.trigger('click');
			await flushPromises();
			await new Promise((resolve) => setTimeout(resolve, 260));
			await flushPromises();
			return el;
		};

		it('desktop: hands ClipboardItem the capture as a Promise (the gesture survives)', async () => {
			const write = stubImageClipboard();

			const wrapper = mountFlyer({ style: 'default' });
			await flushPromises();
			const el = await flushCopy(wrapper);

			expect(write).toHaveBeenCalledTimes(1);
			const item = (write.mock.calls[0] as unknown[][])[0][0] as {
				items: Record<string, Promise<Blob>>;
			};
			// The anti-gesture-burn pattern: the ClipboardItem receives the Promise
			// (created synchronously with the click), never a pre-awaited blob.
			expect(item.items['image/png']).toBeInstanceOf(Promise);
			await expect(item.items['image/png']).resolves.toBeInstanceOf(Blob);
			expect(domToBlobMock).toHaveBeenCalledWith(el, expect.objectContaining({ scale: 2 }));
		});

		it('clipboard refused → downloads the PNG instead', async () => {
			stubImageClipboard(async () => {
				throw new DOMException('denied', 'NotAllowedError');
			});
			const anchorClick = vi
				.spyOn(HTMLAnchorElement.prototype, 'click')
				.mockImplementation(() => {});
			ownRestores.push(() => anchorClick.mockRestore());
			const urlSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-url');
			ownRestores.push(() => urlSpy.mockRestore());

			const wrapper = mountFlyer({ style: 'default' });
			await flushPromises();
			await flushCopy(wrapper);

			expect(anchorClick).toHaveBeenCalledTimes(1);
			expect(anchorClick.mock.instances[0]).toMatchObject({ download: 'flyer-reunion.png' });
		});

		it('phone: says "Compartir" and opens the OS share sheet with the PNG', async () => {
			const share = stubWebShare();

			const wrapper = mountFlyer({ style: 'default' });
			await flushPromises();

			// The label tells the phone user what the tap does before they tap.
			const button = wrapper.findAll('button').find((b) => b.text().includes('Compartir'));
			expect(button).toBeDefined();
			prepareFlyerElement(wrapper);
			await button!.trigger('click');
			await flushPromises();
			await new Promise((resolve) => setTimeout(resolve, 260));
			await flushPromises();

			expect(share).toHaveBeenCalledTimes(1);
			const arg = share.mock.calls[0][0] as { files: File[] };
			expect(arg.files).toHaveLength(1);
			expect(arg.files[0]).toBeInstanceOf(File);
			expect(arg.files[0].name).toBe('flyer-reunion.png');
			expect(arg.files[0].type).toBe('image/png');
		});

		it('phone: dismissing the share sheet stays silent (no download)', async () => {
			const share = stubWebShare(async () => {
				throw new DOMException('share canceled', 'AbortError');
			});
			const anchorClick = vi
				.spyOn(HTMLAnchorElement.prototype, 'click')
				.mockImplementation(() => {});
			ownRestores.push(() => anchorClick.mockRestore());

			const wrapper = mountFlyer({ style: 'default' });
			await flushPromises();
			await flushCopy(wrapper);

			expect(share).toHaveBeenCalledTimes(1);
			expect(anchorClick).not.toHaveBeenCalled();
		});
	});
});
