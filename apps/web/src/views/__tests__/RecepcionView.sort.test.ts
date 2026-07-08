import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { nextTick } from 'vue';
import type { ReceptionParticipant, ReceptionStats } from '@/services/api';

// ── Mocks ────────────────────────────────────────────────────────────────

vi.mock('axios', () => ({
	default: {
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
	},
}));

vi.mock('@/utils/csrf', () => ({
	setupCsrfInterceptor: vi.fn(),
	getCsrfToken: vi.fn(async () => 'mock-csrf-token'),
}));

vi.mock('@/config/runtimeConfig', () => ({
	getApiUrl: vi.fn(() => 'http://localhost:3001/api'),
}));

const getReceptionStatsMock = vi.fn();
const checkInParticipantMock = vi.fn();

vi.mock('@/services/api', () => ({
	getReceptionStats: (...args: any[]) => getReceptionStatsMock(...args),
	checkInParticipant: (...args: any[]) => checkInParticipantMock(...args),
}));

vi.mock('@/services/realtime', () => ({
	getSocket: () => ({
		connected: false,
		on: vi.fn(),
		off: vi.fn(),
		emit: vi.fn(),
	}),
}));

vi.mock('vue-router', () => ({
	useRoute: () => ({ params: { id: 'retreat-1' } }),
	useRouter: () => ({ push: vi.fn() }),
}));

// Override the global lucide-vue-next mock with the icons RecepcionView uses.
vi.mock('lucide-vue-next', () => ({
	CheckCircle: { name: 'CheckCircle', template: '<svg></svg>' },
	Clock: { name: 'Clock', template: '<svg></svg>' },
	Users: { name: 'Users', template: '<svg></svg>' },
	Search: { name: 'Search', template: '<svg></svg>' },
	Loader2: { name: 'Loader2', template: '<svg></svg>' },
	RotateCcw: { name: 'RotateCcw', template: '<svg></svg>' },
	X: { name: 'X', template: '<svg></svg>' },
	AlertCircle: { name: 'AlertCircle', template: '<svg></svg>' },
	DollarSign: { name: 'DollarSign', template: '<svg></svg>' },
}));

// ── Fixtures ─────────────────────────────────────────────────────────────

function makeParticipant(overrides: Partial<ReceptionParticipant> = {}): ReceptionParticipant {
	return {
		retreatParticipantId: `rp-${Math.random().toString(36).slice(2, 8)}`,
		participantId: `p-${Math.random().toString(36).slice(2, 8)}`,
		idOnRetreat: 0,
		firstName: '',
		lastName: '',
		cellPhone: '',
		checkedIn: false,
		checkedInAt: null,
		totalPaid: 0,
		...overrides,
	};
}

const pendingFixture: ReceptionParticipant[] = [
	makeParticipant({ retreatParticipantId: 'rp-3', firstName: 'Carlos', lastName: 'Zapata', idOnRetreat: 3 }),
	makeParticipant({ retreatParticipantId: 'rp-1', firstName: 'Ana', lastName: 'García', idOnRetreat: 1 }),
	makeParticipant({ retreatParticipantId: 'rp-2', firstName: 'Beto', lastName: 'álvarez', idOnRetreat: 2 }),
	makeParticipant({ retreatParticipantId: 'rp-4', firstName: 'Diana', lastName: 'Pérez', idOnRetreat: 10 }),
];

const arrivedFixture: ReceptionParticipant[] = [
	makeParticipant({
		retreatParticipantId: 'rp-a2',
		firstName: 'Yolanda',
		lastName: 'López',
		idOnRetreat: 8,
		checkedIn: true,
		checkedInAt: '2026-05-08T12:00:00Z',
	}),
	makeParticipant({
		retreatParticipantId: 'rp-a1',
		firstName: 'Xavier',
		lastName: 'Aguirre',
		idOnRetreat: 5,
		checkedIn: true,
		checkedInAt: '2026-05-08T11:30:00Z',
	}),
];

const statsFixture: ReceptionStats = {
	total: pendingFixture.length + arrivedFixture.length,
	arrived: arrivedFixture.length,
	pending: pendingFixture.length,
	pendingList: pendingFixture,
	arrivedList: arrivedFixture,
};

// ── Helpers ──────────────────────────────────────────────────────────────

