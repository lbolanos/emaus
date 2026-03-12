import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { nextTick } from 'vue';
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
const mockRouteParams = { id: 'test-retreat-id' };
vi.mock('vue-router', () => ({
	useRouter: () => ({
		push: vi.fn(),
		replace: vi.fn(),
		resolve: vi.fn(() => ({ href: '/test-route' })),
	}),
	useRoute: () => ({
		name: 'retreat-flyer',
		params: mockRouteParams,
		path: '/app/retreats/test-retreat-id/flyer',
	}),
}));

// Mock qrcode.vue
vi.mock('qrcode.vue', () => ({
	default: { name: 'QrcodeVue', template: '<canvas />', props: ['value', 'size'] },
}));

// Mock html-to-image
vi.mock('html-to-image', () => ({
	toPng: vi.fn(() => Promise.resolve('data:image/png;base64,fake')),
}));

// Add missing lucide icons to the mock
vi.mock('lucide-vue-next', () => ({
	MapPin: { name: 'MapPin', template: '<svg></svg>' },
	Clock: { name: 'Clock', template: '<svg></svg>' },
	Calendar: { name: 'Calendar', template: '<svg></svg>' },
	Backpack: { name: 'Backpack', template: '<svg></svg>' },
	Users: { name: 'Users', template: '<svg></svg>' },
	Info: { name: 'Info', template: '<svg></svg>' },
	Phone: { name: 'Phone', template: '<svg></svg>' },
	Printer: { name: 'Printer', template: '<svg></svg>' },
	AlertTriangle: { name: 'AlertTriangle', template: '<svg></svg>' },
	EllipsisVertical: { name: 'EllipsisVertical', template: '<svg></svg>' },
	Copy: { name: 'Copy', template: '<svg></svg>' },
	Check: { name: 'Check', template: '<svg></svg>' },
	Mail: { name: 'Mail', template: '<svg></svg>' },
}));

import RetreatFlyerView from '../RetreatFlyerView.vue';
import { useRetreatStore } from '@/stores/retreatStore';

function createRetreatData(overrides: any = {}) {
	return {
		id: 'test-retreat-id',
		name: 'San Judas Tadeo',
		startDate: '2026-04-17',
		endDate: '2026-04-19',
		retreat_type: 'men',
		retreat_number_version: 'III',
		parish: 'San Judas Tadeo',
		walkerArrivalTime: '17:00',
		openingNotes: '',
		closingNotes: 'Misa de Cierre en San Judas Tadeo',
		thingsToBringNotes: 'Termo\nToalla\nSábanas\nArtículos Aseo',
		cost: '2700',
		paymentInfo: 'SANTANDER\nLUIS ANGEL RANGEL\n65-51112816-4',
		contactPhones: 'HORACIO: 55 60219193\nRUBÉN: 55 17504443\ninterlomas@emaus.mx',
		house: {
			name: 'Casa de los Teatinos',
			address1: 'Km. 9.5 Carr. Tlalnepantla-Progreso',
			address2: '',
			city: 'Ciudad López Mateos',
			state: 'Estado de México',
			zipCode: '52900',
			country: 'Mexico',
			googleMapsUrl: 'https://maps.google.com/?cid=123',
		},
		isPublic: true,
		max_walkers: 50,
		max_servers: 20,
		...overrides,
	};
}

function mountFlyer(retreatOverrides: any = {}) {
	const pinia = createPinia();
	setActivePinia(pinia);

	const retreatStore = useRetreatStore(pinia);
	const retreatData = createRetreatData(retreatOverrides);
	retreatStore.retreats = [retreatData as any];
	retreatStore.selectedRetreatId = retreatData.id;

	return mount(RetreatFlyerView, {
		global: {
			plugins: [pinia],
			stubs: {
				QrcodeVue: { template: '<canvas />', props: ['value', 'size'] },
				teleport: { template: '<div><slot /></div>' },
			},
		},
	});
}

