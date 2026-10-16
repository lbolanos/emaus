/**
 * Tests for ParticipantPaysAtHouseToggle.vue – inline "paga en la casa de
 * retiro" quick action for the palancas flow (specs/pays-at-house).
 *
 * Covers:
 *  - permission gate: without participant:update nothing renders
 *  - D1: only owing walkers (unpaid/partial/pays_at_house) see the toggle
 *  - D4: scholarship walkers never see it
 *  - confirm-gated write: updateParticipant carries paysAtHouse + the
 *    selected retreat as contextRetreatId, then refetches the list
 *  - marking vs unmarking payloads; cancel keeps the store untouched
 *  - store failure emits nothing and releases the saving flag
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import ParticipantPaysAtHouseToggle from '../ParticipantPaysAtHouseToggle.vue';

// Mock axios (not @/services/api) so every api.ts export stays real for the
// stores; no network happens because the store action is spied per test.
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

// In case a store resolves useRoute() at setup time.
vi.mock('vue-router', () => ({
	useRoute: () => ({ name: 'palancas', params: {}, query: {} }),
	useRouter: () => ({ push: vi.fn(), resolve: vi.fn(() => ({ href: '/' })) }),
}));

const OWING_WALKER = {
	id: 'p1',
	firstName: 'Juan',
	lastName: 'Perez',
	paysAtHouse: false,
	isScholarship: false,
	paymentStatus: 'unpaid',
};

let pinia: any;
let participantStore: any;

function mountToggle(participant: Record<string, unknown> = {}) {
	return mount(ParticipantPaysAtHouseToggle, {
		props: { participant: { ...OWING_WALKER, ...participant } },
		global: { plugins: [pinia] },
	});
}

async function grantParticipantUpdate(enabled = true) {
	const { useAuthStore } = await import('@/stores/authStore');
	const authStore = useAuthStore();
	authStore.userProfile = {
		permissions: enabled ? [{ resource: 'participant', operation: 'update' }] : [],
		roles: [],
	} as any;

	// hasPermission falls back to [] when no retreat is selected.
	const { useRetreatStore } = await import('@/stores/retreatStore');
	const retreatStore = useRetreatStore();
	if (!retreatStore.selectedRetreatId) retreatStore.selectRetreat('r1');
}

describe('ParticipantPaysAtHouseToggle', () => {
	beforeEach(async () => {
		pinia = createPinia();
		setActivePinia(pinia);
		await grantParticipantUpdate();
		const { useParticipantStore } = await import('@/stores/participantStore');
		participantStore = useParticipantStore();
		participantStore.updateParticipant = vi.fn().mockResolvedValue(undefined);
		participantStore.fetchParticipants = vi.fn().mockResolvedValue(undefined);
	});

	afterEach(() => {
		vi.restoreAllMocks();
		(window.localStorage as any)?._reset?.();
	});

	it('renders nothing without participant:update', async () => {
		await grantParticipantUpdate(false);
		const w = mountToggle();
		expect(w.find('button').exists()).toBe(false);
		expect(w.text()).toBe('');
	});

	it('renders nothing for a walker that owes nothing (D1)', async () => {
		const w = mountToggle({ paymentStatus: 'paid' });
		expect(w.find('button').exists()).toBe(false);
	});

	it('renders nothing for a scholarship walker (D4)', async () => {
		const w = mountToggle({ isScholarship: true });
		expect(w.find('button').exists()).toBe(false);
	});

	it('renders nothing without a selected retreat (write-target guard)', async () => {
		// Without a retreat the backend write would fall back to the primary
		// retreat row — a row the user is not looking at. The composable hides
		// the toggle instead.
		const { useRetreatStore } = await import('@/stores/retreatStore');
		useRetreatStore().selectedRetreatId = '';
		const w = mountToggle();
		expect(w.find('button').exists()).toBe(false);
	});

	it('renders for an owing walker and offers to mark', async () => {
		const w = mountToggle();
		const btn = w.find('button');
		expect(btn.exists()).toBe(true);
		expect(btn.attributes('title')).toBe('paymentManagement.balances.markPaysAtHouse');
	});

	it('also renders for partial and already-marked walkers (D1)', async () => {
		expect(mountToggle({ paymentStatus: 'partial' }).find('button').exists()).toBe(true);
		const marked = mountToggle({ paymentStatus: 'pays_at_house', paysAtHouse: true });
		expect(marked.find('button').attributes('title')).toBe(
			'paymentManagement.balances.removePaysAtHouse',
		);
	});

	it('marks with confirm and sends paysAtHouse + contextRetreatId, then refetches', async () => {
		const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
		const w = mountToggle();
		await w.find('button').trigger('click');
		await flushPromises();

		expect(participantStore.updateParticipant).toHaveBeenCalledWith('p1', {
			paysAtHouse: true,
			contextRetreatId: 'r1',
		});
		expect(participantStore.fetchParticipants).toHaveBeenCalled();
		expect(w.emitted('saved')).toEqual([['p1']]);
		confirmSpy.mockRestore();
	});

	it('unmarks an already-marked walker', async () => {
		const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
		const w = mountToggle({ paysAtHouse: true, paymentStatus: 'pays_at_house' });
		await w.find('button').trigger('click');
		await flushPromises();

		expect(participantStore.updateParticipant).toHaveBeenCalledWith('p1', {
			paysAtHouse: false,
			contextRetreatId: 'r1',
		});
		confirmSpy.mockRestore();
	});

	it('cancelling the confirm keeps the store untouched', async () => {
		const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
		const w = mountToggle();
		await w.find('button').trigger('click');
		await flushPromises();

		expect(participantStore.updateParticipant).not.toHaveBeenCalled();
		expect(w.emitted('saved')).toBeUndefined();
		confirmSpy.mockRestore();
	});

	it('emits nothing on store failure and releases the saving flag', async () => {
		participantStore.updateParticipant.mockRejectedValue(new Error('boom'));
		const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
		const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		const w = mountToggle();
		await w.find('button').trigger('click');
		await flushPromises();

		expect(w.emitted('saved')).toBeUndefined();
		expect(w.find('button').attributes('disabled')).toBeUndefined();
		consoleSpy.mockRestore();
		confirmSpy.mockRestore();
	});
});
