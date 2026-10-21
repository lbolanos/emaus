import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { nextTick } from 'vue';
import type { ReceptionParticipant } from '@/services/api';

/**
 * specs/offline-mode FR-15b: the no-shows are cancelled on Saturday morning from
 * the Faltan list — with an explicit `{ isCancelled, contextRetreatId }` body,
 * never the full record, so the write can wait for signal.
 */

const mocks = vi.hoisted(() => ({
	getReceptionStats: vi.fn(),
	checkInParticipant: vi.fn(),
	setParticipantCancelled: vi.fn(),
	canUpdate: { value: true },
}));

vi.mock('@/services/api', () => ({
	getReceptionStats: (...a: any[]) => mocks.getReceptionStats(...a),
	checkInParticipant: (...a: any[]) => mocks.checkInParticipant(...a),
	setParticipantCancelled: (...a: any[]) => mocks.setParticipantCancelled(...a),
	createPayment: vi.fn(),
}));

vi.mock('@/composables/useAuthPermissions', () => ({
	useAuthPermissions: () => ({
		hasPermission: (p: string) => p === 'participant:update' && mocks.canUpdate.value,
	}),
}));

vi.mock('@/services/realtime', () => ({
	getSocket: () => ({ connected: false, on: vi.fn(), off: vi.fn(), emit: vi.fn() }),
}));

vi.mock('vue-router', () => ({
	useRoute: () => ({ params: { id: 'retreat-1' } }),
	useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('lucide-vue-next', () => ({
	CheckCircle: { template: '<svg></svg>' },
	Clock: { template: '<svg></svg>' },
	Users: { template: '<svg></svg>' },
	Search: { template: '<svg></svg>' },
	Loader2: { template: '<svg></svg>' },
	RotateCcw: { template: '<svg></svg>' },
	X: { template: '<svg></svg>' },
	AlertCircle: { template: '<svg></svg>' },
	DollarSign: { template: '<svg></svg>' },
}));

const walker = (overrides: Partial<ReceptionParticipant>): ReceptionParticipant => ({
	retreatParticipantId: 'rp-1',
	participantId: 'p-1',
	idOnRetreat: 1,
	firstName: 'Daniel',
	lastName: 'Gómez',
	cellPhone: '',
	checkedIn: false,
	checkedInAt: null,
	totalPaid: 0,
	...overrides,
});

async function mountView() {
	const pinia = createPinia();
	setActivePinia(pinia);
	const { useRetreatStore } = await import('@/stores/retreatStore');
	const retreatStore = useRetreatStore();
	(retreatStore as any).retreats = [{ id: 'retreat-1', parish: 'Test', startDate: '2026-10-16' }];
	retreatStore.selectedRetreatId = 'retreat-1';
	const RecepcionView = (await import('../RecepcionView.vue')).default;
	const wrapper = mount(RecepcionView, { global: { plugins: [pinia] } });
	await flushPromises();
	await nextTick();
	return wrapper;
}

describe('RecepcionView — cancel who did not arrive', () => {
	beforeEach(() => {
		mocks.canUpdate.value = true;
		mocks.getReceptionStats.mockResolvedValue({
			total: 1,
			arrived: 0,
			pending: 1,
			pendingList: [walker({})],
			arrivedList: [],
		});
		mocks.setParticipantCancelled.mockResolvedValue({ id: 'p-1', isCancelled: true });
	});

	afterEach(() => {
		vi.restoreAllMocks();
		mocks.getReceptionStats.mockReset();
		mocks.setParticipantCancelled.mockReset();
	});

	it('cancels with the explicit body after confirming, then reloads the lists', async () => {
		vi.spyOn(window, 'confirm').mockReturnValue(true);
		const wrapper = await mountView();
		const calls = mocks.getReceptionStats.mock.calls.length;

		await wrapper.find('[data-testid="reception-cancel-no-show"]').trigger('click');
		await flushPromises();

		expect(window.confirm).toHaveBeenCalledWith('reception.cancelNoShowConfirm');
		expect(mocks.setParticipantCancelled).toHaveBeenCalledWith('p-1', 'retreat-1', true);
		expect(mocks.getReceptionStats.mock.calls.length).toBe(calls + 1);
	});

	it('does nothing when the confirmation is declined', async () => {
		vi.spyOn(window, 'confirm').mockReturnValue(false);
		const wrapper = await mountView();

		await wrapper.find('[data-testid="reception-cancel-no-show"]').trigger('click');
		await flushPromises();

		expect(mocks.setParticipantCancelled).not.toHaveBeenCalled();
	});

	it('is not offered without participant:update', async () => {
		mocks.canUpdate.value = false;
		const wrapper = await mountView();
		expect(wrapper.find('[data-testid="reception-cancel-no-show"]').exists()).toBe(false);
	});
});