async function mountView() {
	const pinia = createPinia();
	setActivePinia(pinia);

	const { useRetreatStore } = await import('@/stores/retreatStore');
	const retreatStore = useRetreatStore();
	(retreatStore as any).retreats = [
		{
			id: 'retreat-1',
			parish: 'Test',
			startDate: '2026-05-08',
			walkerArrivalTime: '08:00',
		},
	];
	retreatStore.selectedRetreatId = 'retreat-1';
	(retreatStore as any).fetchRetreat = vi.fn().mockResolvedValue(undefined);

	const RecepcionView = (await import('../RecepcionView.vue')).default;

	const wrapper = mount(RecepcionView, {
		global: {
			plugins: [pinia],
		},
	});
	await flushPromises();
	await nextTick();
	return wrapper;
}

function getPendingNames(wrapper: any): string[] {
	const items = wrapper.findAll('ul')[0]?.findAll('li') ?? [];
	return items.map((li: any) => {
		const text = li.text().replace(/\s+/g, ' ').trim();
		// Each row is "<idOnRetreat> <firstName> <lastName> [phone] [Llegó]"
		// Extract the name segment between the id and any trailing button label.
		const m = text.match(/^\S+\s+(.*?)(?:\s+(?:reception\.arrivedButton|Llegó|\d{2,}.*))?$/);
		return m ? m[1] : text;
	});
}

// ── Tests ────────────────────────────────────────────────────────────────

describe('RecepcionView - sort selector', () => {
	beforeEach(() => {
		(window.localStorage as any)._reset?.();
		getReceptionStatsMock.mockResolvedValue({ ...statsFixture });
		checkInParticipantMock.mockResolvedValue({ checkedIn: true, checkedInAt: '2026-05-08T12:00:00Z' });
	});

	afterEach(() => {
		getReceptionStatsMock.mockReset();
		checkInParticipantMock.mockReset();
	});

	it('orders pending list by lastName by default (case- and accent-insensitive)', async () => {
		const wrapper = await mountView();

		const lis = wrapper.findAll('ul')[0].findAll('li');
		const names = lis.map((li: any) => li.text());

		// Expected order: álvarez, García, Pérez, Zapata
		expect(names[0]).toContain('álvarez');
		expect(names[1]).toContain('García');
		expect(names[2]).toContain('Pérez');
		expect(names[3]).toContain('Zapata');
	});

	it('orders by firstName when selector changes', async () => {
		const wrapper = await mountView();

		const select = wrapper.find('select');
		await select.setValue('firstName');
		await nextTick();

		const lis = wrapper.findAll('ul')[0].findAll('li');
		const names = lis.map((li: any) => li.text());

		// Expected: Ana, Beto, Carlos, Diana
		expect(names[0]).toContain('Ana');
		expect(names[1]).toContain('Beto');
		expect(names[2]).toContain('Carlos');
		expect(names[3]).toContain('Diana');
	});

	it('orders by idOnRetreat numerically when selected', async () => {
		const wrapper = await mountView();

		const select = wrapper.find('select');
		await select.setValue('idOnRetreat');
		await nextTick();

		const lis = wrapper.findAll('ul')[0].findAll('li');
		const names = lis.map((li: any) => li.text());

		// Expected: 1 (Ana), 2 (Beto), 3 (Carlos), 10 (Diana)
		expect(names[0]).toContain('Ana');
		expect(names[1]).toContain('Beto');
		expect(names[2]).toContain('Carlos');
		expect(names[3]).toContain('Diana');
	});

	it('persists the selected sort to localStorage', async () => {
		const wrapper = await mountView();

		const select = wrapper.find('select');
		await select.setValue('firstName');
		await nextTick();

		expect(window.localStorage.getItem('reception.sortBy')).toBe('firstName');
	});

	it('reads the persisted sort from localStorage on mount', async () => {
		window.localStorage.setItem('reception.sortBy', 'idOnRetreat');

		const wrapper = await mountView();

		const select = wrapper.find('select');
		expect((select.element as HTMLSelectElement).value).toBe('idOnRetreat');
	});

	it('also applies the selected sort to the arrived list', async () => {
		const wrapper = await mountView();

		// Open arrived section
		const toggle = wrapper.findAll('button').find((b: any) =>
			b.text().includes('reception.arrivedSection') || b.text().includes('Ver llegados'),
		);
		expect(toggle, 'arrived toggle button should exist').toBeTruthy();
		await toggle!.trigger('click');
		await nextTick();

		// arrived list is the second <ul> on the page once expanded
		const uls = wrapper.findAll('ul');
		const arrivedUl = uls[uls.length - 1];
		const lis = arrivedUl.findAll('li');
		const names = lis.map((li: any) => li.text());

		// Default sort is lastName: Aguirre (Xavier), López (Yolanda)
		expect(names[0]).toContain('Aguirre');
		expect(names[1]).toContain('López');
	});
});