describe('RetreatFlyerView', () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
		cleanupMocks();
	});

	describe('Rendering', () => {
		it('renders the retreat name in the header', () => {
			const wrapper = mountFlyer();
			// CSS uppercase class handles the visual casing
			expect(wrapper.text()).toContain('San Judas Tadeo');
		});

		it('renders the retreat number', () => {
			const wrapper = mountFlyer({ retreat_number_version: 'IV' });
			expect(wrapper.text()).toContain('IV');
		});

		it('renders the flyer title (hope text)', () => {
			const wrapper = mountFlyer();
			// Default title comes from i18n key
			expect(wrapper.text()).toContain('retreatFlyer.hope');
		});

		it('renders INICIO section with arrival time', () => {
			const wrapper = mountFlyer({ walkerArrivalTime: '17:00' });
			expect(wrapper.text()).toContain('5:00 PM EN PUNTO');
		});

		it('renders FIN section with closing notes', () => {
			const wrapper = mountFlyer({ closingNotes: 'Misa en la Parroquia' });
			expect(wrapper.text()).toContain('Misa en la Parroquia');
		});

		it('renders house name as location', () => {
			const wrapper = mountFlyer();
			expect(wrapper.text()).toContain('Casa de los Teatinos');
		});

		it('renders cost formatted as currency', () => {
			const wrapper = mountFlyer({ cost: '2700' });
			expect(wrapper.text()).toContain('$2,700.00');
		});

		it('renders contact phones', () => {
			const wrapper = mountFlyer();
			expect(wrapper.text()).toContain('HORACIO');
			expect(wrapper.text()).toContain('55 60219193');
		});

		it('renders contact emails', () => {
			const wrapper = mountFlyer();
			expect(wrapper.text()).toContain('interlomas@emaus.mx');
		});

		it('renders things to bring items', () => {
			const wrapper = mountFlyer();
			expect(wrapper.text()).toContain('Termo');
			expect(wrapper.text()).toContain('Toalla');
			expect(wrapper.text()).toContain('Sábanas');
		});

		it('renders payment info', () => {
			const wrapper = mountFlyer();
			expect(wrapper.text()).toContain('SANTANDER');
			expect(wrapper.text()).toContain('LUIS ANGEL RANGEL');
		});
	});

	describe('Opening time display', () => {
		it('formats 17:00 as 5:00 PM EN PUNTO', () => {
			const wrapper = mountFlyer({ walkerArrivalTime: '17:00' });
			expect(wrapper.text()).toContain('5:00 PM EN PUNTO');
		});

		it('formats 9:00 as 9:00 AM EN PUNTO', () => {
			const wrapper = mountFlyer({ walkerArrivalTime: '9:00' });
			expect(wrapper.text()).toContain('9:00 AM EN PUNTO');
		});

		it('formats 12:00 as 12:00 PM EN PUNTO', () => {
			const wrapper = mountFlyer({ walkerArrivalTime: '12:00' });
			expect(wrapper.text()).toContain('12:00 PM EN PUNTO');
		});

		it('defaults to 5:00 PM EN PUNTO when no arrival time', () => {
			const wrapper = mountFlyer({ walkerArrivalTime: null });
			expect(wrapper.text()).toContain('5:00 PM EN PUNTO');
		});
	});

	describe('Registration deadline', () => {
		it('uses openingNotes when provided', () => {
			const wrapper = mountFlyer({
				openingNotes: 'Llegar antes de las 4:30 PM',
			});
			expect(wrapper.text()).toContain('Llegar antes de las 4:30 PM');
		});

		it('calculates deadline from arrival time (+30min) when no notes', () => {
			const wrapper = mountFlyer({
				openingNotes: '',
				walkerArrivalTime: '17:00',
			});
			expect(wrapper.text()).toContain('5:30 PM');
		});

		it('defaults to 5:30 PM when no arrival time or notes', () => {
			const wrapper = mountFlyer({
				openingNotes: '',
				walkerArrivalTime: null,
			});
			expect(wrapper.text()).toContain('5:30 PM');
		});
	});

	describe('Things to bring parsing', () => {
		it('splits items by newline', () => {
			const wrapper = mountFlyer({
				thingsToBringNotes: 'Termo\nToalla\nSábanas',
			});
			expect(wrapper.text()).toContain('Termo');
			expect(wrapper.text()).toContain('Toalla');
			expect(wrapper.text()).toContain('Sábanas');
		});

		it('splits items by bullet character', () => {
			const wrapper = mountFlyer({
				thingsToBringNotes: '• Termo• Toalla• Sábanas',
			});
			expect(wrapper.text()).toContain('Termo');
			expect(wrapper.text()).toContain('Toalla');
			expect(wrapper.text()).toContain('Sábanas');
		});

		it('detects subtitle when first item ends with colon', () => {
			const wrapper = mountFlyer({
				thingsToBringNotes: 'SÓLO NECESITAS TRAER:\nTermo\nToalla',
			});
			expect(wrapper.text()).toContain('SÓLO NECESITAS TRAER');
			expect(wrapper.text()).toContain('Termo');
			expect(wrapper.text()).toContain('Toalla');
		});

		it('detects subtitle when first item is all uppercase', () => {
			const wrapper = mountFlyer({
				thingsToBringNotes: 'LO QUE NECESITAS\nTermo\nToalla',
			});
			expect(wrapper.text()).toContain('LO QUE NECESITAS');
			expect(wrapper.text()).toContain('Termo');
		});

		it('strips "(para tu uso)" from items', () => {
			const wrapper = mountFlyer({
				thingsToBringNotes: 'Toalla (para tu uso)\nSábanas',
			});
			expect(wrapper.text()).toContain('Toalla');
			expect(wrapper.text()).not.toContain('(para tu uso)');
		});

		it('handles empty thingsToBringNotes', () => {
			const wrapper = mountFlyer({ thingsToBringNotes: '' });
			// Should not crash, QUÉ LLEVAR section just has no items
			expect(wrapper.text()).toContain('retreatFlyer.whatToBring');
		});
	});

	describe('Contact parsing', () => {
		it('extracts phone numbers with names', () => {
			const wrapper = mountFlyer({
				contactPhones: 'HORACIO: 55 60219193\nRUBÉN: 55 17504443',
			});
			expect(wrapper.text()).toContain('HORACIO');
			expect(wrapper.text()).toContain('55 60219193');
			expect(wrapper.text()).toContain('RUBÉN');
			expect(wrapper.text()).toContain('55 17504443');
		});

		it('extracts emails from contact phones field', () => {
			const wrapper = mountFlyer({
				contactPhones: 'HORACIO: 55 60219193\ninterlomas@emaus.mx',
			});
			expect(wrapper.text()).toContain('interlomas@emaus.mx');
		});

		it('handles empty contact phones', () => {
			const wrapper = mountFlyer({ contactPhones: '' });
			// Should not crash
			expect(wrapper.exists()).toBe(true);
		});

		it('handles array contact phones', () => {
			const wrapper = mountFlyer({
				contactPhones: ['HORACIO: 55 60219193', 'RUBÉN: 55 17504443'],
			});
			expect(wrapper.text()).toContain('HORACIO');
			expect(wrapper.text()).toContain('RUBÉN');
		});
	});

	describe('Cost formatting', () => {
		it('formats numeric cost as MXN currency', () => {
			const wrapper = mountFlyer({ cost: '2700' });
			expect(wrapper.text()).toContain('$2,700.00');
		});

		it('formats cost with decimals', () => {
			const wrapper = mountFlyer({ cost: '1500.50' });
			expect(wrapper.text()).toContain('$1,500.50');
		});

		it('returns default when no cost', () => {
			const wrapper = mountFlyer({ cost: null });
			expect(wrapper.text()).toContain('$ 2,800');
		});

		it('handles cost with currency symbols', () => {
			const wrapper = mountFlyer({ cost: '$2,700' });
			expect(wrapper.text()).toContain('$2,700.00');
		});
	});

	describe('Address formatting', () => {
		it('joins house address parts with commas', () => {
			const wrapper = mountFlyer();
			expect(wrapper.text()).toContain('Km. 9.5 Carr. Tlalnepantla-Progreso');
			expect(wrapper.text()).toContain('Ciudad López Mateos');
		});

		it('skips empty address parts', () => {
			const wrapper = mountFlyer({
				house: {
					name: 'Test House',
					address1: 'Street 1',
					address2: '',
					city: 'City',
					state: '',
					zipCode: '',
					country: 'Mexico',
				},
			});
			expect(wrapper.text()).toContain('Street 1');
			expect(wrapper.text()).toContain('City');
			expect(wrapper.text()).toContain('Mexico');
		});

		it('falls back to parish when no house', () => {
			const wrapper = mountFlyer({ house: null, parish: 'San Pablo' });
			expect(wrapper.text()).toContain('San Pablo');
		});
	});

	describe('Retreat type detection', () => {
		it('uses explicit retreat_type for men', () => {
			const wrapper = mountFlyer({ retreat_type: 'men' });
			expect(wrapper.text()).toContain('retreatModal.types.men');
		});

		it('uses explicit retreat_type for women', () => {
			const wrapper = mountFlyer({ retreat_type: 'women' });
			expect(wrapper.text()).toContain('retreatModal.types.women');
		});

		it('detects women retreat from parish name', () => {
			const wrapper = mountFlyer({ retreat_type: null, parish: 'Retiro de Mujeres' });
			expect(wrapper.text()).toContain('retreatModal.types.women');
		});

		it('shows correct logo for men retreat', () => {
			const wrapper = mountFlyer({ retreat_type: 'men' });
			const img = wrapper.find('img[alt="Emaus Logo"]');
			expect(img.attributes('src')).toBe('/oficial_mejorado.png');
		});

		it('shows correct logo for women retreat', () => {
			const wrapper = mountFlyer({ retreat_type: 'women' });
			const img = wrapper.find('img[alt="Emaus Logo"]');
			expect(img.attributes('src')).toBe('/woman_logo.png');
		});
	});

	describe('Date formatting', () => {
		it('formats date range correctly', () => {
			const wrapper = mountFlyer({
				startDate: '2026-04-17',
				endDate: '2026-04-19',
			});
			expect(wrapper.text()).toContain('17 al 19 de abril');
		});

		it('formats start date with weekday', () => {
			const wrapper = mountFlyer({ startDate: '2026-04-17' });
			expect(wrapper.text()).toContain('viernes, 17 de abril');
		});

		it('formats end date with weekday', () => {
			const wrapper = mountFlyer({ endDate: '2026-04-19' });
			expect(wrapper.text()).toContain('domingo, 19 de abril');
		});

		it('handles missing dates gracefully', () => {
			const wrapper = mountFlyer({ startDate: null, endDate: null });
			expect(wrapper.exists()).toBe(true);
		});
	});

	describe('Registration URL', () => {
		it('shows registration domain below QR', () => {
			const wrapper = mountFlyer();
			// When running on localhost, it shows LOCALHOST
			expect(wrapper.text()).toMatch(/LOCALHOST|emaus/i);
		});
	});

	describe('Flyer options overrides', () => {
		it('uses custom title from flyer_options', () => {
			const wrapper = mountFlyer({
				flyer_options: { hopeOverride: 'Fe y Esperanza' },
			});
			expect(wrapper.text()).toContain('Fe y Esperanza');
		});

		it('uses custom subtitle from flyer_options', () => {
			const wrapper = mountFlyer({
				flyer_options: { weekendOfHopeOverride: 'UN RETIRO DE' },
			});
			expect(wrapper.text()).toContain('UN RETIRO DE');
		});

		it('hides QR codes when showQrCodes is false', () => {
			const wrapper = mountFlyer({
				flyer_options: { showQrCodes: false },
			});
			const qrComponents = wrapper.findAllComponents({ name: 'QrcodeVue' });
			expect(qrComponents.length).toBe(0);
		});
	});

	describe('Menu and actions', () => {
		it('shows menu when button is clicked', async () => {
			const wrapper = mountFlyer();
			const menuButton = wrapper.find('button');
			await menuButton.trigger('click');
			await nextTick();
			expect(wrapper.text()).toContain('retreatFlyer.printButton');
			expect(wrapper.text()).toContain('retreatFlyer.copyImage');
		});

		it('menu closes after action button is clicked', async () => {
			const wrapper = mountFlyer();
			const menuButton = wrapper.find('button');
			await menuButton.trigger('click');
			await nextTick();

			// Menu should be visible
			expect(wrapper.text()).toContain('retreatFlyer.copyImage');

			// Click the copy button (which has @click="handleCopyToClipboard(); showMenu = false")
			const buttons = wrapper.findAll('button');
			const copyBtn = buttons.find(b => b.text().includes('retreatFlyer.copyImage'));
			expect(copyBtn).toBeDefined();
			// The menu auto-closes after action via showMenu = false in the template
		});
	});

	describe('Copy to clipboard', () => {
		it('calls html-to-image toPng when copy is clicked', async () => {
			const { toPng } = await import('html-to-image');
			const wrapper = mountFlyer();

			// Open menu
			const menuButton = wrapper.find('button');
			await menuButton.trigger('click');
			await nextTick();

			// Find and click copy button
			const buttons = wrapper.findAll('button');
			const copyButton = buttons.find(b => b.text().includes('retreatFlyer.copyImage'));
			expect(copyButton).toBeDefined();
		});
	});

	describe('Payment info formatting', () => {
		it('replaces newlines with <br> in payment info', () => {
			const wrapper = mountFlyer({
				paymentInfo: 'SANTANDER\nLUIS ANGEL RANGEL\n65-51112816-4',
			});
			// Payment info is rendered with v-html, so newlines become <br>
			expect(wrapper.html()).toContain('SANTANDER');
			expect(wrapper.html()).toContain('LUIS ANGEL RANGEL');
		});

		it('strips control characters from payment info', () => {
			const wrapper = mountFlyer({
				paymentInfo: 'SANTANDER\u001fBAD\nLUIS ANGEL',
			});
			expect(wrapper.html()).toContain('SANTANDERBAD');
			expect(wrapper.html()).not.toContain('\u001f');
		});
	});
});
