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

vi.mock('lucide-vue-next', () => ({
	CheckCircle: { name: 'CheckCircle', template: '<svg></svg>' },
	Clock: { name: 'Clock', template: '<svg></svg>' },
	Users: { name: 'Users', template: '<svg></svg>' },
	Search: { name: 'Search', template: '<svg></svg>' },
	Loader2: { name: 'Loader2', template: '<svg></svg>' },
	RotateCcw: { name: 'RotateCcw', template: '<svg></svg>' },
	X: { name: 'X', template: '<svg></svg>' },
	AlertCircle: { name: 'AlertCircle', template: '<svg></svg>' },
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
	makeParticipant({ firstName: 'Ana', lastName: 'García', idOnRetreat: 1, totalPaid: 1500 }),
	makeParticipant({ firstName: 'Beto', lastName: 'Núñez', idOnRetreat: 2, totalPaid: 0 }),
];

const arrivedFixture: ReceptionParticipant[] = [
	makeParticipant({
		firstName: 'Carla',
		lastName: 'Ruiz',
		idOnRetreat: 3,
		checkedIn: true,
		checkedInAt: '2026-05-08T12:00:00Z',
		totalPaid: 2750.5,
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
		{ id: 'retreat-1', parish: 'Test', startDate: '2026-05-08', walkerArrivalTime: '08:00' },
	];
	retreatStore.selectedRetreatId = 'retreat-1';
	(retreatStore as any).fetchRetreat = vi.fn().mockResolvedValue(undefined);

	const RecepcionView = (await import('../RecepcionView.vue')).default;

	const wrapper = mount(RecepcionView, { global: { plugins: [pinia] } });
	await flushPromises();
	await nextTick();
	return wrapper;
}

// ── Tests ────────────────────────────────────────────────────────────────

describe('RecepcionView - total pagado', () => {
	beforeEach(() => {
		(window.localStorage as any)._reset?.();
		getReceptionStatsMock.mockResolvedValue({ ...statsFixture });
		checkInParticipantMock.mockResolvedValue({ checkedIn: true, checkedInAt: '2026-05-08T12:00:00Z' });
	});

	afterEach(() => {
		getReceptionStatsMock.mockReset();
		checkInParticipantMock.mockReset();
	});

	it('muestra el monto pagado formateado en la lista de pendientes', async () => {
		const wrapper = await mountView();

		const pendingLis = wrapper.findAll('ul')[0].findAll('li');
		// Ana García ($1,500) viene antes que Beto Núñez por apellido
		const ana = pendingLis.find((li: any) => li.text().includes('García'));
		expect(ana, 'Ana row should exist').toBeTruthy();
		expect(ana!.text()).toContain('$1,500');
	});

	it('muestra $0 cuando el caminante no ha pagado', async () => {
		const wrapper = await mountView();

		const pendingLis = wrapper.findAll('ul')[0].findAll('li');
		const beto = pendingLis.find((li: any) => li.text().includes('Núñez'));
		expect(beto, 'Beto row should exist').toBeTruthy();
		expect(beto!.text()).toContain('$0');
	});

	it('muestra el total pagado en la lista de llegados con decimales', async () => {
		const wrapper = await mountView();

		// Abrir sección de llegados
		const toggle = wrapper.findAll('button').find((b: any) =>
			b.text().includes('reception.arrivedSection') || b.text().includes('Ver llegados'),
		);
		expect(toggle, 'arrived toggle should exist').toBeTruthy();
		await toggle!.trigger('click');
		await nextTick();

		const uls = wrapper.findAll('ul');
		const arrivedUl = uls[uls.length - 1];
		const carla = arrivedUl.findAll('li').find((li: any) => li.text().includes('Ruiz'));
		expect(carla, 'Carla row should exist').toBeTruthy();
		expect(carla!.text()).toContain('$2,750.5');
	});

	it('pinta el badge en verde cuando hay pago y en muted cuando no', async () => {
		const wrapper = await mountView();

		const pendingLis = wrapper.findAll('ul')[0].findAll('li');

		// Ana pagó $1,500 → badge verde
		const ana = pendingLis.find((li: any) => li.text().includes('García'));
		const anaBadge = ana!.findAll('span').find((s: any) => s.text().includes('$1,500'));
		expect(anaBadge, 'Ana badge should exist').toBeTruthy();
		expect(anaBadge!.classes().some((c: string) => c.includes('green'))).toBe(true);

		// Beto pagó $0 → badge muted, sin verde
		const beto = pendingLis.find((li: any) => li.text().includes('Núñez'));
		const betoBadge = beto!.findAll('span').find((s: any) => s.text().includes('$0'));
		expect(betoBadge, 'Beto badge should exist').toBeTruthy();
		expect(betoBadge!.classes().some((c: string) => c.includes('green'))).toBe(false);
		expect(betoBadge!.classes()).toContain('text-muted-foreground');
	});
});
