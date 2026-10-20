import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';

const prep = vi.hoisted(() => ({
	prepareRetreat: vi.fn(),
	getPrepared: vi.fn(),
	canPrepare: vi.fn(),
}));
vi.mock('@/offline/prepareRetreat', () => prep);

import OfflinePrepareCard from '../OfflinePrepareCard.vue';
import { _resetConnectivityForTests } from '@/offline/connectivity';

/** specs/offline-mode D4: the Thursday-at-home button on the retreat dashboard. */

const retreat = { id: 'r1', startDate: '2026-10-16', endDate: '2026-10-18' };

describe('OfflinePrepareCard', () => {
	beforeEach(() => {
		_resetConnectivityForTests(true);
		prep.canPrepare.mockReturnValue(true);
		prep.getPrepared.mockResolvedValue(null);
		prep.prepareRetreat.mockResolvedValue({ at: 1, ok: 12, failed: 0, bytes: 4096 });
		delete window.EMAUS_RUNTIME_CONFIG;
	});
	afterEach(() => vi.clearAllMocks());

	it('is hidden outside the window', () => {
		prep.canPrepare.mockReturnValue(false);
		const wrapper = mount(OfflinePrepareCard, { props: { retreat } });
		expect(wrapper.find('[data-testid="offline-prepare-card"]').exists()).toBe(false);
	});

	it('is hidden when offline mode is switched off', () => {
		window.EMAUS_RUNTIME_CONFIG = { apiUrl: '/api', offlineMode: false };
		const wrapper = mount(OfflinePrepareCard, { props: { retreat } });
		expect(wrapper.find('[data-testid="offline-prepare-card"]').exists()).toBe(false);
	});

	it('says the phone has nothing yet, then prepares on demand', async () => {
		const wrapper = mount(OfflinePrepareCard, { props: { retreat } });
		await flushPromises();
		expect(wrapper.find('[data-testid="offline-prepare-status"]').text()).toBe('offline.prepare.notYet');

		prep.getPrepared.mockResolvedValue({ at: Date.now(), ok: 12, failed: 0, bytes: 4096 });
		await wrapper.find('[data-testid="offline-prepare-button"]').trigger('click');
		await flushPromises();

		expect(prep.prepareRetreat).toHaveBeenCalledWith('r1', expect.any(Function));
		expect(wrapper.find('[data-testid="offline-prepare-status"]').text()).toBe('offline.prepare.done');
	});

	it('the button needs signal', async () => {
		_resetConnectivityForTests(false);
		const wrapper = mount(OfflinePrepareCard, { props: { retreat } });
		await flushPromises();
		expect(wrapper.find('[data-testid="offline-prepare-button"]').attributes('disabled')).toBeDefined();
	});
});
