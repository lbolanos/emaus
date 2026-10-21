/**
 * Tests for SpecialCasesView.vue – the coordinator's inbox of "casos
 * especiales" (specs/special-case).
 *
 * Covers:
 *  - the list is exactly the active walkers flagged in this retreat (no
 *    cancelled walkers, no servers, no unflagged walkers), sorted by name
 *  - category and note per row; the pending counter
 *  - the load resets the shared participant filters before fetching
 *  - "Contactar" opens the mounted MessageDialog with the row's participant
 *  - removing the flag (real toggle) unflags with contextRetreatId and the
 *    row leaves the inbox after the refetch
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createMockParticipant } from '@/test/utils';

vi.mock('axios', () => {
	const instance = {
		get: vi.fn(() => Promise.resolve({ data: [] })),
		post: vi.fn(() => Promise.resolve({ data: {} })),
		put: vi.fn(() => Promise.resolve({ data: {} })),
		patch: vi.fn(() => Promise.resolve({ data: {} })),
		delete: vi.fn(() => Promise.resolve({ data: {} })),
		interceptors: {
			request: { use: vi.fn() },
			response: { use: vi.fn() },
		},
	};
	const mockAxios = {
		create: vi.fn(() => instance),
		defaults: { baseURL: '', withCredentials: false },
	};
	return { default: mockAxios, ...mockAxios };
});

vi.mock('@/utils/csrf', () => ({
	setupCsrfInterceptor: vi.fn(),
	getCsrfToken: vi.fn(async () => 'mock-csrf-token'),
}));

vi.mock('@/config/runtimeConfig', () => ({
	getApiUrl: vi.fn(() => 'http://localhost:3001/api'),
}));

vi.mock('@/services/telemetryService', () => ({
	telemetryService: {
		isTelemetryActive: vi.fn(() => false),
		trackApiCallTime: vi.fn(),
		trackError: vi.fn(),
	},
}));

// Interpolating t() so the counter's parameter is visible to the assertions.
vi.mock('vue-i18n', () => ({
	useI18n: () => ({
		t: (key: string, params?: Record<string, unknown>) =>
			params ? `${key}:${JSON.stringify(params)}` : key,
	}),
}));

vi.mock('@/components/MessageDialog.vue', () => ({
	default: {
		name: 'MessageDialog',
		props: ['open', 'context', 'retreatId', 'participant'],
		template: '<div data-testid="message-dialog" :data-open="String(open)" />',
	},
}));

import SpecialCasesView from '../SpecialCasesView.vue';

const RETREAT_ID = 'r1';

const ROWS = [
	createMockParticipant({ id: 'w-zoe', firstName: 'Zoé', lastName: 'Ruiz', type: 'walker', isCancelled: false, specialCase: true, specialCaseCategory: 'room', specialCaseNotes: 'viaja con su mamá', cellPhone: '5511112222' }),
	createMockParticipant({ id: 'w-ana', firstName: 'Ana', lastName: 'López', type: 'walker', isCancelled: false, specialCase: true, specialCaseCategory: 'health', specialCaseNotes: null, cellPhone: '5533334444' }),
	createMockParticipant({ id: 'w-plain', firstName: 'Beto', lastName: 'Sin', type: 'walker', isCancelled: false, specialCase: false }),
	createMockParticipant({ id: 'w-cancel', firstName: 'Carla', lastName: 'Baja', type: 'walker', isCancelled: true, specialCase: true, specialCaseCategory: 'other' }),
	createMockParticipant({ id: 's-flag', firstName: 'Sergio', lastName: 'Server', type: 'server', isCancelled: false, specialCase: true, specialCaseCategory: 'other' }),
];

let pinia: any;
let participantStore: any;

async function setup(rows: any[] = ROWS) {
	pinia = createPinia();
	setActivePinia(pinia);

	const { useAuthStore } = await import('@/stores/authStore');
	useAuthStore().userProfile = {
		permissions: [
			{ resource: 'participant', operation: 'update' },
			{ resource: 'participant', operation: 'health' },
		],
		roles: [],
	} as any;
	const { useRetreatStore } = await import('@/stores/retreatStore');
	useRetreatStore().selectRetreat(RETREAT_ID);

	const { useParticipantStore } = await import('@/stores/participantStore');
	participantStore = useParticipantStore();
	// A key another view left behind: it would hide walkers from the inbox.
	participantStore.filters.type = 'server';
	participantStore.fetchParticipants = vi.fn(async () => {
		participantStore.participants = rows.map((r) => ({ ...r }));
	});
	participantStore.updateParticipant = vi.fn().mockResolvedValue(undefined);

	const w = mount(SpecialCasesView, { global: { plugins: [pinia] } });
	await flushPromises();
	return w;
}

const rowNames = (w: any) =>
	w.findAll('[data-testid="special-case-row"]').map((r: any) => r.find('td').text().replace(/\s+/g, ' ').trim());

describe('SpecialCasesView', () => {
	afterEach(() => {
		vi.restoreAllMocks();
		(window.localStorage as any)?._reset?.();
	});

	beforeEach(() => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
	});

	it('resets the shared filters and fetches the selected retreat', async () => {
		await setup();
		expect(participantStore.fetchParticipants).toHaveBeenCalled();
		expect(participantStore.filters).toEqual({ retreatId: RETREAT_ID });
	});

	it('lists only active flagged walkers, sorted by name', async () => {
		const w = await setup();
		expect(rowNames(w)).toEqual(['Ana López', 'Zoé Ruiz']);
		expect(w.find('[data-testid="special-cases-count"]').text()).toBe(
			'specialCases.pendingCount:{"count":2}',
		);
	});

	it('shows category and note per row, and a placeholder when there is no note', async () => {
		const w = await setup();
		const [ana, zoe] = w.findAll('[data-testid="special-case-row"]');
		expect(ana.text()).toContain('specialCases.categories.health');
		expect(ana.text()).toContain('specialCases.noNotes');
		expect(ana.find('a[href="tel:5533334444"]').exists()).toBe(true);
		expect(zoe.text()).toContain('specialCases.categories.room');
		expect(zoe.text()).toContain('viaja con su mamá');
	});

	it('shows the empty state when nobody is flagged', async () => {
		const w = await setup([ROWS[2]]);
		expect(w.find('[data-testid="special-cases-empty"]').exists()).toBe(true);
		expect(w.findAll('[data-testid="special-case-row"]')).toHaveLength(0);
	});

	it('from the phone says it needs a connection, not "nobody flagged" (specs/offline-mode)', async () => {
		// What the device serves: the same walkers without the health-regime fields.
		const stripped = ROWS.map(({ specialCase, specialCaseCategory, specialCaseNotes, ...rest }: any) => rest);
		const w = await setup(stripped);
		participantStore.fromCache = true;
		await flushPromises();
		expect(w.find('[data-testid="health-needs-connection"]').text()).toContain(
			'offline.specialCasesNeedConnection',
		);
		expect(w.find('[data-testid="special-cases-empty"]').exists()).toBe(false);
		expect(w.find('[data-testid="special-cases-count"]').exists()).toBe(false);
	});

	it('"Contactar" opens the mounted MessageDialog with the row participant', async () => {
		const w = await setup();
		const dialog = w.findComponent({ name: 'MessageDialog' });
		expect(dialog.exists()).toBe(true);
		expect(dialog.props('open')).toBe(false);

		await w.findAll('[data-testid="special-case-contact"]')[1].trigger('click');

		expect(dialog.props('open')).toBe(true);
		expect(dialog.props('participant').id).toBe('w-zoe');
		expect(dialog.props('retreatId')).toBe(RETREAT_ID);
		expect(dialog.props('context')).toBe('retreat');
	});

	it('removing the flag unflags with contextRetreatId and drops the row', async () => {
		vi.spyOn(window, 'confirm').mockReturnValue(true);
		const w = await setup();
		// What the API returns after the unflag: Ana no longer flagged.
		participantStore.fetchParticipants.mockImplementation(async () => {
			participantStore.participants = ROWS.map((r) =>
				r.id === 'w-ana' ? { ...r, specialCase: false, specialCaseCategory: null } : { ...r },
			);
		});

		const anaRow = w.findAll('[data-testid="special-case-row"]')[0];
		await anaRow.find('[data-testid="special-case-toggle"]').trigger('click');
		await flushPromises();

		expect(participantStore.updateParticipant).toHaveBeenCalledWith('w-ana', {
			specialCase: false,
			contextRetreatId: RETREAT_ID,
		});
		expect(rowNames(w)).toEqual(['Zoé Ruiz']);
		expect(w.find('[data-testid="special-cases-count"]').text()).toBe(
			'specialCases.pendingCount:{"count":1}',
		);
	});
});
